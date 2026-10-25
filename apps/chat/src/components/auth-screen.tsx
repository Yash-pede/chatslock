import React from "react"
import { Pressable, ScrollView, View } from "react-native"
import { SafeArea, Text, useThemeColors } from "@repo/ui"
import { ArrowLeft } from "lucide-react-native"
import { router } from "expo-router"

interface AuthScreenProps {
  title: string
  subtitle?: string
  /** Renders a back arrow above the title. It always returns to the method screen. */
  back?: boolean
  children: React.ReactNode
  footer?: React.ReactNode
}

/**
 * Shared scaffold for every signed-out screen: a brand mark, title block, and
 * a full-bleed form column. No card wrapper — the form sits directly on the
 * screen background so the inputs read as the primary surface.
 */
export function AuthScreen({ title, subtitle, back, children, footer }: AuthScreenProps) {
  const colors = useThemeColors()

  // Sign-in screens swap each other with `replace`, so there is no previous
  // screen to pop to; dismissing goes to the method screen instead.
  const goBack = () => router.dismissTo("/login")

  return (
    <SafeArea>
      <ScrollView
        className="flex-1"
        contentContainerClassName="flex-grow justify-center px-6 pt-16 pb-10"
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        {back ? (
          <Pressable
            onPress={goBack}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Go back"
            className="absolute left-4 top-2 h-10 w-10 items-center justify-center rounded-full active:opacity-60"
          >
            <ArrowLeft size={22} color={colors.foreground} />
          </Pressable>
        ) : null}

        <View className="mb-10">
          <Text variant="h2" className="text-center">
            {title}
          </Text>
          {subtitle ? (
            <Text variant="muted" className="mt-2 px-4 text-center leading-5">
              {subtitle}
            </Text>
          ) : null}
        </View>

        <View className="gap-5">{children}</View>

        {footer ? <View className="mt-10">{footer}</View> : null}
      </ScrollView>
    </SafeArea>
  )
}
