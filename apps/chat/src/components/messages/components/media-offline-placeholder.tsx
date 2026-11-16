import { View } from "react-native"
import { WifiOff } from "lucide-react-native"
import { Text, useThemeColors } from "@repo/ui"

export interface MediaOfflinePlaceholderProps {
  width: number
  height: number
  label?: string
  /** Dark full-screen viewer vs. an in-bubble surface. */
  tone?: "default" | "dark"
}

/** Stand-in for media that cannot be fetched (usually because the app is offline). */
export function MediaOfflinePlaceholder({
  width,
  height,
  label = "Unavailable offline",
  tone = "default",
}: MediaOfflinePlaceholderProps) {
  const colors = useThemeColors()
  const dark = tone === "dark"
  const tint = dark ? "rgba(255,255,255,0.72)" : colors.mutedForeground

  return (
    <View
      style={{ width, height, borderRadius: dark ? 0 : 10 }}
      className={`items-center justify-center gap-1.5 ${dark ? "bg-white/5" : "bg-black/10"}`}
      accessibilityRole="image"
      accessibilityLabel={label}
    >
      <WifiOff size={dark ? 24 : 20} color={tint} />
      <Text
        variant="small"
        className={`px-2 text-center font-normal ${dark ? "text-white/70" : "text-muted-foreground"}`}
      >
        {label}
      </Text>
    </View>
  )
}
