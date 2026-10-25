import { useState } from "react"
import { Pressable, ScrollView, Share, View } from "react-native"
import * as Clipboard from "expo-clipboard"
import * as ImagePicker from "expo-image-picker"
import {
  AtSign,
  Camera,
  KeyRound,
  Link2,
  LogOut,
  Phone,
  Share2,
  ShieldCheck,
  UserRound,
  X,
} from "lucide-react-native"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
  Input,
  Label,
  SafeArea,
  SaveButton,
  SettingsGroup,
  SettingsIcon,
  SettingsRow,
  Text,
  useThemeColors,
} from "@repo/ui"
import { extractErrorMessage } from "@repo/utils"
import type { AvatarContentType } from "@repo/types/req"
import { userProfileUrl } from "@/lib/links"
import { usersApi } from "@/api/users.api"
import { useAuth } from "@/context/AuthContext"
import { useProfile } from "@/context/profile/ProfileContext"
import { AvatarViewer } from "@/components/profile/avatar-viewer"
import { UserAvatar } from "@/components/user-avatar"

const AVATAR_SIZE = 96

const MIME_BY_EXTENSION: Record<string, AvatarContentType> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
}

const DEFAULT_EXTENSION: Record<AvatarContentType, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
}

/** Picks the MIME type from the asset, falling back to the file extension. */
function resolveContentType(asset: ImagePicker.ImagePickerAsset): AvatarContentType | null {
  if (asset.mimeType && asset.mimeType in DEFAULT_EXTENSION) {
    return asset.mimeType as AvatarContentType
  }

  const extension = asset.fileName?.split(".").pop()?.toLowerCase()
  return extension ? (MIME_BY_EXTENSION[extension] ?? null) : null
}

/** Only two labels are shown in the app: members and support agents. */
function roleLabel(role: string | undefined): string {
  return role === "agent" ? "Support agent" : "Member"
}

/**
 * The signed-in user's profile in the iOS/Telegram grouped-list style. Agents
 * additionally get a shareable public profile link; only fields the API can
 * persist are editable.
 */
export default function ProfileScreen() {
  const colors = useThemeColors()
  const { user, reload } = useProfile()
  const { signOut } = useAuth()

  const [editingName, setEditingName] = useState(false)
  const [nameDraft, setNameDraft] = useState("")
  const [uploading, setUploading] = useState(false)
  const [avatarUri, setAvatarUri] = useState<string | null>(null)
  const [viewerOpen, setViewerOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [linkCopied, setLinkCopied] = useState(false)
  const [signOutOpen, setSignOutOpen] = useState(false)

  const displayName = user?.fullName ?? user?.username ?? "Your profile"
  const avatar = avatarUri ?? user?.avatar ?? null
  const handle = user?.username ? `@${user.username}` : "Chatslock member"
  const isAgent = user?.role === "agent"
  // Agents get a shareable public profile URL on the marketing site.
  const publicLink = isAgent && user?.userId ? userProfileUrl(user.userId) : null

  const copyLink = async () => {
    if (!publicLink) return
    try {
      await Clipboard.setStringAsync(publicLink)
      // The row itself flips to "Copied", which is all the feedback we need.
      setLinkCopied(true)
      setTimeout(() => setLinkCopied(false), 1600)
    } catch (e) {
      setError(extractErrorMessage(e))
    }
  }

  const shareLink = async () => {
    if (!publicLink) return
    try {
      await Share.share({
        title: `${displayName} on Chatslock`,
        message: `Chat with ${displayName} on Chatslock: ${publicLink}`,
        url: publicLink,
      })
    } catch (e) {
      setError(extractErrorMessage(e))
    }
  }

  const pickAvatar = async () => {
    setError(null)

    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (!permission.granted) {
      setError("Photo access is needed to change your avatar.")
      return
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.85,
    })
    if (result.canceled) return

    const asset = result.assets[0]
    const contentType = asset ? resolveContentType(asset) : null
    if (!asset || !contentType) {
      setError("Only JPEG, PNG or WebP images are supported.")
      return
    }

    setUploading(true)
    try {
      const nextAvatar = await usersApi.uploadAvatar({
        uri: asset.uri,
        contentType,
        fileName: asset.fileName ?? `avatar.${DEFAULT_EXTENSION[contentType]}`,
      })
      setAvatarUri(nextAvatar)
      await reload()
    } catch (e) {
      setError(extractErrorMessage(e))
    } finally {
      setUploading(false)
    }
  }

  const startEditingName = () => {
    setNameDraft(user?.fullName ?? "")
    setError(null)
    setEditingName(true)
  }

  const saveName = async () => {
    const trimmed = nameDraft.trim()
    if (trimmed.length < 3) throw new Error("Name must be at least 3 characters.")

    await usersApi.updateMe({ fullName: trimmed })
    await reload()
    setEditingName(false)
  }

  return (
    <SafeArea edges={["top", "left", "right"]}>
      <ScrollView
        contentContainerClassName="gap-5 px-4 pb-10 pt-3"
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Text className="px-1 text-[1.9rem] font-bold tracking-tight text-foreground">
          My Profile
        </Text>

        <View className="items-center pb-2 pt-2">
          <Pressable
            onPress={() => (avatar ? setViewerOpen(true) : void pickAvatar())}
            accessibilityRole="button"
            accessibilityLabel={avatar ? "View profile photo" : "Add profile photo"}
            className="active:opacity-90"
          >
            <UserAvatar size={AVATAR_SIZE} avatar={avatar} name={displayName} />
            <View
              className="absolute -end-0.5 -bottom-0.5 h-8 w-8 items-center justify-center rounded-full border-[3px] border-background bg-primary"
              pointerEvents="none"
            >
              <Camera size={14} color={colors.primaryForeground} />
            </View>
          </Pressable>

          <Text variant="h4" numberOfLines={1} className="mt-3">
            {displayName}
          </Text>
          <View className="mt-1 flex-row items-center gap-1.5">
            <Text variant="muted">{handle}</Text>
            <Text variant="muted">·</Text>
            <View className="rounded-full bg-secondary px-2 py-0.5">
              <Text variant="small" className="text-xs font-semibold text-secondary-foreground">
                {roleLabel(user?.role)}
              </Text>
            </View>
          </View>

          {avatar ? (
            <Button
              size="sm"
              variant="ghost"
              className="mt-2"
              onPress={() => void pickAvatar()}
              loading={uploading}
            >
              {uploading ? "Uploading…" : "Edit photo"}
            </Button>
          ) : (
            <Button
              size="sm"
              variant="secondary"
              className="mt-3"
              onPress={() => void pickAvatar()}
              loading={uploading}
            >
              {uploading ? "Uploading…" : "Add photo"}
            </Button>
          )}
        </View>

        {error ? (
          <View className="flex-row items-center gap-2 rounded-xl bg-destructive/10 px-3 py-2">
            <Text variant="small" className="flex-1 font-normal text-destructive">
              {error}
            </Text>
            <Pressable
              onPress={() => setError(null)}
              hitSlop={8}
              accessibilityLabel="Dismiss error"
            >
              <X size={16} color={colors.destructive} />
            </Pressable>
          </View>
        ) : null}

        <SettingsGroup title="Account">
          {editingName ? (
            <View className="gap-3 p-4">
              <Label>Display name</Label>
              <Input
                value={nameDraft}
                onChangeText={setNameDraft}
                autoFocus
                maxLength={50}
                returnKeyType="done"
                leadingIcon={<UserRound size={16} color={colors.mutedForeground} />}
                onSubmitEditing={() =>
                  void saveName().catch((e) => setError(extractErrorMessage(e)))
                }
              />
              <View className="flex-row items-center justify-end gap-2">
                <Button variant="ghost" size="sm" onPress={() => setEditingName(false)}>
                  Cancel
                </Button>
                <SaveButton
                  label="Save"
                  savedLabel="Saved"
                  onSave={saveName}
                  contract
                  resetAfter={1000}
                  disabled={
                    nameDraft.trim() === (user?.fullName ?? "") || nameDraft.trim().length < 3
                  }
                  className="min-w-28"
                />
              </View>
            </View>
          ) : (
            <SettingsRow
              title="Name"
              description={user?.fullName ?? "Add your name"}
              onPress={startEditingName}
              leading={
                <SettingsIcon>
                  <UserRound size={16} color={colors.primary} />
                </SettingsIcon>
              }
            />
          )}
          <SettingsRow
            title="Username"
            description={handle}
            value="Locked"
            leading={
              <SettingsIcon>
                <AtSign size={16} color={colors.primary} />
              </SettingsIcon>
            }
          />
          {user?.phone ? (
            <SettingsRow
              title="Phone"
              description={user.phone}
              value="Private"
              leading={
                <SettingsIcon>
                  <Phone size={16} color={colors.primary} />
                </SettingsIcon>
              }
            />
          ) : null}
        </SettingsGroup>

        {publicLink ? (
          <SettingsGroup
            title="Public profile"
            footer="Your link lets people start a conversation with you without seeing your phone number."
          >
            <SettingsRow
              title="Copy link"
              description={linkCopied ? "Copied to clipboard" : publicLink}
              onPress={() => void copyLink()}
              leading={
                <SettingsIcon>
                  <Link2 size={16} color={colors.primary} />
                </SettingsIcon>
              }
              trailing={
                <Text
                  variant="small"
                  className={linkCopied ? "text-primary" : "text-muted-foreground"}
                >
                  {linkCopied ? "Copied" : "Copy"}
                </Text>
              }
            />
            <SettingsRow
              title="Share link"
              description="Send your profile to someone"
              onPress={() => void shareLink()}
              leading={
                <SettingsIcon>
                  <Share2 size={16} color={colors.primary} />
                </SettingsIcon>
              }
            />
          </SettingsGroup>
        ) : null}

        <SettingsGroup title="Privacy">
          <SettingsRow
            title="End-to-end encrypted"
            description="Messages stay between you and the team"
            leading={
              <SettingsIcon tone="neutral">
                <ShieldCheck size={16} color={colors.foreground} />
              </SettingsIcon>
            }
            value="On"
          />
          <SettingsRow
            title="Session"
            description="Signed in on this device"
            leading={
              <SettingsIcon tone="neutral">
                <KeyRound size={16} color={colors.foreground} />
              </SettingsIcon>
            }
          />
        </SettingsGroup>

        <SettingsGroup>
          <SettingsRow
            title="Sign out"
            destructive
            onPress={() => setSignOutOpen(true)}
            leading={
              <SettingsIcon tone="destructive">
                <LogOut size={16} color={colors.destructive} />
              </SettingsIcon>
            }
          />
        </SettingsGroup>

        <Text variant="small" className="text-center font-normal text-muted-foreground">
          Chatslock — your phone number is never shown to other members.
        </Text>
      </ScrollView>

      <AlertDialog open={signOutOpen} onOpenChange={setSignOutOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Sign out?</AlertDialogTitle>
            <AlertDialogDescription>
              You will need your phone number to sign in again on this device.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onPress={() => setSignOutOpen(false)}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive"
              onPress={() => {
                setSignOutOpen(false)
                void signOut()
              }}
            >
              Sign out
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AvatarViewer
        visible={viewerOpen}
        uri={avatar}
        name={displayName}
        onClose={() => setViewerOpen(false)}
      />
    </SafeArea>
  )
}
