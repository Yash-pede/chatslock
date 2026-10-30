import React from "react"
import { Dimensions, FlatList, View } from "react-native"
import { cn } from "../lib/utils"

export interface CarouselProps extends React.ComponentPropsWithoutRef<typeof View> {
  className?: string
  data: React.ReactNode[]
  itemWidth?: number
  showDots?: boolean
  autoPlay?: boolean
  interval?: number
  /** Page to start on (e.g. the media the user tapped). */
  initialIndex?: number
  /** Called with the settled page index after a swipe. */
  onIndexChange?: (index: number) => void
}

/**
 * AniUI carousel: a paging horizontal `FlatList` with optional dots. Extended
 * with `initialIndex`/`onIndexChange` so a caller can open on a chosen page and
 * react to swipes (used by the media viewer to play only the active video).
 */
export function Carousel({
  className,
  data,
  itemWidth,
  showDots = true,
  autoPlay,
  interval = 3000,
  initialIndex = 0,
  onIndexChange,
  ...props
}: CarouselProps) {
  const [active, setActive] = React.useState(initialIndex)
  const width = itemWidth ?? Dimensions.get("window").width
  const ref = React.useRef<FlatList<React.ReactNode>>(null)

  React.useEffect(() => {
    if (!autoPlay || data.length <= 1) return
    const timer = setInterval(() => {
      const next = (active + 1) % data.length
      ref.current?.scrollToOffset({ offset: next * width, animated: true })
    }, interval)
    return () => clearInterval(timer)
  }, [autoPlay, active, data.length, interval, width])

  return (
    <View className={cn("flex-1", className)} {...props}>
      <FlatList
        ref={ref}
        data={data}
        horizontal
        pagingEnabled
        style={{ flex: 1 }}
        showsHorizontalScrollIndicator={false}
        initialScrollIndex={initialIndex}
        getItemLayout={(_, index) => ({ length: width, offset: width * index, index })}
        onMomentumScrollEnd={(e) => {
          const index = Math.round(e.nativeEvent.contentOffset.x / width)
          setActive(index)
          onIndexChange?.(index)
        }}
        renderItem={({ item }) => <View style={{ width }}>{item}</View>}
        keyExtractor={(_, i) => String(i)}
      />
      {showDots && data.length > 1 && (
        <View className="mt-3 flex-row items-center justify-center gap-1.5">
          {data.map((_, i) => (
            <View
              key={i}
              className={cn(
                "h-2 rounded-full",
                i === active ? "w-4 bg-primary" : "w-2 bg-muted-foreground/30",
              )}
            />
          ))}
        </View>
      )}
    </View>
  )
}
