import { apiClient } from "@repo/utils";

export type ApiEnvelope<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string } };

/**
 * GET through the shared authenticated client (attaches the access token and
 * runs the transparent 401 refresh/replay).
 */
export async function get<TData = unknown>(
  path: string,
  params?: object,
): Promise<TData> {
  const { data } = await apiClient.get<TData>(path, params ? { params } : undefined);
  return data;
}

/**
 * POST through the shared authenticated client.
 * The users lambda answers with `{ ok: false, error }` on 4xx/5xx, so unwrap
 * the envelope here and throw the backend message instead of letting the
 * caller render a generic error.
 */
export async function post<TData = unknown, TBody = unknown>(
  path: string,
  body: TBody,
): Promise<TData> {
  const { data } = await apiClient.post<ApiEnvelope<TData> | TData>(path, body);
  if (isEnvelope(data)) return unwrap(data);
  return data as TData;
}

/** Unwraps the `{ ok, data }` envelope the users lambda returns. */
export function unwrap<T>(envelope: ApiEnvelope<T>): T {
  if (!envelope.ok) throw new Error(envelope.error.message);
  return envelope.data;
}

function isEnvelope<T>(body: ApiEnvelope<T> | T): body is ApiEnvelope<T> {
  return typeof body === "object" && body !== null && "ok" in body;
}
