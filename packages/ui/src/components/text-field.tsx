import { forwardRef, useState } from "react";
import {
  StyleSheet,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from "react-native";

import { radius, sizing, spacing, type, useTheme } from "../theme";
import { Text } from "./text";

export interface TextFieldProps extends Omit<TextInputProps, "style"> {
  label: string;
  /** Helper text under the field. Replaced by `error` when one is present. */
  hint?: string;
  error?: string;
  required?: boolean;
  containerStyle?: StyleProp<ViewStyle>;
  testID?: string;
}

export const TextField = forwardRef<TextInput, TextFieldProps>(
  function TextField(
    {
      label,
      hint,
      error,
      required = false,
      containerStyle,
      testID,
      ...inputProps
    },
    ref,
  ) {
    const { colors } = useTheme();
    const [focused, setFocused] = useState(false);

    const borderColor = error
      ? colors.destructive
      : focused
        ? colors.ring
        : colors.input;

    return (
      <View style={[{ gap: spacing.xs }, containerStyle]}>
        <Text variant="caption" tone="secondary">
          {label}
          {required ? " *" : ""}
        </Text>

        <TextInput
          ref={ref}
          testID={testID}
          accessibilityLabel={label}
          placeholderTextColor={colors.mutedForeground}
          onFocus={(e) => {
            setFocused(true);
            inputProps.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            inputProps.onBlur?.(e);
          }}
          style={[
            styles.input,
            type.body,
            {
              color: colors.foreground,
              backgroundColor: colors.card,
              borderColor,
              borderRadius: radius.md,
              paddingHorizontal: spacing.lg,
              paddingVertical: spacing.md,
            },
            inputProps.multiline && styles.multiline,
          ]}
          {...inputProps}
        />

        {/* No `tone` reaches `destructive`: a tone is a step on the emphasis
            scale, and an error is not emphasis, it is a different meaning. So
            the colour is set the way a button tints its label — through
            `style`, the documented escape hatch. */}
        {error ? (
          <Text
            variant="caption"
            accessibilityLiveRegion="polite"
            style={{ color: colors.destructive }}
          >
            {error}
          </Text>
        ) : hint ? (
          <Text variant="caption" tone="secondary">
            {hint}
          </Text>
        ) : null}
      </View>
    );
  },
);

const styles = StyleSheet.create({
  input: {
    borderWidth: StyleSheet.hairlineWidth * 2,
    minHeight: sizing.fieldHeight,
  },
  multiline: {
    // Two fields tall — enough for a sentence without the screen scrolling.
    minHeight: sizing.fieldHeight * 2,
    textAlignVertical: "top",
  },
});
