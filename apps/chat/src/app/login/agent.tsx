import { useMemo, useState } from "react"
import { router } from "expo-router"
import { Pressable, View } from "react-native"
import {
  Alert,
  AlertDescription,
  Input,
  Label,
  PasswordInput,
  SaveButton,
  Text,
  useThemeColors,
} from "@repo/ui"
import { AlertCircle } from "lucide-react-native"
import { extractErrorMessage } from "@repo/utils"
import { useAuth } from "@/context/AuthContext"
import { AuthScreen } from "@/components/auth-screen"

/** Mirrors the backend schema so the button stays disabled on obviously bad input. */
function isUsernameValid(username: string): boolean {
  const value = username.trim()
  return value.length >= 3 && value.length <= 20 && /^[a-zA-Z0-9._-]+$/.test(value)
}

/**
 * Agent sign-in with username + password. The backend rejects non-agent
 * accounts here, so a non-agent should use the phone flow instead.
 */
export default function AgentLoginScreen() {
  const { signInAsAgent } = useAuth()
  const colors = useThemeColors()

  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const usernameValid = useMemo(() => isUsernameValid(username), [username])
  const passwordValid = password.length >= 8
  // Never submit empty/invalid fields, and never twice while a sign-in is in flight.
  const canSubmit = usernameValid && passwordValid && !submitting

  const submit = async () => {
    if (!canSubmit) {
      throw new Error("Enter a valid username and password.")
    }

    setSubmitting(true)
    setError(null)

    try {
      await signInAsAgent({ username: username.trim(), password })
      // The provider flips the route once the profile has loaded.
    } catch (e) {
      setError(extractErrorMessage(e))
      // Rethrowing lets SaveButton drop back to idle instead of showing success.
      throw e
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AuthScreen
      back="/login"
      title="Agent sign-in"
      subtitle="Use your agent account credentials."
      footer={
        <View className="items-center gap-1 pb-2">
          <Text variant="muted">Signing in as a user instead?</Text>
          <Pressable
            onPress={() => router.replace("/login/user")}
            accessibilityRole="button"
            hitSlop={8}
          >
            <Text variant="small" className="text-primary">
              Phone sign-in
            </Text>
          </Pressable>
        </View>
      }
    >
      <View className="gap-2">
        <Label>Username</Label>
        <Input
          value={username}
          onChangeText={(next) => {
            setUsername(next)
            setError(null)
          }}
          placeholder="agent username"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="username"
          textContentType="username"
          returnKeyType="next"
          accessibilityLabel="Username"
        />
        {username.length > 0 && !usernameValid ? (
          <Text variant="small" className="text-destructive">
            Username must be 3–20 characters (letters, numbers, . _ -).
          </Text>
        ) : null}
      </View>

      <View className="gap-2">
        <Label>Password</Label>
        <PasswordInput
          value={password}
          onChangeText={(next) => {
            setPassword(next)
            setError(null)
          }}
          placeholder="Enter your password"
          autoCapitalize="none"
          autoComplete="password"
          textContentType="password"
          returnKeyType="go"
          onSubmitEditing={() => void submit()}
          accessibilityLabel="Password"
        />
        {password.length > 0 && !passwordValid ? (
          <Text variant="small" className="text-destructive">
            Password must be at least 8 characters.
          </Text>
        ) : null}
      </View>

      {error ? (
        <Alert variant="destructive" className="flex-row items-center gap-2 rounded-xl py-3">
          <AlertCircle size={16} color={colors.destructive} />
          <AlertDescription className="flex-1">{error}</AlertDescription>
        </Alert>
      ) : null}

      <View className="items-center">
        <SaveButton
          label="Sign in"
          savedLabel="Signed in"
          onSave={submit}
          minLoading={600}
          disabled={!canSubmit}
          contract
          className="min-w-40"
        />
      </View>
    </AuthScreen>
  )
}
