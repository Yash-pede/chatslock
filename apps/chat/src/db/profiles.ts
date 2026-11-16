import type { PublicUserProfile } from "@/api/users.api"
import type { PeerUserStatus } from "@repo/types/req"
import { and, eq, ne } from "drizzle-orm"
import type { Database } from "./client"
import { profiles, type CachedProfile, type ProfileRow } from "./schema"

/** Maps the API's public profile to its cache row. */
export function profileRowFromApi(profile: PublicUserProfile): ProfileRow {
  return {
    userId: profile.userId,
    username: profile.username,
    fullName: profile.fullName,
    avatar: profile.avatar ?? null,
    lastActiveAt: profile.lastActiveAt,
    status: profile.status,
  }
}

/** Rebuilds the API's public profile shape from a cache row. */
export function profileFromRow(row: CachedProfile): PublicUserProfile {
  return {
    userId: row.userId,
    username: row.username,
    fullName: row.fullName,
    ...(row.avatar !== null ? { avatar: row.avatar } : {}),
    lastActiveAt: row.lastActiveAt,
    status: row.status,
  }
}

/** Upserts a batch of peer profiles. */
export async function cacheProfiles(
  db: Database,
  batch: PublicUserProfile[],
): Promise<void> {
  if (batch.length === 0) return

  db.transaction((tx) => {
    for (const profile of batch) {
      const row = profileRowFromApi(profile)
      // A username can be released and taken by another account; drop the old
      // owner so the unique username index cannot block this upsert.
      tx.delete(profiles)
        .where(and(eq(profiles.username, row.username), ne(profiles.userId, row.userId)))
        .run()
      tx.insert(profiles)
        .values(row)
        .onConflictDoUpdate({ target: profiles.userId, set: row })
        .run()
    }
  })
}

/** Applies a live presence event without waiting for a full profile refresh. */
export async function updateCachedProfileStatus(
  db: Database,
  userId: string,
  status: PeerUserStatus,
  lastActiveAt?: number,
): Promise<void> {
  await db
    .update(profiles)
    .set({
      status,
      ...(lastActiveAt !== undefined ? { lastActiveAt } : {}),
    })
    .where(eq(profiles.userId, userId))
}
