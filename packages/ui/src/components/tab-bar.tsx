import React from "react";
import { View, Pressable, Text } from "react-native";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../lib/utils";

const tabBarVariants = cva("flex-row items-stretch border-t px-2 pt-2", {
  variants: {
    variant: {
      default: "bg-background border-border",
      card: "bg-card border-border",
      transparent: "bg-transparent border-transparent",
    },
  },
  defaultVariants: { variant: "default" },
});

export interface TabBarProps
  extends React.ComponentPropsWithoutRef<typeof View>,
    VariantProps<typeof tabBarVariants> {
  className?: string;
  children?: React.ReactNode;
}

/** AniUI bottom tab bar. Safe-area bottom padding belongs to the caller. */
export function TabBar({ variant, className, children, ...props }: TabBarProps) {
  return (
    <View
      className={cn(tabBarVariants({ variant }), className)}
      accessibilityRole="tablist"
      {...props}
    >
      {children}
    </View>
  );
}

export interface TabBarItemProps extends React.ComponentPropsWithoutRef<typeof Pressable> {
  className?: string;
  active?: boolean;
  icon?: React.ReactNode;
  label?: string;
  badge?: number;
  onPress?: () => void;
}

export function TabBarItem({
  active,
  icon,
  label,
  badge,
  className,
  onPress,
  ...props
}: TabBarItemProps) {
  return (
    <Pressable
      className={cn("min-h-12 flex-1 items-center justify-center gap-1 pb-2", className)}
      accessible
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      accessibilityLabel={label}
      onPress={onPress}
      {...props}
    >
      {icon ? (
        <View
          className={cn(
            // Radius must live in className: uniwind re-resolves the class on
            // theme/inset changes and would override an inline borderRadius.
            "h-8 w-16 items-center justify-center",
            active && "bg-accent rounded-xl",
          )}
        >
          {icon}
        </View>
      ) : null}
      {label ? (
        <Text
          className={cn(
            "text-xs",
            active ? "font-medium text-primary" : "text-muted-foreground"
          )}
        >
          {label}
        </Text>
      ) : null}
      {badge !== undefined && badge > 0 ? (
        <View className="absolute end-1/4 -top-1 h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1">
          <Text className="text-[10px] font-bold text-destructive-foreground">
            {badge > 99 ? "99+" : badge}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}
