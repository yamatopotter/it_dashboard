/**
 * @jest-environment node
 */

import { generateWebhookToken, verifyWebhookToken } from "@/lib/webhook";

beforeEach(() => {
  process.env.WEBHOOK_SECRET = "test-secret-for-jest";
});

afterEach(() => {
  delete process.env.WEBHOOK_SECRET;
});

describe("generateWebhookToken", () => {
  it("returns a 64-character hex string", () => {
    const token = generateWebhookToken("link-123");
    expect(token).toMatch(/^[0-9a-f]{64}$/);
  });

  it("returns the same token for the same linkId", () => {
    expect(generateWebhookToken("link-abc")).toBe(generateWebhookToken("link-abc"));
  });

  it("returns different tokens for different linkIds", () => {
    expect(generateWebhookToken("link-1")).not.toBe(generateWebhookToken("link-2"));
  });

  it("throws when WEBHOOK_SECRET is not set", () => {
    delete process.env.WEBHOOK_SECRET;
    expect(() => generateWebhookToken("link-1")).toThrow("WEBHOOK_SECRET");
  });
});

describe("verifyWebhookToken", () => {
  it("returns true for a valid token", () => {
    const token = generateWebhookToken("link-abc");
    expect(verifyWebhookToken("link-abc", token)).toBe(true);
  });

  it("returns false for a tampered token", () => {
    const token = generateWebhookToken("link-abc");
    const tampered = token.slice(0, -1) + (token.endsWith("f") ? "0" : "f");
    expect(verifyWebhookToken("link-abc", tampered)).toBe(false);
  });

  it("returns false for a token of different length", () => {
    expect(verifyWebhookToken("link-abc", "tooshort")).toBe(false);
  });

  it("returns false for a token from a different linkId", () => {
    const token = generateWebhookToken("link-xyz");
    expect(verifyWebhookToken("link-abc", token)).toBe(false);
  });

  it("returns false when WEBHOOK_SECRET is not set", () => {
    const token = generateWebhookToken("link-abc");
    delete process.env.WEBHOOK_SECRET;
    expect(verifyWebhookToken("link-abc", token)).toBe(false);
  });
});
