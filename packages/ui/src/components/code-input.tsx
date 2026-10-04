import { useCallback, useEffect, useRef, useState } from "react";
import {
  Pressable,
  StyleSheet,
  TextInput,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

import { radius, spacing, useTheme } from "../theme";
import { Text } from "./text";

export interface CodeInputProps {
  length?: number;
  value: string;
  onChangeCode: (code: string) => void;
  /** Fired once when `length` digits are entered. */
  onComplete?: (code: string) => void;
  disabled?: boolean;
  error?: string;
  label?: string;
  containerStyle?: StyleProp<ViewStyle>;
  testID?: string;
}

/**
 * Boxed one-time-code field. Owns presentation only — the code value stays with
 * the screen, which also owns the verify/resend calls.
 */
export function CodeInput({
  length = 6,
  value,
  onChangeCode,
  onComplete,
  disabled = false,
  error,
  label,
  containerStyle,
  testID,
}: CodeInputProps) {
  const { colors } = useTheme();
  const [focused, setFocused] = useState(false);
  const blink = useSharedValue(0);
  const inputRef = useRef<TextInput>(null);

  const focus = useCallback(() => {
    if (!disabled) {
      void inputRef.current?.focus();
    }
  }, [disabled]);

  useEffect(() => {
    if (focused) {
      blink.value = withRepeat(withTiming(1, { duration: 600 }), -1, true);
    } else {
      cancelAnimation(blink);
      blink.value = 0;
    }
  }, [focused, blink]);

  const caretStyle = useAnimatedStyle(() => ({ opacity: blink.value }));

  const cells = Array.from({ length }, (_, index) => value[index] ?? "");

  const handleChangeText = (text: string) => {
    const digits = text.replace(/\D/g, "").slice(0, length);
    onChangeCode(digits);
    if (digits.length === length) {
      onComplete?.(digits);
    }
  };

  return (
    <View style={[{ gap: spacing.sm }, containerStyle]}>
      {label ? (
        <Text variant="caption" tone="secondary">
          {label}
        </Text>
      ) : null}

      <Pressable
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={label ?? "Verification code"}
        disabled={disabled}
        onPress={focus}
        style={{ flexDirection: "row", gap: spacing.sm }}
      >
        {cells.map((digit, index) => {
          const isActive = focused && index === value.length;
          return (
            <View
              key={index}
              style={[
                styles.cell,
                {
                  backgroundColor: colors.card,
                  borderColor: error
                    ? colors.destructive
                    : isActive
                      ? colors.ring
                      : colors.input,
                  borderRadius: radius.md,
                },
              ]}
            >
              {/* `tone` is left at `primary`, which resolves to `foreground` — the same
                colour this read from the theme by hand before. */}
              <Text variant="title">{digit}</Text>
              {isActive ? (
                <Animated.View
                  style={[
                    styles.caret,
                    { backgroundColor: colors.primary, borderRadius: 1 },
                    caretStyle,
                  ]}
                />
              ) : null}
            </View>
          );
        })}
      </Pressable>

      {/* The boxes above are the visible UI; this input stays transparent so the
          platform keyboard, autofill and copy/paste keep working. */}
      <TextInput
        ref={inputRef}
        value={value}
        onChangeText={handleChangeText}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="one-time-code"
        maxLength={length}
        editable={!disabled}
        caretHidden
        importantForAutofill="yes"
        style={styles.hiddenInput}
      />

      {/* No `tone` reaches `destructive`: a tone is a step on the emphasis scale,
          and an error is not emphasis, it is a different meaning. */}
      {error ? (
        <Text
          variant="caption"
          accessibilityLiveRegion="polite"
          style={{ color: colors.destructive }}
        >
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  cell: {
    flex: 1,
    aspectRatio: 0.8,
    borderWidth: StyleSheet.hairlineWidth * 2,
    alignItems: "center",
    justifyContent: "center",
  },
  caret: {
    position: "absolute",
    bottom: "30%",
    width: 2,
    height: "40%",
  },
  hiddenInput: {
    position: "absolute",
    opacity: 0,
    height: 1,
    width: 1,
  },
});
