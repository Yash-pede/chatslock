import {
  Pressable,
  StyleSheet,
  type StyleProp,
  type ViewStyle,
} from "react-native";

import { radius, shadowStyle, sizing, useTheme } from "../theme";
import { Icon, type IconName } from "./icon";

export interface FabProps {
  accessibilityLabel: string;
  onPress: () => void;
  icon?: IconName;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/** The circular primary action that floats above a list. */
export function Fab({
  accessibilityLabel,
  onPress,
  icon = "plus",
  style,
  testID,
}: FabProps) {
  const { colors, shadows } = useTheme();

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={({ pressed }) => [
        styles.root,
        {
          backgroundColor: colors.primary,
          borderRadius: radius.pill,
        },
        shadowStyle(shadows.lg),
        pressed && styles.pressed,
        style,
      ]}
    >
      <Icon name={icon} size={sizing.iconLarge} color={colors.primaryForeground} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    width: sizing.fab,
    height: sizing.fab,
    alignItems: "center",
    justifyContent: "center",
  },
  pressed: {
    opacity: 0.85,
  },
});
