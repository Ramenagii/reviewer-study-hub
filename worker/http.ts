export function json(data: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...init.headers
    }
  });
}

export function problem(status: number, message: string, details?: unknown) {
  return json({ error: message, details }, { status });
}

export async function readJson<T>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch {
    throw new HttpError(400, "Expected a valid JSON body.");
  }
}

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown
  ) {
    super(message);
  }
}

export function assertString(value: unknown, field: string, maxLength = 8_000) {
  if (typeof value !== "string") {
    throw new HttpError(400, `${field} must be a string.`);
  }
  const trimmed = value.trim();
  if (!trimmed) {
    throw new HttpError(400, `${field} is required.`);
  }
  if (trimmed.length > maxLength) {
    throw new HttpError(400, `${field} is too long.`);
  }
  return trimmed;
}

export function optionalString(value: unknown, maxLength = 8_000) {
  if (value == null) return "";
  if (typeof value !== "string") {
    throw new HttpError(400, "Expected a string value.");
  }
  return value.slice(0, maxLength);
}

export function sse(event: string, data: unknown) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

