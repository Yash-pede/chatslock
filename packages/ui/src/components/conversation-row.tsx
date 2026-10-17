import { Pressable, StyleSheet, View } from "react-native";

import { sizing, spacing, useTheme } from "../theme";
import { Avatar } from "./avatar";
import { Badge } from "./badge";
import { Icon } from "./icon";
import { Text } from "./text";

export interface ConversationRowProps {
  name: string;
  /** The last message, already formatted for display. */
  preview: string;
  /** The time label — "09:42", "Yesterday", "Mon". */
  time: string;
  avatarUri?: string | null;
  unreadCount?: number;
  /** Draws the unread pill in the accent colour — an unread mention. */
  mention?: boolean;
  muted?: boolean;
  verified?: boolean;
  /** Shows the double tick when the last outgoing message was read. */
  read?: boolean;
  onPress?: () => void;
  testID?: string;
}

/**
 * One conversation in the chats list.
 *
 * Fixed at `sizing.rowHeight` so a `FlatList` can use `getItemLayout` and skip
 * measuring rows. The divider is absolute and inset to the text column, which
 * is what makes the avatar column read as one continuous rail.
 */
export function ConversationRow({
  name,
  preview,
  time,
  avatarUri,
  unreadCount = 0,
  mention = false,
  muted = false,
  verified = false,
  read = false,
  onPress,
  testID,
}: ConversationRowProps) {
  const { colors } = useTheme();

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={`${name}. ${preview}. ${time}`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.root,
        pressed && { backgroundColor: colors.pressed },
      ]}
    >
      <Avatar uri={avatarUri} name={name} size={sizing.avatar} />

      <View style={styles.content}>
        <View style={styles.line}>
          <View style={styles.nameRow}>
            <Text variant="headline" numberOfLines={1} style={styles.name}>
              {name}
            </Text>
            {verified ? (
              <Icon
                name="verified"
                size={sizing.iconSmall}
                color={colors.primary}
              />
            ) : null}
            {muted ? (
              <Icon
                name="bellOff"
                size={sizing.iconSmall}
                color={colors.faintForeground}
              />
            ) : null}
          </View>

          {read ? (
            <Icon name="read" size={sizing.iconSmall} color={colors.online} />
          ) : null}

          <Text variant="caption" tone="tertiary">
            {time}
          </Text>
        </View>

        <View style={styles.line}>
          <Text
            variant="subhead"
            tone="secondary"
            numberOfLines={1}
            style={styles.preview}
          >
            {preview}
          </Text>

          {unreadCount > 0 ? (
            <Badge
              count={unreadCount}
              variant={mention ? "primary" : "muted"}
            />
          ) : null}
        </View>
      </View>

      <View
        style={[
          styles.divider,
          {
            backgroundColor: colors.border,
            left: spacing.lg + sizing.avatar + spacing.md,
          },
        ]}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    position: "relative",
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    height: sizing.rowHeight,
    paddingHorizontal: spacing.lg,
  },
  content: {
    flex: 1,
    justifyContent: "center",
    gap: spacing.xxs,
  },
  line: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  nameRow: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  name: {
    flexShrink: 1,
  },
  preview: {
    flex: 1,
  },
  divider: {
    position: "absolute",
    right: spacing.lg,
    bottom: 0,
    height: StyleSheet.hairlineWidth,
  },
});
