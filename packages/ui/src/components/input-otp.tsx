import React, { useEffect, useRef, useState } from "react"
import { View, TextInput, useColorScheme, type TextInputInstance } from "react-native"
import { cn } from "../lib/utils"
import { radius } from "../lib/radius"
import { useThemeColors } from "./theme-provider"

type TextInputHandle = TextInputInstance

export interface InputOtpProps extends React.ComponentPropsWithoutRef<typeof View> {
  className?: string
  length?: number
  value?: string
  onValueChange?: (value: string) => void
  autoFocus?: boolean
  /** Height of a single digit box; the width follows it. */
  digitHeight?: number
  /** Fixed width override. When omitted, boxes share the available row width. */
  digitWidth?: number
}

export function InputOtp({
  length = 6,
  value = "",
  onValueChange,
  autoFocus,
  digitHeight = 56,
  digitWidth,
  className,
  ...props
}: InputOtpProps) {
  const refs = useRef<(TextInputHandle | null)[]>([])
  const [focused, setFocused] = useState(-1)
  const dark = useColorScheme() === "dark"
  const colors = useThemeColors()
  const digits = Array.from({ length }, (_, i) => value[i] ?? "")
  /**
   * Box emptied by the last backspace or deletion. Backspace then arrives twice
   * on iOS (the `onKeyPress` and an empty `onChangeText` for the same press),
   * so the second event must not wipe the digit before it.
   */
  const clearedIndex = useRef<number | null>(null)

  /**
   * Writes a single digit and pads back to `length`, so the parent value and the
   * boxes stay aligned instead of producing holes like "1" + "" + "3".
   */
  const emit = (next: string[]) => {
    clearedIndex.current = null
    onValueChange?.(next.join("").slice(0, length))
  }

  /** Stores `digit` at `index` and emits the padded value. */
  const setDigit = (next: string[], index: number, digit: string) => {
    next[index] = digit
    emit(next)
  }

  useEffect(() => {
    if (focused >= 0) refs.current[focused]?.focus()
  }, [focused])

  const focusAt = (index: number) => {
    const target = Math.max(0, Math.min(index, length - 1))
    if (target === focused) refs.current[target]?.focus()
    else setFocused(target)
  }

  /** Steps back from an already-cleared box, clearing the digit before it. */
  const deletePrevious = (index: number, next: string[]) => {
    if (index === 0) return
    setDigit(next, index - 1, "")
    clearedIndex.current = index - 1
    focusAt(index - 1)
  }

  const handleChange = (text: string, index: number) => {
    const typed = text.replace(/\D/g, "")
    const next = [...digits]

    if (!typed) {
      // The change that follows a backspace press is handled by `handleKeyPress`.
      if (clearedIndex.current === index) {
        clearedIndex.current = null
        focusAt(index)
        return
      }

      // Clearing a filled box steps back so the next delete leaves the field.
      if (next[index]) {
        setDigit(next, index, "")
        clearedIndex.current = index
        focusAt(index)
        return
      }

      deletePrevious(index, next)
      return
    }

    // Typing into an already filled box must move forward, not overwrite it.
    const target = !digits[index] ? index : index < length - 1 ? index + 1 : index
    setDigit(next, target, typed.slice(-1))
    focusAt(target + 1)
  }

  const handleKeyPress = (key: string, index: number) => {
    if (key !== "Backspace") return

    const next = [...digits]
    if (!next[index]) {
      deletePrevious(index, next)
      return
    }

    // Filled box: clear it here and mark it so the paired empty change is ignored.
    setDigit(next, index, "")
    clearedIndex.current = index
    focusAt(index)
  }

  const bg = dark ? colors.secondary : colors.background
  // Dark border is lifted one shade above the dark bg so the box stays visible.
  const borderDefault = dark ? "#3f3f46" : colors.input
  const borderFocused = colors.foreground
  const textColor = colors.foreground

  return (
    <View
      className={cn("w-full flex-row items-stretch", className)}
      accessibilityRole="none"
      {...props}
    >
      {digits.map((digit, i) => (
        <TextInput
          key={i}
          ref={(el) => {
            refs.current[i] = el
          }}
          style={{
            flexGrow: digitWidth ? 0 : 1,
            flexBasis: digitWidth ? undefined : 0,
            width: digitWidth,
            marginHorizontal: 4,
            height: digitHeight,
            borderWidth: focused === i ? 2 : 1,
            borderColor: focused === i ? borderFocused : borderDefault,
            backgroundColor: bg,
            textAlign: "center",
            fontSize: Math.round(digitHeight * 0.4),
            fontWeight: "600",
            color: textColor,
          }}
          // Radius comes from className so uniwind owns it (an inline radius
          // would be re-resolved away on theme changes).
          className={radius.control}
          value={digit}
          onChangeText={(t) => handleChange(t, i)}
          onKeyPress={({ nativeEvent }) => handleKeyPress(nativeEvent.key, i)}
          onFocus={() => {
            clearedIndex.current = null
            setFocused(i)
          }}
          onBlur={() => setFocused((current) => (current === i ? -1 : current))}
          keyboardType="number-pad"
          keyboardAppearance={dark ? "dark" : "light"}
          selectionColor={borderFocused}
          cursorColor={borderFocused}
          maxLength={1}
          selectTextOnFocus
          autoFocus={autoFocus && i === 0}
          accessible={true}
          accessibilityLabel={`Digit ${i + 1} of ${length}`}
        />
      ))}
    </View>
  )
}
