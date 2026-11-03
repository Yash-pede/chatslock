import { useCallback, useRef, useState } from "react"
import type { NativeScrollEvent, NativeSyntheticEvent } from "react-native"
import type { FlashListRef } from "@shopify/flash-list"

/** Below this many px from the bottom, the jump-to-latest button is hidden. */
const JUMP_THRESHOLD = 120
/** Within this many px of the top, the previous page is requested. */
const LOAD_OLDER_THRESHOLD = 200

/**
 * Scroll behaviour for the message list: tracks whether the user has scrolled
 * away from the newest message, and requests older pages near the top.
 */
export function useMessageListScroll<TChatMessage>({ onLoadOlder }: { onLoadOlder: () => void }) {
  const listRef = useRef<FlashListRef<TChatMessage>>(null)
  const didInitialScroll = useRef(false)
  /**
   * A page load leaves the scroll offset at the top long enough for the next
   * layout/scroll event to request another page. Only a new drag may trigger
   * the next load, so a single gesture can never page through the whole history.
   */
  const canLoadOlder = useRef(true)
  const [awayFromBottom, setAwayFromBottom] = useState(false)

  const onScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent
      const distanceFromBottom = contentSize.height - (contentOffset.y + layoutMeasurement.height)
      const away = distanceFromBottom > JUMP_THRESHOLD
      setAwayFromBottom((current) => (current === away ? current : away))

      if (contentOffset.y < LOAD_OLDER_THRESHOLD && canLoadOlder.current) {
        canLoadOlder.current = false
        onLoadOlder()
      }
    },
    [onLoadOlder],
  )

  /** Re-arms paging only when the user starts a fresh upward gesture. */
  const onScrollBeginDrag = useCallback(() => {
    canLoadOlder.current = true
  }, [])

  const scrollToBottom = useCallback((animated: boolean) => {
    listRef.current?.scrollToEnd({ animated })
  }, [])

  // Only the first load jumps to the newest message. Older pages are inserted
  // above the viewport and must not pull the user back to the bottom.
  const onLoad = useCallback(() => {
    if (didInitialScroll.current) return
    didInitialScroll.current = true
    scrollToBottom(false)
  }, [scrollToBottom])

  return {
    listRef,
    awayFromBottom,
    onScroll,
    onScrollBeginDrag,
    scrollToBottom,
    onLoad,
  }
}
