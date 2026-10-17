import {
  Pressable,
  StyleSheet,
  type StyleProp,
  type ViewStyle,
} from "react-native";

import { radius, sizing, spacing, useTheme } from "../theme";
import { Icon, type IconName } from "./icon";

export interface IconButtonProps {
  name: IconName;
  /** Required: an icon alone tells a screen reader nothing. */
  accessibilityLabel: string;
  onPress?: () => void;
  color?: string;
  size?: number;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/** A borderless icon-only control, sized to the platform's 44pt tap floor. */
export function IconButton({
  name,
  accessibilityLabel,
  onPress,
  color,
  size = sizing.icon,
  disabled = false,
  style,
  testID,
}: IconButtonProps) {
  const { colors } = useTheme();

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={spacing.sm}
      style={({ pressed }) => [
        styles.root,
        {
          borderRadius: radius.pill,
          backgroundColor: pressed ? colors.pressed : "transparent",
        },
        disabled && styles.disabled,
        style,
      ]}
    >
      <Icon name={name} size={size} color={color ?? colors.foreground} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    width: sizing.hitSlop,
    height: sizing.hitSlop,
    alignItems: "center",
    justifyContent: "center",
  },
  disabled: {
    opacity: 0.4,
  },
});
