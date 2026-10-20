import { userOnboardingSchema } from "@repo/types/req";
import { get, post, unwrap, type ApiEnvelope } from "./client";

export interface OnboardUserInput {
  username: string;
  fullName: string;
  agentId?: string;
}

/**
 * Completes the caller's profile. The body is validated with the same schema
 * the users lambda runs, so the shapes can't drift.
 */
export async function onboardUser(input: OnboardUserInput): Promise<void> {
  const body = userOnboardingSchema.shape.body.parse(input);
  await post("/api/users/onboarding", body);
}

/** The caller's own user row, or null when no row exists yet (404/NOT_FOUND). */
export async function getMe<TUser = unknown>(): Promise<TUser | null> {
  try {
    return unwrap(await get<ApiEnvelope<TUser>>("/api/users/me"));
  } catch (e) {
    if (isUserNotFound(e)) return null;
    throw e;
  }
}

/** True when the API says the caller has no user row (`NOT_FOUND`). */
export function isUserNotFound(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  // axios rejects on 4xx and carries the parsed body on `response.data`.
  const body = (error as { response?: { data?: unknown } }).response?.data;
  if (typeof body !== "object" || body === null) return false;
  const envelope = body as { error?: { code?: string } };
  return envelope.error?.code === "NOT_FOUND";
}
