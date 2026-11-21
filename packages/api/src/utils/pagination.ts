/**
 * Cursor helpers for DynamoDB queries exposed through the API. Cursors are the
 * table's `LastEvaluatedKey`, JSON-encoded and base64url-encoded so they survive
 * query strings without clients (or proxies) mangling them.
 */
export const encodeLastEvaluatedKey = (
  key: Record<string, unknown> | undefined,
): string | undefined =>
  key ? Buffer.from(JSON.stringify(key), "utf8").toString("base64url") : undefined

export const decodeLastEvaluatedKey = (
  cursor: string | undefined,
): Record<string, unknown> | undefined => {
  if (!cursor) return undefined

  try {
    const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as unknown
    return parsed && typeof parsed === "object"
      ? (parsed as Record<string, unknown>)
      : undefined
  } catch {
    return undefined
  }
}
