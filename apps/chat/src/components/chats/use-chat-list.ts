import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { asc, eq } from "drizzle-orm"
import { useLiveQuery } from "drizzle-orm/expo-sqlite"
import { extractErrorMessage } from "@repo/utils"
import { CHAT_PAGE_SIZE, conversationsApi } from "@/api/conversations.api"
import { cacheChatPage, useLocalDb } from "@/db"
import { conversations as conversationsTable, profiles as profilesTable } from "@/db/schema"
import { useRealtime } from "@/context/RealtimeContext"
import {
  buildChatListFromCache,
  collectPeerIds,
  fetchPeerProfiles,
  type ChatListItem,
} from "@/components/chats/chat-list"

export interface UseChatListResult {
  items: ChatListItem[]
  /** True until the first fetch settles and nothing is cached. */
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
}

/**
 * The chats list. The network page is written to SQLite; the rendered list is a
 * live query over the cache, so cached chats appear immediately and survive a
 * failed refresh.
 */
export function useChatList(currentUserId: string | null): UseChatListResult {
  const { db } = useLocalDb()
  const { online } = useRealtime()
  const ownerUserId = currentUserId ?? ""
  const [fetchStatus, setFetchStatus] = useState<"loading" | "done">("loading")
  const [fetchError, setFetchError] = useState<string | null>(null)
  const activeRef = useRef(true)

  const conversationQuery = useMemo(
    () =>
      db
        .select()
        .from(conversationsTable)
        .where(eq(conversationsTable.ownerUserId, ownerUserId))
        .orderBy(asc(conversationsTable.position)),
    [db, ownerUserId],
  )
  const { data: conversationRows } = useLiveQuery(conversationQuery, [conversationQuery])

  const profileQuery = useMemo(() => db.select().from(profilesTable), [db])
  const { data: profileRows } = useLiveQuery(profileQuery, [profileQuery])

  const items = useMemo(
    () =>
      buildChatListFromCache(
        // The query already filters; this also drops the previous owner's rows
        // during the one render before a new live query resolves.
        conversationRows.filter((row) => row.ownerUserId === ownerUserId),
        profileRows,
        currentUserId,
      ),
    [conversationRows, currentUserId, ownerUserId, profileRows],
  )

  // A different owner must not inherit the previous account's fetch state.
  const [loadedOwner, setLoadedOwner] = useState(ownerUserId)
  if (loadedOwner !== ownerUserId) {
    setLoadedOwner(ownerUserId)
    setFetchStatus("loading")
    setFetchError(null)
  }

  const load = useCallback(async () => {
    if (!currentUserId || !online || !activeRef.current) return

    setFetchStatus("loading")
    try {
      const { conversations } = await conversationsApi.getChatPage({
        pageSize: CHAT_PAGE_SIZE,
      })
      const profiles = await fetchPeerProfiles(collectPeerIds(conversations, currentUserId))
      if (!activeRef.current) return

      await cacheChatPage(db, currentUserId, conversations, [...profiles.values()])
      setFetchError(null)
    } catch (e) {
      if (activeRef.current) setFetchError(extractErrorMessage(e))
    } finally {
      if (activeRef.current) setFetchStatus("done")
    }
  }, [currentUserId, db, online])

  // Do not repopulate the cache after sign-out cleared it.
  useEffect(() => {
    activeRef.current = true
    return () => {
      activeRef.current = false
    }
  }, [])

  // Fetches from an external system on mount and whenever connectivity
  // returns; the deferred call is intentional, state lands in the promise
  // callbacks.
  useEffect(() => {
    if (currentUserId === null || !online) return
    void Promise.resolve().then(load)
  }, [currentUserId, load, online])

  // Cached items win: a failed refresh must not hide a list we can render.
  const loading = items.length === 0 && fetchStatus === "loading" && online
  const error =
    items.length === 0
      ? (fetchError ??
        (online ? null : "You're offline. Connect to load your chats."))
      : null

  return useMemo(() => ({ items, loading, error, refresh: load }), [items, loading, error, load])
}
