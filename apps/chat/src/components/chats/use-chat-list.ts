import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useFocusEffect } from "expo-router"
import { asc, desc, eq } from "drizzle-orm"
import { useLiveQuery } from "drizzle-orm/expo-sqlite"
import { extractErrorMessage } from "@repo/utils"
import { getPeerUserId } from "@repo/types/schema"
import { CHAT_PAGE_SIZE, conversationsApi } from "@/api/conversations.api"
import { cacheChatPage, useLocalDb } from "@/db"
import { profileFromRow } from "@/db/profiles"
import { conversations as conversationsTable, profiles as profilesTable } from "@/db/schema"
import { useRealtime } from "@/context/RealtimeContext"
import type { ChatListItem } from "@/components/chats/chat-list"

export interface UseChatListResult {
  items: ChatListItem[]
  /** True until the first fetch settles and nothing is cached. */
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
  /** Another page of older conversations exists on the server. */
  hasOlder: boolean
  loadingOlder: boolean
  loadOlder: () => void
}

/**
 * The chats list. The network page is written to SQLite; the rendered list is a
 * live query over the cache, so cached chats appear immediately and survive a
 * failed refresh. `refresh` reloads page one; `loadOlder` appends the next page
 * using the server's base64url `nextKey` cursor.
 */
export function useChatList(currentUserId: string | null): UseChatListResult {
  const { db } = useLocalDb()
  const { online } = useRealtime()
  const ownerUserId = currentUserId ?? ""
  const [fetchStatus, setFetchStatus] = useState<"loading" | "done">("loading")
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [hasOlder, setHasOlder] = useState(false)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const activeRef = useRef(true)
  const nextKeyRef = useRef<string | undefined>(undefined)
  const loadingOlderRef = useRef(false)

  const conversationQuery = useMemo(
    () =>
      db
        .select()
        .from(conversationsTable)
        .where(eq(conversationsTable.ownerUserId, ownerUserId))
        .orderBy(desc(conversationsTable.lastMessageAt), asc(conversationsTable.conversationId)),
    [db, ownerUserId],
  )
  const { data: conversationRows } = useLiveQuery(conversationQuery, [conversationQuery])

  const profileQuery = useMemo(() => db.select().from(profilesTable), [db])
  const { data: profileRows } = useLiveQuery(profileQuery, [profileQuery])

  const items = useMemo<ChatListItem[]>(() => {
    const byId = new Map(profileRows.map((row) => [row.userId, profileFromRow(row)]))

    return conversationRows
      .filter((row) => row.ownerUserId === ownerUserId)
      .map((row) => {
        const peerId = getPeerUserId(row.conversationId, currentUserId)
        return { ...row, peer: peerId ? (byId.get(peerId) ?? null) : null }
      })
  }, [conversationRows, currentUserId, ownerUserId, profileRows])

  // A different owner must not inherit the previous account's fetch state.
  const [loadedOwner, setLoadedOwner] = useState(ownerUserId)
  if (loadedOwner !== ownerUserId) {
    setLoadedOwner(ownerUserId)
    setFetchStatus("loading")
    setFetchError(null)
    setHasOlder(false)
  }

  useEffect(() => {
    nextKeyRef.current = undefined
  }, [ownerUserId])

  const load = useCallback(async () => {
    if (!currentUserId || !online || !activeRef.current) return

    setFetchStatus("loading")
    nextKeyRef.current = undefined
    setHasOlder(false)

    try {
      const page = await conversationsApi.getChatPage({ pageSize: CHAT_PAGE_SIZE })
      if (!activeRef.current) return

      await cacheChatPage(db, currentUserId, page.conversations, page.profiles)
      nextKeyRef.current = page.nextKey
      setHasOlder(Boolean(page.nextKey))
      setFetchError(null)
    } catch (e) {
      if (activeRef.current) setFetchError(extractErrorMessage(e))
    } finally {
      if (activeRef.current) setFetchStatus("done")
    }
  }, [currentUserId, db, online])

  const loadOlder = useCallback(() => {
    const nextKey = nextKeyRef.current
    if (!currentUserId || !online || !activeRef.current) return
    if (loadingOlderRef.current || !nextKey) return

    loadingOlderRef.current = true
    setLoadingOlder(true)

    void (async () => {
      try {
        const page = await conversationsApi.getChatPage({
          pageSize: CHAT_PAGE_SIZE,
          startKey: nextKey,
        })
        if (!activeRef.current) return

        await cacheChatPage(db, currentUserId, page.conversations, page.profiles, {
          append: true,
        })
        nextKeyRef.current = page.nextKey
        setHasOlder(Boolean(page.nextKey))
      } catch {
        // Keep the cursor so the next scroll retries.
      } finally {
        loadingOlderRef.current = false
        setLoadingOlder(false)
      }
    })()
  }, [currentUserId, db, online])

  // Do not repopulate the cache after sign-out cleared it.
  useEffect(() => {
    activeRef.current = true
    return () => {
      activeRef.current = false
    }
  }, [])

  // Cached rows render immediately (live query); fetch page one on mount, on
  // focus (returning from a conversation), and whenever connectivity returns.
  // The deferred call is intentional, state lands in the promise callbacks.
  useFocusEffect(
    useCallback(() => {
      if (currentUserId === null || !online) return
      void Promise.resolve().then(load)
    }, [currentUserId, load, online]),
  )

  // Cached items win: a failed refresh must not hide a list we can render.
  const loading = items.length === 0 && fetchStatus === "loading" && online
  const error =
    items.length === 0
      ? (fetchError ?? (online ? null : "You're offline. Connect to load your chats."))
      : null

  return useMemo(
    () => ({ items, loading, error, refresh: load, hasOlder, loadingOlder, loadOlder }),
    [items, loading, error, load, hasOlder, loadingOlder, loadOlder],
  )
}
