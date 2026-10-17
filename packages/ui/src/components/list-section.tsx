import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";

import { spacing } from "../theme";
import { ListRow, type ListRowProps } from "./list-row";
import { Text } from "./text";

export interface ListSectionProps {
  title?: string;
  items: ListRowProps[];
  style?: StyleProp<ViewStyle>;
}

/**
 * A titled group of rows with hairline separators between them.
 *
 * Sections are data-driven so a settings screen is a list of labels, icons and
 * handlers — not a tree of container views and divider components.
 */
export function ListSection({ title, items, style }: ListSectionProps) {
  return (
    <View style={style}>
      {title ? (
        <Text variant="headline" style={styles.title}>
          {title}
        </Text>
      ) : null}

      {items.map((item, index) => (
        <ListRow
          key={`${item.label}-${index}`}
          {...item}
          showDivider={item.showDivider ?? index < items.length - 1}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  title: {
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.xs,
  },
});
