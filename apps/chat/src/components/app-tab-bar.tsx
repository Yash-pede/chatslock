import type { BottomTabBarProps } from "expo-router/js-tabs";
import { Pressable, StyleSheet, View } from "react-native";
import {
  Icon,
  Text,
  radius,
  sizing,
  spacing,
  useTheme,
  type IconName,
} from "@repo/ui";

/** Labels and glyphs for the three primary tabs, keyed by route name. */
const TABS: Record<string, { label: string; icon: IconName }> = {
  index: { label: "Chats", icon: "chats" },
  settings: { label: "Settings", icon: "settings" },
  profile: { label: "Profile", icon: "profile" },
};

/**
 * The app's bottom navigation.
 *
 * Replaces the default tab bar so the active tab gets the tinted icon pill and
 * accent label, while the bar itself stays a hairline-separated surface that
 * matches the rest of the theme.
 */
export function AppTabBar({
  state,
  descriptors,
  navigation,
  insets,
}: BottomTabBarProps) {
  const { colors } = useTheme();

  return (
    <View
      style={[
        styles.root,
        {
          backgroundColor: colors.card,
          borderTopColor: colors.border,
          height: sizing.tabBarHeight + insets.bottom,
          paddingBottom: insets.bottom,
        },
      ]}
    >
      {state.routes.map((route, index) => {
        const meta = TABS[route.name];
        if (!meta) return null;

        const focused = state.index === index;
        const options = descriptors[route.key]?.options;
        const color = focused ? colors.primary : colors.mutedForeground;

        const onPress = () => {
          const event = navigation.emit({
            type: "tabPress",
            target: route.key,
            canPreventDefault: true,
          });

          if (!focused && !event.defaultPrevented) {
            navigation.navigate(route.name, route.params);
          }
        };

        const onLongPress = () => {
          navigation.emit({ type: "tabLongPress", target: route.key });
        };

        return (
          <Pressable
            key={route.key}
            accessibilityRole="button"
            accessibilityState={focused ? { selected: true } : {}}
            accessibilityLabel={
              options?.tabBarAccessibilityLabel ?? meta.label
            }
            testID={options?.tabBarButtonTestID}
            onPress={onPress}
            onLongPress={onLongPress}
            style={styles.tab}
          >
            <View
              style={[
                styles.pill,
                focused && {
                  backgroundColor: colors.accent,
                  borderRadius: radius.pill,
                },
              ]}
            >
              <Icon name={meta.icon} size={sizing.icon} color={color} />
            </View>

            <Text variant="label" style={{ color }}>
              {meta.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flexDirection: "row",
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: spacing.xs,
  },
  tab: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xxs,
  },
  pill: {
    width: 56,
    height: 32,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
});
