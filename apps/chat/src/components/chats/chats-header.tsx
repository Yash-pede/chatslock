import { Pressable, ScrollView, View } from "react-native"
import { Search } from "lucide-react-native"
import { Text, useThemeColors } from "@repo/ui"

import type { ChatFilter } from "@/components/chats/chat-list"

const FILTERS: { key: ChatFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "unread", label: "Unread" },
  { key: "empty", label: "Get started" },
]

/** Title row with the unread/total summary and a search affordance. */
export function ChatsTitleBar({ unreadCount, total }: { unreadCount: number; total: number }) {
  const colors = useThemeColors()

  return (
    <View className="flex-row items-center justify-between px-4 pb-1 pt-2">
      <Text className="text-[1.9rem] font-bold tracking-tight text-foreground">Chats</Text>
      <View className="flex-row items-center gap-4">
        <Text variant="small" className="text-muted-foreground">
          {unreadCount > 0 ? `${unreadCount} unread` : `${total} chats`}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Search chats"
          hitSlop={8}
          className="h-9 w-9 items-center justify-center rounded-full active:bg-secondary"
        >
          <Search size={21} color={colors.foreground} strokeWidth={2} />
        </Pressable>
      </View>
    </View>
  )
}

/** Underlined filter tabs with optional per-filter counts. */
export function ChatFilterTabs({
  filter,
  counts,
  onChange,
}: {
  filter: ChatFilter
  counts: Record<ChatFilter, number>
  onChange: (filter: ChatFilter) => void
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerClassName="gap-5 px-4 py-2"
      className="grow-0"
    >
      {FILTERS.map(({ key, label }) => {
        const active = filter === key

        return (
          <Pressable
            key={key}
            onPress={() => onChange(key)}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={label}
            className="items-center gap-1.5 pb-1"
          >
            <View className="flex-row items-center gap-1.5">
              <Text
                className={`text-base ${active ? "font-semibold text-primary" : "font-medium text-muted-foreground"}`}
              >
                {label}
              </Text>
              {key !== "all" && counts[key] > 0 ? (
                <View className="rounded-full bg-secondary px-1.5 py-0.5">
                  <Text className="text-[11px] font-semibold text-muted-foreground">
                    {counts[key]}
                  </Text>
                </View>
              ) : null}
            </View>
            <View
              className={`h-[3px] w-8 rounded-full ${active ? "bg-primary" : "bg-transparent"}`}
            />
          </Pressable>
        )
      })}
    </ScrollView>
  )
}
