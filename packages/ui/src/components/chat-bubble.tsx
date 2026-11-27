import React from "react"
import { View, Text as RNText } from "react-native"
import { cva, type VariantProps } from "class-variance-authority"
import { Check, CheckCheck, CornerUpRight, Pin } from "lucide-react-native"
import { cn } from "../lib/utils"
import { radius } from "../lib/radius"
import { useThemeColors } from "./theme-provider"

const bubbleVariants = cva("max-w-[80%] px-3.5 py-2", {
  variants: {
    variant: {
      sent: "self-end bg-primary rounded-br-sm",
      received: "self-start bg-secondary rounded-bl-sm",
    },
  },
  defaultVariants: { variant: "received" },
})

const textVariants = cva("text-base leading-5", {
  variants: {
    variant: {
      sent: "text-primary-foreground",
      received: "text-secondary-foreground",
    },
  },
  defaultVariants: { variant: "received" },
})

export type ChatBubbleStatus = "sending" | "sent" | "delivered" | "read" | "failed"

export interface ChatBubbleProps
  extends React.ComponentPropsWithoutRef<typeof View>, VariantProps<typeof bubbleVariants> {
  className?: string
  textClassName?: string
  children: React.ReactNode
  timestamp?: string
  status?: ChatBubbleStatus
  /** Shows a small filled pin beside the timestamp. */
  starred?: boolean
  /** Shows a muted "Forwarded" tag at the top of the bubble content. */
  isForwarded?: boolean
  /** Quoted message block rendered above the content (replies). */
  replyPreview?: React.ReactNode
}

/** AniUI chat bubble: sent (primary, right) and received (secondary, left). */
export function ChatBubble({
  variant,
  className,
  textClassName,
  children,
  timestamp,
  status,
  starred = false,
  isForwarded = false,
  replyPreview,
  ...props
}: ChatBubbleProps) {
  const isSent = variant === "sent"
  const colors = useThemeColors()
  const tick = `${colors.primaryForeground}b3`
  const forwardedColor = isSent ? `${colors.primaryForeground}99` : colors.mutedForeground

  return (
    <View className={cn(bubbleVariants({ variant }), radius.surface, className)} {...props}>
      {isForwarded ? (
        <View className="mb-0.5 flex-row items-center gap-1">
          <CornerUpRight size={12} color={forwardedColor} />
          <RNText
            className={cn(
              "text-[11px] font-medium",
              isSent ? "text-primary-foreground/60" : "text-muted-foreground",
            )}
          >
            Forwarded
          </RNText>
        </View>
      ) : null}
      {replyPreview}
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
          {starred ? (
            <Pin
              size={10}
              color={isSent ? `${colors.primaryForeground}99` : colors.mutedForeground}
              fill={isSent ? `${colors.primaryForeground}99` : colors.mutedForeground}
            />
          ) : null}
          {status && isSent ? (
            status === "sent" || status === "sending" ? (
              <Check
                size={12}
                color={status === "sending" ? `${colors.primaryForeground}66` : tick}
              />
            ) : (
              <CheckCheck
                size={12}
                color={
                  status === "read"
                    ? colors.accentForeground
                    : status === "failed"
                      ? colors.destructive
                      : tick
                }
              />
            )
          ) : null}
        </View>
      ) : null}
    </View>
  )
}
