import { Image } from "expo-image"
import { View } from "react-native"
import { Text } from "@repo/ui"

export interface UserAvatarProps {
  size?: number
  avatar?: string | null
  /** Used for the initials fallback and the accessibility label. */
  name: string
  className?: string
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean).slice(0, 2)
  if (parts.length === 0) return "?"
  if (parts.length === 1) return parts[0]!.charAt(0).toUpperCase()
  return parts.map((part) => part.charAt(0).toUpperCase()).join("")
}

/** Circular user avatar with a deterministic initials fallback. */
export function UserAvatar({ size = 54, avatar, name, className }: UserAvatarProps) {
  const shape = { width: size, height: size, borderRadius: size / 2 }

  if (avatar) {
    return (
      <Image
        source={{ uri: avatar }}
        style={shape}
        contentFit="cover"
        transition={120}
        accessibilityLabel={name}
      />
    )
  }

  return (
    <View
      style={shape}
      className={`items-center justify-center bg-accent ${className ?? ""}`}
      accessibilityRole="image"
      accessibilityLabel={name}
    >
      <Text
        className="text-accent-foreground font-semibold"
        style={{ fontSize: Math.round(size * 0.36) }}
      >
        {initials(name)}
      </Text>
    </View>
  )
}
