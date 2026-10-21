import { Pressable, View } from "react-native";
import { CircleUserRound, LogOut, ShieldCheck } from "lucide-react-native";
import {
  Button,
  SafeArea,
  SectionHeader,
  Spinner,
  Text,
  useThemeColors,
} from "@repo/ui";
import { useAuth, useUser } from "@/auth/AuthContext";

/** Landing screen once the session and profile are confirmed. */
export default function HomeScreen() {
  const { user, isLoading, error, reload } = useUser();
  const { signOut } = useAuth();
  const colors = useThemeColors();

  const displayName = user?.fullName || user?.username || "there";
  const initials = getInitials(displayName);

  return (
    <SafeArea>
      <View className="flex-1 gap-6 px-5 pt-4">
        <View className="flex-row items-center gap-3">
          <View className="h-12 w-12 items-center justify-center rounded-full bg-accent">
            <Text variant="large" className="text-accent-foreground">
              {initials}
            </Text>
          </View>
          <View className="flex-1">
            <Text variant="muted">Signed in as</Text>
            <Text variant="h4">{displayName}</Text>
          </View>
          <Pressable
            onPress={() => void signOut()}
            accessibilityRole="button"
            accessibilityLabel="Sign out"
            className="h-10 w-10 items-center justify-center rounded-full active:bg-secondary"
          >
            <LogOut size={18} color={colors.mutedForeground} />
          </Pressable>
        </View>

        {isLoading ? (
          <View className="items-center justify-center rounded-2xl border border-border bg-card py-10">
            <Spinner />
          </View>
        ) : error ? (
          <View className="gap-3 rounded-2xl border border-destructive/40 bg-destructive/10 p-4">
            <Text variant="small" className="text-destructive">
              {error}
            </Text>
            <Button variant="outline" size="sm" onPress={() => void reload()}>
              Try again
            </Button>
          </View>
        ) : (
          <>
            <View className="rounded-2xl border border-border bg-card p-5">
              <SectionHeader title="Account" />
              <View className="mt-3 gap-3">
                <InfoRow icon={<CircleUserRound size={16} color={colors.mutedForeground} />} label="Username" value={user?.username ?? "—"} />
                <InfoRow icon={<ShieldCheck size={16} color={colors.mutedForeground} />} label="Phone" value={user?.phone ?? "Not provided"} />
              </View>
            </View>

            <View className="items-center rounded-2xl border border-dashed border-border p-6">
              <Text variant="h4" className="text-center">
                You're all set
              </Text>
              <Text variant="muted" className="mt-1 text-center">
                Your conversations will show up here.
              </Text>
            </View>
          </>
        )}
      </View>
    </SafeArea>
  );
}

function InfoRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <View className="flex-row items-center gap-3">
      {icon}
      <Text variant="muted" className="flex-1">
        {label}
      </Text>
      <Text variant="small">{value}</Text>
    </View>
  );
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((part) => part.charAt(0).toUpperCase()).join("") || "?";
}
