import React from "react";
import { Modal, Pressable, View } from "react-native";
import Animated, { FadeIn, FadeOut, ZoomIn, ZoomOut } from "react-native-reanimated";
import { cn } from "../lib/utils";
import { radius } from "../lib/radius";
import { Text } from "./text";

type ViewProps = React.ComponentPropsWithoutRef<typeof View> & {
  className?: string;
  children?: React.ReactNode;
};
type TextProps = React.ComponentPropsWithoutRef<typeof Text> & { className?: string };
type PressableProps = React.ComponentPropsWithoutRef<typeof Pressable> & {
  className?: string;
  children: React.ReactNode;
};

export interface AlertDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
}

/** AniUI alert dialog: scrim + zoomed card, dismissed via back button or a Cancel action. */
export function AlertDialog({ open, onOpenChange, children }: AlertDialogProps) {
  return (
    <Modal
      visible={open}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={() => onOpenChange(false)}
    >
      <Animated.View
        entering={FadeIn.duration(150)}
        exiting={FadeOut.duration(100)}
        className="flex-1 items-center justify-center bg-black/50"
      >
        <Pressable
          className="absolute inset-0"
          onPress={() => onOpenChange(false)}
          accessibilityRole="button"
          accessibilityLabel="Dismiss dialog"
        />
        <Animated.View entering={ZoomIn.duration(200)} exiting={ZoomOut.duration(150)}>
          {children}
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

export function AlertDialogContent({ className, ...props }: ViewProps) {
  return (
    <View
      className={cn("mx-6 w-80 bg-card p-6 shadow-xl", radius.surface, className)}
      accessibilityRole="alert"
      {...props}
    />
  );
}

export function AlertDialogHeader({ className, ...props }: ViewProps) {
  return <View className={cn("pb-4", className)} {...props} />;
}

export function AlertDialogTitle({ className, ...props }: TextProps) {
  return <Text className={cn("text-lg font-semibold text-card-foreground", className)} {...props} />;
}

export function AlertDialogDescription({ className, ...props }: TextProps) {
  return <Text className={cn("mt-1 text-sm text-muted-foreground", className)} {...props} />;
}

export function AlertDialogFooter({ className, ...props }: ViewProps) {
  return <View className={cn("flex-row justify-end gap-3 pt-4", className)} {...props} />;
}

export function AlertDialogAction({ className, children, ...props }: PressableProps) {
  return (
    <Pressable
      className={cn(
        "min-h-12 items-center justify-center bg-primary px-4 py-2.5 active:opacity-85",
        radius.control,
        className,
      )}
      accessible
      accessibilityRole="button"
      {...props}
    >
      {typeof children === "string" ? (
        <Text className="text-sm font-medium text-primary-foreground">{children}</Text>
      ) : (
        children
      )}
    </Pressable>
  );
}

export function AlertDialogCancel({ className, children, ...props }: PressableProps) {
  return (
    <Pressable
      className={cn(
        "min-h-12 items-center justify-center border border-input px-4 py-2.5 active:bg-secondary/60",
        radius.control,
        className,
      )}
      accessible
      accessibilityRole="button"
      {...props}
    >
      {typeof children === "string" ? (
        <Text className="text-sm font-medium text-foreground">{children}</Text>
      ) : (
        children
      )}
    </Pressable>
  );
}
