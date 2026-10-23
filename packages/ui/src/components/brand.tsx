import React from "react"
import { View } from "react-native"
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
}

/** App logo tile. The only place the brand gradient/shape is defined. */
export function BrandMark({ size = "md", className }: BrandMarkProps) {
  const colors = useThemeColors()
  const spec = sizeMap[size]

  return (
    <View
      className={cn("items-center justify-center bg-primary", spec.box, className)}
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
