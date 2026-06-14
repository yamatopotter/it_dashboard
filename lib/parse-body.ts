import { NextResponse } from "next/server";
import type { ZodType } from "zod";

const MAX_BODY_BYTES = 1_048_576; // SEC-026: 1 MB

export async function parseBody(
  req: Request,
): Promise<{ ok: true; data: unknown } | { ok: false; response: NextResponse }> {
  const contentLength = req.headers.get("content-length");
  if (contentLength && parseInt(contentLength, 10) > MAX_BODY_BYTES) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Corpo da requisição excede o limite de 1 MB" }, { status: 413 }),
    };
  }
  try {
    return { ok: true, data: await req.json() };
  } catch {
    return {
      ok: false,
      response: NextResponse.json({ error: "JSON inválido" }, { status: 400 }),
    };
  }
}

export async function parseAndValidate<T>(
  req: Request,
  schema: ZodType<T>,
): Promise<{ ok: true; data: T } | { ok: false; response: NextResponse }> {
  const raw = await parseBody(req);
  if (!raw.ok) return raw;
  const result = schema.safeParse(raw.data);
  if (!result.success) {
    return {
      ok: false,
      response: NextResponse.json({ error: result.error.flatten() }, { status: 400 }),
    };
  }
  return { ok: true, data: result.data };
}
