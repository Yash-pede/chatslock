import {
  Image,
  Pressable,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";

import { avatarPalette, radius, sizing, useTheme } from "../theme";
import { Icon } from "./icon";
import { Text } from "./text";

export interface AvatarProps {
  /** Image to show. When absent, the avatar falls back to initials. */
  uri?: string | null;
  /** Name used for the initials fallback and its derived tint. */
  name?: string;
  size?: number;
  /** Shows a camera badge and makes the whole avatar pressable. */
  editable?: boolean;
  onPress?: () => void;
  /** Overrides the tint derived from `name`. */
  color?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

function initialsFor(name?: string): string {
  if (!name) return "";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "";
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return (first + last).toUpperCase();
}

function tintFor(name?: string): string {
  const fallback = avatarPalette[0];
  if (!name) return fallback;
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  }
  return avatarPalette[hash % avatarPalette.length] ?? fallback;
}

export function Avatar({
  uri,
  name,
  size = sizing.avatar,
  editable = false,
  onPress,
  color,
  style,
  testID,
}: AvatarProps) {
  const { colors } = useTheme();
  const initials = initialsFor(name);

  const badgeSize = Math.round(size * 0.34);

  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? "button" : undefined}
      accessibilityLabel={onPress ? "Change profile picture" : undefined}
      style={[styles.root, { width: size, height: size }, style]}
    >
      {uri ? (
        <Image
          source={{ uri }}
          resizeMode="cover"
          style={{ width: size, height: size, borderRadius: radius.pill }}
        />
      ) : (
        <View
          style={[
            styles.fallback,
            {
              width: size,
              height: size,
              borderRadius: radius.pill,
              backgroundColor: color ?? tintFor(name),
            },
          ]}
        >
          <Text
            variant="headline"
            style={{
              color: colors.primaryForeground,
              fontSize: Math.round(size * 0.4),
              lineHeight: Math.round(size * 0.46),
            }}
          >
            {initials || "?"}
          </Text>
        </View>
      )}

      {editable ? (
        <View
          style={[
            styles.badge,
            {
              width: badgeSize,
              height: badgeSize,
              borderRadius: radius.pill,
              backgroundColor: colors.primary,
              borderColor: colors.background,
            },
          ]}
        >
          <Icon
            name="camera"
            size={Math.round(badgeSize * 0.6)}
            color={colors.primaryForeground}
          />
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    alignItems: "center",
    justifyContent: "center",
  },
  fallback: {
    alignItems: "center",
    justifyContent: "center",
  },
  badge: {
    position: "absolute",
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth * 2,
  },
});
