import { Linking, Text, type TextProps } from "react-native"
import { useThemeColors } from "@repo/ui"

const LINK_REGEX = /https?:\/\/[^\s<>"']+|www\.[^\s<>"']+/gi
const TRAILING_PUNCTUATION = /[.,!?;:)\]}]+$/
/** Light blue that stays readable on both light and dark primary bubbles. */
const SENT_LINK_COLOR = "#DBEAFE"

interface TextPart {
  text: string
  href?: string
}

function splitLinks(value: string): TextPart[] {
  const parts: TextPart[] = []
  let cursor = 0

  for (const match of value.matchAll(LINK_REGEX)) {
    const start = match.index ?? 0
    const raw = match[0].replace(TRAILING_PUNCTUATION, "")
    if (!raw) continue

    if (start > cursor) parts.push({ text: value.slice(cursor, start) })
    parts.push({
      text: raw,
      href: raw.toLowerCase().startsWith("www.") ? `https://${raw}` : raw,
    })
    cursor = start + raw.length
  }

  if (cursor < value.length) parts.push({ text: value.slice(cursor) })
  return parts
}

/**
 * Message text with clickable http(s) and www links. Links inherit the bubble's
 * font but get an underline and a contrasting colour: primary blue on received
 * bubbles, light text on the already-blue sent bubble.
 */
export function LinkifiedText({
  text,
  isMine,
  className,
  style,
}: {
  text: string
  isMine: boolean
  className?: string
  style?: TextProps["style"]
}) {
  const colors = useThemeColors()
  const parts = splitLinks(text)
  const linkColor = isMine ? SENT_LINK_COLOR : colors.primary

  return (
    <Text className={className} style={style}>
      {parts.map((part, index) =>
        part.href ? (
          <Text
            key={`${part.href}-${index}`}
            accessibilityRole="link"
            onPress={() => {
              void Linking.openURL(part.href!).catch(() => undefined)
            }}
            style={{
              color: linkColor,
              fontWeight: "600",
              textDecorationLine: "underline",
            }}
          >
            {part.text}
          </Text>
        ) : (
          part.text
        ),
      )}
    </Text>
  )
}
