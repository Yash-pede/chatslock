import type { getUser } from "@repo/types/schema"
import { eq } from "drizzle-orm"
import type { Database } from "./client"
import { selfProfile, type CachedSelfProfile, type SelfProfileRow } from "./schema"

/** Maps the `/me` profile to its cache row. */
export function selfProfileRow(profile: getUser): SelfProfileRow {
  return {
    userId: profile.userId,
    username: profile.username,
    fullName: profile.fullName,
    avatar: profile.avatar ?? null,
    phone: profile.phone ?? null,
    role: profile.role,
    agentId: profile.agentId ?? null,
    lastActiveAt: profile.lastActiveAt,
  }
}

/** Rebuilds the `/me` profile shape from a cache row. */
export function selfProfileFromRow(row: CachedSelfProfile): getUser {
  return {
    userId: row.userId,
    username: row.username,
    fullName: row.fullName,
    ...(row.avatar !== null ? { avatar: row.avatar } : {}),
    ...(row.phone !== null ? { phone: row.phone } : {}),
    role: row.role,
    ...(row.agentId !== null ? { agentId: row.agentId } : {}),
    lastActiveAt: row.lastActiveAt,
  }
}

/** Upserts the signed-in user's profile after a successful `/me`. */
export async function cacheSelfProfile(db: Database, profile: getUser): Promise<void> {
  const row = selfProfileRow(profile)
  await db
    .insert(selfProfile)
    .values(row)
    .onConflictDoUpdate({ target: selfProfile.userId, set: row })
}

/** The last cached `/me` profile, used when the app starts offline. */
export async function getCachedSelfProfile(db: Database, userId: string): Promise<getUser | null> {
  const rows = await db.select().from(selfProfile).where(eq(selfProfile.userId, userId)).limit(1)
  return rows[0] ? selfProfileFromRow(rows[0]) : null
}
