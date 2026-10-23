import React from "react"
import { Pressable, View } from "react-native"
import { ChevronRight } from "lucide-react-native"
import { cn } from "../lib/utils"
import { Text } from "./text"
import { useThemeColors } from "./theme-provider"

export interface SettingsRowProps extends Omit<
  React.ComponentPropsWithoutRef<typeof Pressable>,
  "children"
> {
  /** Omitted only on the anonymous variants below; prefer passing `title`. */
  title?: string
  /** Secondary line under the title. */
  description?: string
  leading?: React.ReactNode
  /** Right-aligned content placed before the chevron (e.g. a value). */
  value?: string
  valueClassName?: string
  trailing?: React.ReactNode
  /** Shows a chevron; defaults to true whenever `onPress` is set. */
  chevron?: boolean
  destructive?: boolean
  /** Replaces the whole row content (used for custom rows like avatars). */
  children?: React.ReactNode
  onPress?: () => void
}

/**
 * A grouped settings row in the iOS/Telegram style: optional tinted icon tile,
 * title + description, a right-aligned value, and a chevron. Pressable rows get
 * a pressed background so the tap target feels responsive.
 */
export function SettingsRow({
  title,
  description,
  leading,
  value,
  valueClassName,
  trailing,
  chevron,
  destructive = false,
  className,
  children,
  onPress,
  ...props
}: SettingsRowProps) {
  const colors = useThemeColors()
  const showChevron = chevron ?? Boolean(onPress)

  const content = children ? (
    <>{children}</>
  ) : (
    <>
      {leading ? <View className="me-3 shrink-0">{leading}</View> : null}
      <View className="flex-1">
        <Text
          numberOfLines={1}
          className={cn(
            "text-base font-medium",
            destructive ? "text-destructive" : "text-foreground",
          )}
        >
          {title}
        </Text>
        {description ? (
          <Text
            variant="small"
            numberOfLines={1}
            className="mt-0.5 font-normal text-muted-foreground"
          >
            {description}
          </Text>
        ) : null}
      </View>
      {value ? (
        <Text
          variant="small"
          numberOfLines={1}
          className={cn("max-w-[45%] font-normal text-muted-foreground", valueClassName)}
        >
          {value}
        </Text>
      ) : null}
      {trailing}
      {showChevron && !trailing ? <ChevronRight size={17} color={colors.mutedForeground} /> : null}
    </>
  )

  if (!onPress) {
    return (
      <View className={cn("min-h-13 flex-row items-center gap-1 px-4 py-2.5", className)}>
        {content}
      </View>
    )
  }

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={title}
      className={cn(
        "min-h-13 flex-row items-center gap-1 px-4 py-2.5 active:bg-secondary/70",
        className,
      )}
      {...props}
    >
      {content}
    </Pressable>
  )
}

export interface SettingsGroupProps {
  /** Small uppercase label rendered above the group. */
  title?: string
  footer?: string
  className?: string
  children: React.ReactNode
}

/** Rounded card that groups related rows with hairline dividers between them. */
export function SettingsGroup({ title, footer, className, children }: SettingsGroupProps) {
  const items = React.Children.toArray(children).filter(Boolean)

  return (
    <View className={cn("gap-1.5", className)}>
      {title ? (
        <Text variant="small" className="ms-1 uppercase tracking-wide text-muted-foreground">
          {title}
        </Text>
      ) : null}
      <View className="overflow-hidden rounded-2xl bg-card">
        {items.map((child, index) => (
          <View key={index}>
            {index > 0 ? <View className="ms-4 h-px bg-border/70" /> : null}
            {child}
          </View>
        ))}
      </View>
      {footer ? (
        <Text variant="small" className="mx-1 font-normal leading-4 text-muted-foreground">
          {footer}
        </Text>
      ) : null}
    </View>
  )
}

/** Rounded tinted square used as the leading slot of a settings row. */
export function SettingsIcon({
  children,
  tone = "primary",
}: {
  children: React.ReactNode
  tone?: "primary" | "destructive" | "neutral"
}) {
  const tones = {
    primary: "bg-accent",
    destructive: "bg-destructive/10",
    neutral: "bg-secondary",
  } as const

  return (
    <View className={cn("h-8 w-8 items-center justify-center rounded-lg", tones[tone])}>
      {children}
    </View>
  )
}
