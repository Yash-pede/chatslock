import React from "react"
import { Image, ImageSourcePropType, View } from "react-native"
import { MessageSquareLock } from "lucide-react-native"
import { cn } from "../lib/utils"
import { radius } from "../lib/radius"
import { Text } from "./text"
import { useThemeColors } from "./theme-provider"

const sizeMap = {
  sm: { box: `h-11 w-11 ${radius.tile}`, icon: 22 },
  md: { box: `h-16 w-16 ${radius.tile}`, icon: 30 },
} as const

export interface BrandMarkProps {
  size?: keyof typeof sizeMap
  className?: string
  /** App icon image source. Rendered instead of the default glyph when provided. */
  source?: ImageSourcePropType
}

/** App logo tile. The only place the brand shape is defined. */
export function BrandMark({ size = "md", className, source }: BrandMarkProps) {
  const colors = useThemeColors()
  const spec = sizeMap[size]
  const tile = cn("items-center justify-center overflow-hidden", spec.box, className)

  if (source) {
    return (
      <View className={tile} accessibilityRole="image" accessibilityLabel="Chatslock">
        <Image source={source} className="h-full w-full" resizeMode="cover" />
      </View>
    )
  }

  return (
    <View
      className={cn(tile, "bg-primary")}
      accessibilityRole="image"
      accessibilityLabel="Chatslock"
    >
      <MessageSquareLock size={spec.icon} color={colors.primaryForeground} strokeWidth={2} />
    </View>
  )
}

export interface SectionHeaderProps {
  title: string
  action?: React.ReactNode
  className?: string
}

export function SectionHeader({ title, action, className }: SectionHeaderProps) {
  return (
    <View className={cn("flex-row items-center justify-between", className)}>
      <Text variant="small" className="uppercase tracking-wider text-muted-foreground">
        {title}
      </Text>
      {action}
    </View>
  )
}
