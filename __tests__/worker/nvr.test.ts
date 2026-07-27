/**
 * @jest-environment node
 */
import { NvrClient, validateRecording, type NvrClientLike } from "@/worker/monitors/nvr";

const mockFetch = jest.fn();
global.fetch = mockFetch as unknown as typeof fetch;

function textResponse(status: number, body: string, headers: Record<string, string> = {}) {
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: { get: (k: string) => headers[k.toLowerCase()] ?? null },
    text: async () => body,
  };
}

beforeEach(() => {
  mockFetch.mockReset();
});

describe("NvrClient — digest auth", () => {
  it("retries with a Digest Authorization header after a 401 challenge", async () => {
    mockFetch
      .mockResolvedValueOnce(
        textResponse(401, "", { "www-authenticate": 'Digest realm="NVD", qop="auth", nonce="abc123", opaque="xyz"' })
      )
      .mockResolvedValueOnce(textResponse(200, ""));

    const client = new NvrClient("10.0.0.1", "admin", "secret");
    await client.getChannelTitles();

    expect(mockFetch).toHaveBeenCalledTimes(2);
    const secondCallInit = mockFetch.mock.calls[1][1] as { headers: Record<string, string> };
    expect(secondCallInit.headers.Authorization).toMatch(/^Digest /);
    expect(secondCallInit.headers.Authorization).toContain('username="admin"');
  });

  it("does not retry when the first response is not a 401", async () => {
    mockFetch.mockResolvedValueOnce(textResponse(200, ""));

    const client = new NvrClient("10.0.0.1", "admin", "secret");
    await client.getChannelTitles();

    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("throws when a 401 has no WWW-Authenticate header", async () => {
    mockFetch.mockResolvedValueOnce(textResponse(401, ""));

    const client = new NvrClient("10.0.0.1", "admin", "secret");
    await expect(client.getChannelTitles()).rejects.toThrow(/WWW-Authenticate/);
  });
});

describe("NvrClient.getChannelTitles", () => {
  it("parses channel titles from the kv response", async () => {
    mockFetch.mockResolvedValueOnce(
      textResponse(200, 'table.ChannelTitle[0].Name="Entrada"\ntable.ChannelTitle[1].Name="Garagem"\n')
    );

    const client = new NvrClient("10.0.0.1", "admin", "secret");
    const channels = await client.getChannelTitles();

    expect(channels.get(0)).toBe("Entrada");
    expect(channels.get(1)).toBe("Garagem");
  });
});

describe("NvrClient.findMediaFiles", () => {
  it("returns sorted segments across findNextFile pages and destroys the object", async () => {
    mockFetch
      .mockResolvedValueOnce(textResponse(200, "result=obj1")) // factory.create
      .mockResolvedValueOnce(textResponse(200, "")) // findFile
      .mockResolvedValueOnce(
        // found=1 (< 100) tells the client this is the last page — no second findNextFile call
        textResponse(200, "found=1\nitems[0].StartTime=2024-01-01 10:00:00\nitems[0].EndTime=2024-01-01 10:05:00\n")
      )
      .mockResolvedValueOnce(textResponse(200, "")); // destroy

    const client = new NvrClient("10.0.0.1", "admin", "secret");
    const segments = await client.findMediaFiles(0, new Date(2024, 0, 1, 0, 0, 0), new Date(2024, 0, 1, 23, 59, 59));

    expect(segments).toHaveLength(1);
    expect(segments[0][0].getHours()).toBe(10);
    expect(segments[0][1].getMinutes()).toBe(5);
    expect(mockFetch).toHaveBeenCalledTimes(4);
    // last call is the destroy — confirms cleanup ran even on the happy path
    const lastCallUrl = mockFetch.mock.calls[3][0] as string;
    expect(lastCallUrl).toContain("action=destroy");
  });

  it("still destroys the object when findFile fails", async () => {
    mockFetch
      .mockResolvedValueOnce(textResponse(200, "result=obj1")) // factory.create
      .mockRejectedValueOnce(new Error("HTTP 500")) // findFile fails
      .mockResolvedValueOnce(textResponse(200, "")); // destroy

    const client = new NvrClient("10.0.0.1", "admin", "secret");
    await expect(client.findMediaFiles(0, new Date(), new Date())).rejects.toThrow("HTTP 500");
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });
});

describe("NvrClient.getStorageInfo", () => {
  it("computes usagePercent and healthy from raw disk fields", async () => {
    mockFetch.mockResolvedValueOnce(
      textResponse(
        200,
        "count=1\ninfo[0].State=Normal\ninfo[0].TotalBytes=1000\ninfo[0].UsedBytes=250\n"
      )
    );

    const client = new NvrClient("10.0.0.1", "admin", "secret");
    const info = await client.getStorageInfo();

    expect(info.usagePercent).toBeCloseTo(25);
    expect(info.healthy).toBe(true);
    expect(info.raw["info[0].State"]).toBe("Normal");
  });

  it("flags unhealthy when disk state is not Normal/InUse", async () => {
    mockFetch.mockResolvedValueOnce(
      textResponse(200, "count=1\ninfo[0].State=Error\ninfo[0].TotalBytes=1000\ninfo[0].UsedBytes=999\n")
    );

    const client = new NvrClient("10.0.0.1", "admin", "secret");
    const info = await client.getStorageInfo();

    expect(info.healthy).toBe(false);
  });
});

describe("validateRecording", () => {
  function fakeClient(overrides: Partial<NvrClientLike>): NvrClientLike {
    return {
      getChannelTitles: jest.fn().mockResolvedValue(new Map([[0, "Entrada"]])),
      findMediaFiles: jest.fn().mockResolvedValue([]),
      ...overrides,
    };
  }

  it("reports unreachable when the NVR itself cannot be reached", async () => {
    const client = fakeClient({ getChannelTitles: jest.fn().mockRejectedValue(new Error("timeout")) });

    const result = await validateRecording(client, 24, 5);

    expect(result.channelsTotal).toBe(0);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]).toMatchObject({ channel: -1, issueType: "unreachable" });
  });

  it("reports no_recordings when a channel has no segments in the window", async () => {
    const client = fakeClient({ findMediaFiles: jest.fn().mockResolvedValue([]) });

    const result = await validateRecording(client, 24, 5);

    expect(result.channelsOk).toBe(0);
    expect(result.issues).toEqual([
      expect.objectContaining({ channel: 0, issueType: "no_recordings" }),
    ]);
  });

  it("marks the channel ok when segments cover the whole window without gaps", async () => {
    const now = new Date();
    const start = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const client = fakeClient({
      findMediaFiles: jest.fn().mockResolvedValue([[start, now]]),
    });

    const result = await validateRecording(client, 24, 5);

    expect(result.channelsOk).toBe(1);
    expect(result.issues).toHaveLength(0);
  });

  it("reports not_recording_now when the last segment ended long before now", async () => {
    const now = new Date();
    const windowStart = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const segEnd = new Date(now.getTime() - 60 * 60 * 1000); // parou há 1h
    const client = fakeClient({
      findMediaFiles: jest.fn().mockResolvedValue([[windowStart, segEnd]]),
    });

    const result = await validateRecording(client, 24, 5);

    expect(result.issues).toEqual([
      expect.objectContaining({ channel: 0, issueType: "not_recording_now" }),
    ]);
  });

  it("reports a gap between two segments larger than maxGapMinutes", async () => {
    const now = new Date();
    const windowStart = new Date(now.getTime() - 2 * 60 * 60 * 1000);
    const seg1End = new Date(windowStart.getTime() + 10 * 60 * 1000);
    const seg2Start = new Date(seg1End.getTime() + 30 * 60 * 1000); // gap de 30min > maxGap 5min
    const client = fakeClient({
      findMediaFiles: jest.fn().mockResolvedValue([
        [windowStart, seg1End],
        [seg2Start, now],
      ]),
    });

    const result = await validateRecording(client, 2, 5);

    expect(result.issues.some((i) => i.issueType === "gap")).toBe(true);
  });
});
