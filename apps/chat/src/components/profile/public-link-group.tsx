import { useState } from "react"
import { Share } from "react-native"
import * as Clipboard from "expo-clipboard"
import { Link2, Share2 } from "lucide-react-native"
import { SettingsGroup, SettingsIcon, SettingsRow, Text, useThemeColors } from "@repo/ui"

/** Copy/share rows for an agent's public profile link. */
export function PublicLinkGroup({ link, name }: { link: string; name: string }) {
  const colors = useThemeColors()
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    await Clipboard.setStringAsync(link)
    setCopied(true)
    setTimeout(() => setCopied(false), 1600)
  }

  const share = () =>
    void Share.share({
      title: `${name} on Chatslock`,
      message: `Chat with ${name} on Chatslock: ${link}`,
      url: link,
    })

  return (
    <SettingsGroup
      title="Public profile"
      footer="Your link lets people start a conversation with you without seeing your phone number."
    >
      <SettingsRow
        title="Copy link"
        description={copied ? "Copied to clipboard" : link}
        onPress={() => void copy()}
        leading={
          <SettingsIcon>
            <Link2 size={16} color={colors.primary} />
          </SettingsIcon>
        }
        trailing={
          <Text variant="small" className={copied ? "text-primary" : "text-muted-foreground"}>
            {copied ? "Copied" : "Copy"}
          </Text>
        }
      />
      <SettingsRow
        title="Share link"
        description="Send your profile to someone"
        onPress={share}
        leading={
          <SettingsIcon>
            <Share2 size={16} color={colors.primary} />
          </SettingsIcon>
        }
      />
    </SettingsGroup>
  )
}
