import React from "react";
import { View, Text as RNText } from "react-native";
import { cva, type VariantProps } from "class-variance-authority";
import { Check, CheckCheck } from "lucide-react-native";
import { cn } from "../lib/utils";
import { radius } from "../lib/radius";
import { useThemeColors } from "./theme-provider";

const bubbleVariants = cva("max-w-[80%] px-3.5 py-2", {
  variants: {
    variant: {
      sent: "self-end bg-primary rounded-br-sm",
      received: "self-start bg-secondary rounded-bl-sm",
    },
  },
  defaultVariants: { variant: "received" },
});

const textVariants = cva("text-base leading-5", {
  variants: {
    variant: {
      sent: "text-primary-foreground",
      received: "text-secondary-foreground",
    },
  },
  defaultVariants: { variant: "received" },
});

export type ChatBubbleStatus = "sending" | "sent" | "delivered" | "read" | "failed";

export interface ChatBubbleProps
  extends React.ComponentPropsWithoutRef<typeof View>,
    VariantProps<typeof bubbleVariants> {
  className?: string;
  textClassName?: string;
  children: React.ReactNode;
  timestamp?: string;
  status?: ChatBubbleStatus;
}

/** AniUI chat bubble: sent (primary, right) and received (secondary, left). */
export function ChatBubble({
  variant,
  className,
  textClassName,
  children,
  timestamp,
  status,
  ...props
}: ChatBubbleProps) {
  const isSent = variant === "sent";
  const colors = useThemeColors();
  const tick = `${colors.primaryForeground}b3`;

  return (
    <View className={cn(bubbleVariants({ variant }), radius.surface, className)} {...props}>
      {typeof children === "string" ? (
        <RNText className={cn(textVariants({ variant }), textClassName)}>{children}</RNText>
      ) : (
        children
      )}
      {timestamp || status ? (
        <View
          className={cn("mt-1 flex-row items-center gap-1", isSent ? "self-end" : "self-start")}
        >
          {timestamp ? (
            <RNText
              className={cn(
                "text-[10px]",
                isSent ? "text-primary-foreground/60" : "text-muted-foreground",
              )}
            >
              {timestamp}
            </RNText>
          ) : null}
          {status && isSent
            ? status === "sent" || status === "sending" ? (
                <Check size={12} color={status === "sending" ? `${colors.primaryForeground}66` : tick} />
              ) : (
                <CheckCheck
                  size={12}
                  color={status === "read" ? colors.accentForeground : status === "failed" ? colors.destructive : tick}
                />
              )
            : null}
        </View>
      ) : null}
    </View>
  );
}
