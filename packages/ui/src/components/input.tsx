import React from "react"
import { View, TextInput, useColorScheme } from "react-native"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "../lib/utils"
import { radius } from "../lib/radius"
import { useThemeColors } from "./theme-provider"

// Padding lives on the wrapping View, never on the raw TextInput — a TextInput
// doesn't honor `px-*` reliably, so keeping padding on the View gives a
// consistent inset with or without icons.
const inputVariants = cva(`flex-row items-center ${radius.control} border py-2`, {
  variants: {
    variant: {
      default: "border-input bg-background",
      ghost: "border-transparent bg-transparent",
    },
    size: {
      sm: "min-h-9 px-3",
      md: "min-h-12 px-4",
      lg: "min-h-14 px-5",
    },
  },
  defaultVariants: {
    variant: "default",
    size: "md",
  },
})

const fontSizes = { sm: 14, md: 16, lg: 18 } as const

export interface InputProps
  extends React.ComponentPropsWithoutRef<typeof TextInput>, VariantProps<typeof inputVariants> {
  className?: string
  leadingIcon?: React.ReactNode
  trailingIcon?: React.ReactNode
}

export const Input = React.forwardRef<React.ElementRef<typeof TextInput>, InputProps>(
  function Input({ variant, size, className, leadingIcon, trailingIcon, style, ...props }, ref) {
    const dark = useColorScheme() === "dark"
    const colors = useThemeColors()
    const caret = colors.foreground
    const resolvedSize = size ?? "md"

    return (
      <View className={cn(inputVariants({ variant, size }), className)}>
        {leadingIcon && <View className="me-2">{leadingIcon}</View>}
        <TextInput
          ref={ref}
          className="flex-1 self-stretch p-0 text-foreground placeholder:text-muted-foreground"
          style={[{ fontSize: fontSizes[resolvedSize] }, style]}
          textAlignVertical="center"
          placeholderTextColor={colors.mutedForeground}
          keyboardAppearance={dark ? "dark" : "light"}
          selectionColor={caret}
          cursorColor={caret}
          {...props}
        />
        {trailingIcon && <View className="ms-2">{trailingIcon}</View>}
      </View>
    )
  },
)
