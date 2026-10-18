import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Animated, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  Icon,
  Text,
  radius,
  shadowStyle,
  sizing,
  spacing,
  useTheme,
} from "@repo/ui";

export interface ToastOptions {
  title: string;
  message?: string;
}

type ToastContextValue = {
  showToast: (options: ToastOptions) => void;
};

const ToastContext = createContext<ToastContextValue>({
  showToast: () => {},
});

/** How long the toast stays fully visible before it starts fading out. */
const VISIBLE_MS = 2200;


/**
 * A short confirmation bubble that floats over the app and fades away.
 *
 * Drawn in JS rather than through a native toast module so it looks the same in
 * Expo Go, dev builds and on web, and follows the theme like every other
 * surface. One toast at a time: a new call replaces whatever is showing.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const { colors, shadows } = useTheme();
  const insets = useSafeAreaInsets();
  const [toast, setToast] = useState<ToastOptions | null>(null);
  // Lazily created so the animation object is built once, outside render.
  const [progress] = useState(() => new Animated.Value(0));
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback(
    (options: ToastOptions) => {
      if (timer.current) clearTimeout(timer.current);
      setToast(options);
      Animated.timing(progress, {
        toValue: 1,
        duration: 180,
        useNativeDriver: true,
      }).start();
      timer.current = setTimeout(() => {
        Animated.timing(progress, {
          toValue: 0,
          duration: 220,
          useNativeDriver: true,
        }).start(({ finished }) => {
          if (finished) setToast(null);
        });
      }, VISIBLE_MS);
    },
    [progress],
  );

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const value = useMemo(() => ({ showToast }), [showToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}

      {toast ? (
        <View
          pointerEvents="none"
          style={[
            // Above the tab bar, which floats over the screen content.
            styles.host,
            { bottom: insets.bottom + sizing.tabBarHeight + spacing.lg },
          ]}
        >
          <Animated.View
            accessibilityRole="alert"
            accessibilityLiveRegion="polite"
            style={[
              styles.toast,
              {
                backgroundColor: colors.popover,
                borderColor: colors.border,
                borderWidth: StyleSheet.hairlineWidth,
                opacity: progress,
                transform: [
                  {
                    translateY: progress.interpolate({
                      inputRange: [0, 1],
                      outputRange: [8, 0],
                    }),
                  },
                ],
              },
              shadowStyle(shadows.lg),
            ]}
          >
            <View style={[styles.badge, { backgroundColor: colors.primary }]}>
              <Icon
                name="read"
                size={sizing.iconSmall}
                color={colors.primaryForeground}
              />
            </View>
            <View style={styles.text}>
              <Text variant="body" numberOfLines={1}>
                {toast.title}
              </Text>
              {toast.message ? (
                <Text variant="caption" tone="secondary" numberOfLines={2}>
                  {toast.message}
                </Text>
              ) : null}
            </View>
          </Animated.View>
        </View>
      ) : null}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  return useContext(ToastContext);
}

const styles = StyleSheet.create({
  host: {
    position: "absolute",
    left: spacing.lg,
    right: spacing.lg,
    alignItems: "center",
  },
  toast: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    maxWidth: 480,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.lg,
  },
  badge: {
    width: sizing.icon,
    height: sizing.icon,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  text: {
    flexShrink: 1,
    gap: spacing.xxs,
  },
});
