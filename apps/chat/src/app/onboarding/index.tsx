import { useState } from "react"
import { View } from "react-native"
import { Sparkles } from "lucide-react-native"
import {
  Alert,
  AlertDescription,
  Button,
  Input,
  Label,
  SafeArea,
  Text,
  useThemeColors,
} from "@repo/ui"
import { extractErrorMessage } from "@repo/utils"
import { useAuth } from "@/context/AuthContext"

const USERNAME_PATTERN = /^[a-z0-9_]{3,20}$/

/**
 * First-login profile step: the Cognito account exists but has no profile row
 * yet. Submitting calls `POST /api/users/onboarding`, which links the user to
 * the agent from a shared profile link (`pendingAgentId`) when there is one.
 */
export default function OnboardingScreen() {
  const { completeOnboarding, pendingAgentId, signOut } = useAuth()
  const colors = useThemeColors()

  const [fullName, setFullName] = useState("")
  const [username, setUsername] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  // Field errors stay hidden until the user has typed in that field, so an
  // untouched form never looks like it is already wrong.
  const [touched, setTouched] = useState({ fullName: false, username: false })

  const trimmedName = fullName.trim()
  const normalizedUsername = username.trim().toLowerCase()
  const nameValid = trimmedName.length >= 3 && trimmedName.length <= 50
  const usernameValid = USERNAME_PATTERN.test(normalizedUsername)
  const isValid = nameValid && usernameValid
  // A submit is only possible with valid input and no request in flight.
  const canSubmit = isValid && !saving

  const submit = async () => {
    if (!canSubmit) {
      // Ask SaveButton to stay idle and surface the reason instead of submitting.
      setTouched({ fullName: true, username: true })
      setError("Please fill in your name and a valid username.")
      throw new Error("Invalid onboarding input")
    }

    setSaving(true)
    setError(null)

    try {
      await completeOnboarding({
        fullName: trimmedName,
        username: normalizedUsername,
      })
      // The provider flips the route once the profile has loaded.
    } catch (e) {
      setError(extractErrorMessage(e))
      throw e
    } finally {
      setSaving(false)
    }
  }

  return (
    <SafeArea>
      <View className="flex-1 justify-center px-6">
        <View className="mb-8 items-center">
          <View className="mb-5 h-14 w-14 items-center justify-center rounded-2xl bg-accent">
            <Sparkles size={26} color={colors.accentForeground} />
          </View>
          <Text variant="h2" className="text-center">
            Finish setting up
          </Text>
          <Text variant="muted" className="mt-2 text-center">
            Your number is verified. We just need a couple of details to complete your profile.
          </Text>
        </View>

        <View className="rounded-2xl border border-border bg-card p-5">
          <View className="gap-4">
            <View className="gap-2">
              <Label>Full name</Label>
              <Input
                value={fullName}
                onChangeText={(next) => {
                  setFullName(next)
                  setTouched((current) => ({ ...current, fullName: true }))
                  setError(null)
                }}
                onBlur={() => setTouched((current) => ({ ...current, fullName: true }))}
                placeholder="Your name"
                autoComplete="name"
                returnKeyType="next"
                maxLength={50}
                accessibilityLabel="Full name"
              />
              {touched.fullName && !nameValid ? (
                <Text variant="small" className="text-destructive">
                  Enter your full name (3-50 characters).
                </Text>
              ) : null}
            </View>

            <View className="gap-2">
              <Label>Username</Label>
              <Input
                value={username}
                onChangeText={(next) => {
                  setUsername(next)
                  setTouched((current) => ({ ...current, username: true }))
                  setError(null)
                }}
                onBlur={() => setTouched((current) => ({ ...current, username: true }))}
                placeholder="username"
                autoCapitalize="none"
                autoCorrect={false}
                maxLength={20}
                accessibilityLabel="Username"
              />
              <Text
                variant="small"
                className={
                  touched.username && !usernameValid ? "text-destructive" : "text-muted-foreground"
                }
              >
                3-20 characters: lowercase letters, numbers and underscores.
              </Text>
            </View>
          </View>
        </View>

        {error ? (
          <Alert variant="destructive" className="mt-4">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        <Button
          onPress={() => void submit().catch(() => {})}
          disabled={!canSubmit}
          loading={saving}
          className="mt-6"
        >
          Continue
        </Button>

        {pendingAgentId ? (
          <Text variant="small" className="mt-3 text-center text-muted-foreground">
            You will be connected with the person who shared their link.
          </Text>
        ) : null}

        <Button variant="ghost" onPress={() => void signOut()} className="mt-2">
          Sign out
        </Button>
      </View>
    </SafeArea>
  )
}
