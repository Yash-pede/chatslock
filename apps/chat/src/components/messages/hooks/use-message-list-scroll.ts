import { useCallback, useRef, useState } from "react"
import type { NativeScrollEvent, NativeSyntheticEvent } from "react-native"
import type { FlashListRef } from "@shopify/flash-list"

/** Below this many px from the bottom, the jump-to-latest button is hidden. */
const JUMP_THRESHOLD = 120

/**
 * Scroll behaviour for the message list: tracks whether the user has scrolled
 * away from the newest message so the jump-to-latest button can appear. Older
 * pages are loaded by the list's `onStartReached`, not by this scroll handler.
 */
export function useMessageListScroll<TChatMessage>() {
  const listRef = useRef<FlashListRef<TChatMessage>>(null)
  const didInitialScroll = useRef(false)
  const [awayFromBottom, setAwayFromBottom] = useState(false)

  const onScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent
    const distanceFromBottom = contentSize.height - (contentOffset.y + layoutMeasurement.height)
    const away = distanceFromBottom > JUMP_THRESHOLD
    setAwayFromBottom((current) => (current === away ? current : away))
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
    scrollToBottom,
    onLoad,
  }
}
