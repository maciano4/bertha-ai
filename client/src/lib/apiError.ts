// apiRequest throws "<status>: <body>". Pull out the server's friendly message and code.
export function apiErrorInfo(error: unknown): { message: string; code?: string; status?: number } {
  const text = error instanceof Error ? error.message : String(error);
  const match = /^(\d{3}): ([\s\S]*)$/.exec(text);
  if (!match) return { message: text };
  const status = Number(match[1]);
  try {
    const data = JSON.parse(match[2]);
    return { message: data.error || data.message || match[2], code: data.code, status };
  } catch {
    return { message: match[2] || `Request failed (${status})`, status };
  }
}
