import React from "react"
import { View } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "../lib/utils"

const safeAreaVariants = cva("flex-1", {
  variants: {
    variant: {
      default: "bg-background",
      card: "bg-card",
      transparent: "bg-transparent",
    },
  },
  defaultVariants: { variant: "default" },
})

export interface SafeAreaProps
  extends
    React.ComponentPropsWithoutRef<typeof SafeAreaView>,
    VariantProps<typeof safeAreaVariants> {
  className?: string
  children?: React.ReactNode
}

/**
 * Background + flex live on a plain View (className works reliably under
 * Uniwind and colors the full screen including the inset areas). The
 * SafeAreaView only applies the insets, since className is not forwarded to it.
 */
export function SafeArea({ variant, className, children, style, ...props }: SafeAreaProps) {
  return (
    <View className={cn(safeAreaVariants({ variant }), className)} style={{ flex: 1 }}>
      <SafeAreaView style={[{ flex: 1 }, style]} {...props}>
        {children}
      </SafeAreaView>
    </View>
  )
}
