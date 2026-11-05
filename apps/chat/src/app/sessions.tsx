import { useCallback, useEffect, useState } from "react"
import { Pressable, ScrollView, View } from "react-native"
import { useRouter } from "expo-router"
import { format, formatDistanceToNow } from "date-fns"
import { AlertCircle, ChevronLeft, LogOut, Monitor, Smartphone } from "lucide-react-native"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  EmptyState,
  SafeArea,
  SettingsGroup,
  SettingsIcon,
  SettingsRow,
  Spinner,
  Text,
  useThemeColors,
} from "@repo/ui"
import { extractErrorMessage, secureStorage } from "@repo/utils"
import { usersApi, type UserSessionSummary } from "@/api/users.api"

const PLATFORM_LABEL: Record<NonNullable<UserSessionSummary["platform"]>, string> = {
  ios: "iOS",
  android: "Android",
  web: "Web",
}

export default function SessionsScreen() {
  const colors = useThemeColors()
  const router = useRouter()

  const [sessions, setSessions] = useState<UserSessionSummary[]>([])
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [revokingId, setRevokingId] = useState<string | null>(null)
  const [sessionToRevoke, setSessionToRevoke] = useState<UserSessionSummary | null>(null)

  const load = useCallback(async () => {
    try {
      const [nextSessions, storedSessionId] = await Promise.all([
        usersApi.getSessions(),
        secureStorage.getSessionId(),
      ])
      setSessions(nextSessions)
      setCurrentSessionId(storedSessionId)
      setError(null)
    } catch (e) {
      setError(extractErrorMessage(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    void (async () => {
      try {
        const [nextSessions, storedSessionId] = await Promise.all([
          usersApi.getSessions(),
          secureStorage.getSessionId(),
        ])
        if (cancelled) return

        setSessions(nextSessions)
        setCurrentSessionId(storedSessionId)
        setError(null)
      } catch (e) {
        if (!cancelled) setError(extractErrorMessage(e))
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [])

  const revoke = async (session: UserSessionSummary) => {
    setRevokingId(session.id)

    try {
      await usersApi.revokeSession(session.id)
      setSessions((current) => current.filter((item) => item.id !== session.id))
    } catch (e) {
      setError(extractErrorMessage(e))
    } finally {
      setRevokingId(null)
      setSessionToRevoke(null)
    }
  }

  // The signed-in device stays at the top; the group's hairline is the divider
  // before the other devices.
  const currentSession = sessions.find((session) => session.id === currentSessionId) ?? null
  const otherSessions = sessions.filter((session) => session.id !== currentSessionId)
  const orderedSessions = currentSession ? [currentSession, ...otherSessions] : otherSessions

  return (
    <SafeArea edges={["top", "left", "right"]}>
      <View className="flex-row items-center gap-1 px-2 pb-2 pt-1">
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          className="h-10 w-10 items-center justify-center rounded-full active:bg-secondary"
        >
          <ChevronLeft size={22} color={colors.foreground} />
        </Pressable>

        <Text className="text-xl font-semibold tracking-tight text-foreground">
          Active sessions
        </Text>
      </View>

      <ScrollView
        contentContainerClassName="gap-5 px-4 pb-10 pt-2"
        showsVerticalScrollIndicator={false}
      >
        <Text variant="small" className="px-1 font-normal leading-5 text-muted-foreground">
          These are the devices currently signed in to your account.
        </Text>

        {loading ? (
          <View className="items-center py-16">
            <Spinner size="sm" />
          </View>
        ) : error ? (
          <EmptyState
            icon={<AlertCircle size={36} color={colors.mutedForeground} />}
            title="Could not load sessions"
            description={error}
            action={{
              label: "Try again",
              onPress: () => {
                setError(null)
                setLoading(true)
                void load()
              },
            }}
          />
        ) : sessions.length === 0 ? (
          <EmptyState
            icon={<Smartphone size={36} color={colors.mutedForeground} />}
            title="No active sessions"
            description="Sign in again to start a new session."
            action={{ label: "Try again", onPress: () => void load() }}
          />
        ) : (
          <SettingsGroup footer="You can be signed in on up to 4 devices.">
            {orderedSessions.map((session) => {
              const isCurrent = session.id === currentSessionId
              const isRevoking = revokingId === session.id
              const Icon = session.platform === "web" ? Monitor : Smartphone
              const platform = session.platform ? PLATFORM_LABEL[session.platform] : "Unknown"

              return (
                <SettingsRow
                  key={session.id}
                  title={session.deviceName}
                  onPress={isCurrent ? undefined : () => setSessionToRevoke(session)}
                  accessibilityLabel={isCurrent ? undefined : `Log out ${session.deviceName}`}
                >
                  <View className="flex-1 flex-row items-center gap-3">
                    <SettingsIcon tone="neutral">
                      <Icon size={17} color={colors.foreground} />
                    </SettingsIcon>

                    <View className="flex-1">
                      <View className="flex-row items-center gap-2">
                        <Text
                          numberOfLines={1}
                          className="flex-1 text-base font-medium text-foreground"
                        >
                          {session.deviceName}
                        </Text>
                        {isCurrent ? (
                          <Text variant="small" className="shrink-0 text-primary">
                            This device
                          </Text>
                        ) : null}
                      </View>

                      <Text
                        variant="small"
                        numberOfLines={1}
                        className="mt-0.5 font-normal text-muted-foreground"
                      >
                        Last active {formatDistanceToNow(session.lastUsedAt, { addSuffix: true })}
                      </Text>
                      <Text
                        variant="small"
                        numberOfLines={1}
                        className="font-normal text-muted-foreground"
                      >
                        {platform} · Signed in {format(session.createdAt, "d MMM yyyy")}
                      </Text>
                    </View>

                    {isCurrent ? null : isRevoking ? (
                      <Spinner size="sm" />
                    ) : (
                      <LogOut size={18} color={colors.destructive} />
                    )}
                  </View>
                </SettingsRow>
              )
            })}
          </SettingsGroup>
        )}
      </ScrollView>

      <AlertDialog
        open={sessionToRevoke !== null}
        onOpenChange={(open) => {
          if (!open) setSessionToRevoke(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Log out this session?</AlertDialogTitle>
            <AlertDialogDescription>
              {sessionToRevoke?.deviceName ?? "This device"} will need to sign in again.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onPress={() => setSessionToRevoke(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive"
              onPress={() => {
                if (sessionToRevoke) void revoke(sessionToRevoke)
              }}
            >
              Log out
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SafeArea>
  )
}
