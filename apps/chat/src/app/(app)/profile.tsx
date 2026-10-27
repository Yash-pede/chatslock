import { useState } from "react"
import { ScrollView } from "react-native"
import { AtSign, KeyRound, LogOut, Phone, ShieldCheck, UserRound } from "lucide-react-native"
import { SafeArea, SettingsGroup, SettingsIcon, SettingsRow, Text, useThemeColors } from "@repo/ui"
import { extractErrorMessage } from "@repo/utils"
import { userProfileUrl } from "@/lib/links"
import { usersApi } from "@/api/users.api"
import { useAuth } from "@/context/AuthContext"
import { useProfile } from "@/context/profile/ProfileContext"
import { AvatarViewer } from "@/components/profile/avatar-viewer"
import { NameEditor } from "@/components/profile/name-editor"
import { ProfileHeader } from "@/components/profile/profile-header"
import { PublicLinkGroup } from "@/components/profile/public-link-group"
import { useAvatarUpload } from "@/components/profile/use-avatar-upload"
import { ErrorBanner } from "@/components/error-banner"
import { SignOutDialog } from "@/components/sign-out-dialog"

export default function ProfileScreen() {
  const colors = useThemeColors()
  const { user, reload } = useProfile()
  const { signOut } = useAuth()

  const [avatarUri, setAvatarUri] = useState<string | null>(null)
  const [viewerOpen, setViewerOpen] = useState(false)
  const [editingName, setEditingName] = useState(false)
  const [nameDraft, setNameDraft] = useState("")
  const [nameError, setNameError] = useState<string | null>(null)
  const [signOutOpen, setSignOutOpen] = useState(false)

  const avatarUpload = useAvatarUpload(async (url) => {
    setAvatarUri(url)
    await reload()
  })

  const name = user?.fullName ?? user?.username ?? "Your profile"
  const avatar = avatarUri ?? user?.avatar ?? null
  const handle = user?.username ? `@${user.username}` : "Chatslock member"
  const publicLink = user?.role === "agent" && user?.userId ? userProfileUrl(user.userId) : null
  const trimmedDraft = nameDraft.trim()
  const canSaveName = trimmedDraft.length >= 3 && trimmedDraft !== (user?.fullName ?? "")

  const startEditingName = () => {
    setNameDraft(user?.fullName ?? "")
    setNameError(null)
    setEditingName(true)
  }

  const saveName = async () => {
    if (trimmedDraft.length < 3) {
      const message = "Name must be at least 3 characters."
      setNameError(message)
      throw new Error(message)
    }
    try {
      await usersApi.updateMe({ fullName: trimmedDraft })
      await reload()
      setEditingName(false)
    } catch (e) {
      setNameError(extractErrorMessage(e))
      throw e
    }
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

        <ProfileHeader
          avatar={avatar}
          name={name}
          handle={handle}
          roleLabel={user?.role === "agent" ? "Support agent" : "Member"}
          uploading={avatarUpload.uploading}
          onPressAvatar={() => {
            if (avatar) setViewerOpen(true)
            else void avatarUpload.pick()
          }}
        />

        {avatarUpload.error ? (
          <ErrorBanner message={avatarUpload.error} onDismiss={avatarUpload.clearError} />
        ) : null}

        <SettingsGroup title="Account">
          {editingName ? (
            <NameEditor
              draft={nameDraft}
              onChange={(next) => {
                setNameDraft(next)
                setNameError(null)
              }}
              onSave={saveName}
              onCancel={() => setEditingName(false)}
              canSave={canSaveName}
            />
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

        {nameError ? (
          <Text variant="small" className="text-destructive">
            {nameError}
          </Text>
        ) : null}

        {publicLink ? <PublicLinkGroup link={publicLink} name={name} /> : null}

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

      <SignOutDialog
        open={signOutOpen}
        onOpenChange={setSignOutOpen}
        onConfirm={() => void signOut()}
      />

      <AvatarViewer
        visible={viewerOpen}
        uri={avatar}
        name={name}
        onClose={() => setViewerOpen(false)}
      />
    </SafeArea>
  )
}
