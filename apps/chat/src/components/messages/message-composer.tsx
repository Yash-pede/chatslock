import { useMemo, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Pressable,
  TextInput,
  useColorScheme,
  type TextInputInstance,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { EmojiSheetView } from "expo-native-sheet-emojis";
import { Paperclip, SendHorizontal, Smile } from "lucide-react-native";
import { useThemeColors } from "@repo/ui";

const EMOJI_PANEL_HEIGHT = 320;

export interface MessageComposerProps {
  /** Called with the trimmed text; the field clears only when this resolves. */
  onSend: (text: string) => void | Promise<void>;
  disabled?: boolean;
  /** While true the keyboard is dismissed and the emoji panel takes its place. */
  emojiOpen?: boolean;
  onEmojiOpenChange?: (open: boolean) => void;
}

/**
 * Bottom composer: attach, input, emoji toggle and send. The emoji picker is the
 * native `EmojiSheetView` rendered inline so it can slide up from the bottom in
 * the keyboard's place (Telegram-style) instead of covering the conversation.
 */
export function MessageComposer({
  onSend,
  disabled = false,
  emojiOpen = false,
  onEmojiOpenChange,
}: MessageComposerProps) {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const dark = useColorScheme() === "dark";
  const inputRef = useRef<TextInputInstance>(null);
  const [value, setValue] = useState("");
  const canSend = value.trim().length > 0 && !disabled;

  // Drives the panel's slide/height so opening and closing are animated
  // rather than snapping.
  const panelProgress = useState(() => new Animated.Value(emojiOpen ? 1 : 0))[0];

  const toggleEmoji = () => {
    const next = !emojiOpen;

    if (next) {
      // Hide the keyboard first; the panel grows into the freed space.
      inputRef.current?.blur();
    }

    Animated.timing(panelProgress, {
      toValue: next ? 1 : 0,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();

    onEmojiOpenChange?.(next);
  };

  // Derived once: interpolations only re-read the animated value, they are not
  // state, so computing this during render is safe.
  const panelHeight = useMemo(
    () =>
      panelProgress.interpolate({
        inputRange: [0, 1],
        outputRange: [0, EMOJI_PANEL_HEIGHT],
      }),
    [panelProgress],
  );

  const insertEmoji = (emoji: string) => {
    setValue((current) => `${current}${emoji}`);
  };

  return (
    <View
      className="border-t border-border bg-background"
      style={{ paddingBottom: insets.bottom + 8 }}
    >
      <View className="flex-row items-end gap-2 px-3 pt-2">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Attach"
          hitSlop={8}
          disabled
          className="h-10 w-10 items-center justify-center rounded-full opacity-40"
        >
          <Paperclip size={20} color={colors.mutedForeground} />
        </Pressable>

        <View className="min-h-10 flex-1 flex-row items-end rounded-2xl bg-secondary px-3 py-2">
          <TextInput
            ref={inputRef}
            value={value}
            onChangeText={setValue}
            placeholder="Message"
            placeholderTextColor={colors.mutedForeground}
            multiline
            maxLength={4000}
            className="max-h-28 flex-1 p-0 text-foreground"
            style={{ fontSize: 16 }}
            selectionColor={colors.primary}
            cursorColor={colors.primary}
            keyboardAppearance={dark ? "dark" : "light"}
            onFocus={() => {
              if (!emojiOpen) return;
              // Tapping the field swaps the panel back to the keyboard.
              panelProgress.setValue(0);
              onEmojiOpenChange?.(false);
            }}
          />
          <Pressable
            onPress={toggleEmoji}
            accessibilityRole="button"
            accessibilityLabel={
              emojiOpen ? "Hide emoji panel" : "Show emoji panel"
            }
            accessibilityState={{ expanded: emojiOpen }}
            hitSlop={8}
            className="ms-1 h-6 w-6 items-center justify-center"
          >
            <Smile
              size={18}
              color={emojiOpen ? colors.primary : colors.mutedForeground}
            />
          </Pressable>
        </View>

        <Pressable
          onPress={() => void onSend(value.trim())}
          disabled={!canSend}
          accessibilityRole="button"
          accessibilityLabel="Send message"
          className={`h-10 w-10 items-center justify-center rounded-full ${
            canSend ? "bg-primary" : "bg-secondary"
          }`}
        >
          <SendHorizontal
            size={18}
            color={canSend ? colors.primaryForeground : colors.mutedForeground}
          />
        </Pressable>
      </View>

      {/*
          Always mounted: the native view is expensive to create on demand, so
          mounting it at the moment of the tap is what made opening feel janky.
        */}
      <Animated.View style={{ height: panelHeight, overflow: "hidden" }}>
        <View style={{ height: EMOJI_PANEL_HEIGHT }}>
          <EmojiSheetView
            style={{ flex: 1 }}
            theme="system"
            categoryBarPosition="bottom"
            columns={8}
            emojiSize={30}
            enableHaptics
            enableAnimations
            onEmojiSelected={(emoji) => insertEmoji(emoji)}
          />
        </View>
      </Animated.View>
    </View>
  );
}
