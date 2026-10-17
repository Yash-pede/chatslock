/**
 * The icon primitive.
 *
 * Every glyph comes from `lucide-react-native`, imported per icon so the bundle
 * only carries what this package actually draws. Lucide renders through
 * `react-native-svg`, which works on iOS, Android and web alike.
 *
 * Screens name an icon through `IconName` rather than importing a component, so
 * colour, size and stroke weight stay consistent across the app. The set is
 * deliberately small: it grows only when a screen needs a glyph.
 */
import AtSign from "lucide-react-native/icons/at-sign";
import BadgeCheck from "lucide-react-native/icons/badge-check";
import Bell from "lucide-react-native/icons/bell";
import BellOff from "lucide-react-native/icons/bell-off";
import Camera from "lucide-react-native/icons/camera";
import CheckCheck from "lucide-react-native/icons/check-check";
import ChevronRight from "lucide-react-native/icons/chevron-right";
import CircleQuestionMark from "lucide-react-native/icons/circle-question-mark";
import Clock from "lucide-react-native/icons/clock";
import Database from "lucide-react-native/icons/database";
import KeyRound from "lucide-react-native/icons/key-round";
import Lock from "lucide-react-native/icons/lock";
import LogOut from "lucide-react-native/icons/log-out";
import MessageCircle from "lucide-react-native/icons/message-circle";
import Moon from "lucide-react-native/icons/moon";
import Pencil from "lucide-react-native/icons/pencil";
import Phone from "lucide-react-native/icons/phone";
import Plus from "lucide-react-native/icons/plus";
import QrCode from "lucide-react-native/icons/qr-code";
import Search from "lucide-react-native/icons/search";
import SettingsIcon from "lucide-react-native/icons/settings";
import Shield from "lucide-react-native/icons/shield";
import SquarePen from "lucide-react-native/icons/square-pen";
import UserRound from "lucide-react-native/icons/user-round";
import type { LucideIcon } from "lucide-react-native";

import { sizing, useTheme } from "../theme";

const icons = {
  /** A handset — the phone-number sign-in method. */
  phone: Phone,
  /** A key on a ring — the username-and-password method. */
  keys: KeyRound,
  /** A shield — what the account is protected with. */
  shield: Shield,
  /** A camera — the affordance for choosing a profile picture. */
  camera: Camera,
  /** A speech bubble — the chats tab. */
  chats: MessageCircle,
  /** A gear — the settings tab. */
  settings: SettingsIcon,
  /** A person — the profile tab. */
  profile: UserRound,
  /** A magnifier — search. */
  search: Search,
  /** A plus — the new-chat action. */
  plus: Plus,
  /** A badge with a tick — a verified account. */
  verified: BadgeCheck,
  /** A chevron — "this row opens something". */
  chevronRight: ChevronRight,
  /** A bell — notification settings. */
  bell: Bell,
  /** A crossed-out bell — a muted conversation. */
  bellOff: BellOff,
  /** A padlock — privacy settings. */
  lock: Lock,
  /** A stack of disks — storage settings. */
  database: Database,
  /** A question mark — help. */
  help: CircleQuestionMark,
  /** An arrow leaving a door — sign out. */
  logout: LogOut,
  /** A moon — appearance settings. */
  moon: Moon,
  /** A pencil — edit. */
  edit: Pencil,
  /** A QR code — sharing a profile. */
  qr: QrCode,
  /** A double tick — a message the recipient has read. */
  read: CheckCheck,
  /** A pen on a square — starting a new message. */
  newChat: SquarePen,
  /** An at sign — a username. */
  at: AtSign,
  /** A clock — a date or time detail. */
  clock: Clock,
} as const satisfies Record<string, LucideIcon>;

/**
 * Names this package draws.
 *
 * `privacy` is a synonym for `shield` rather than a second glyph: screens talk
 * about what a thing is *for*, and the drawing is a shield either way.
 */
export type IconName = keyof typeof icons | "privacy";

/**
 * Whether a string names a glyph this package draws.
 *
 * Needed because `ReactNode` already includes `string`, so a component taking
 * `IconName | ReactNode` cannot narrow on `typeof x === "string"` alone.
 */
export function isIconName(value: unknown): value is IconName {
  return (
    typeof value === "string" &&
    (value === "privacy" || Object.hasOwn(icons, value))
  );
}

export interface IconProps {
  name: IconName;
  /** Rendered size in points. Reads `sizing.icon` by default. */
  size?: number;
  /** Defaults to the theme's foreground. */
  color?: string;
  /** Lucide's stroke weight, in grid units. */
  strokeWidth?: number;
  /**
   * Set when the icon carries meaning a screen reader has to announce.
   *
   * Left unset, the icon is hidden from the accessibility tree: an icon that
   * only repeats the label next to it is noise to anyone listening.
   */
  accessibilityLabel?: string;
  testID?: string;
}

export function Icon({
  name,
  size = sizing.icon,
  color,
  strokeWidth = 2,
  accessibilityLabel,
  testID,
}: IconProps) {
  const { colors } = useTheme();
  // `name` is typed, so this is unreachable from TypeScript — but an icon is
  // decorative by nature and a missing glyph must not take a screen down.
  const Glyph: LucideIcon | undefined =
    name === "privacy" ? icons.shield : icons[name];

  if (!Glyph) return null;

  return (
    <Glyph
      testID={testID}
      size={size}
      color={color ?? colors.foreground}
      strokeWidth={strokeWidth}
      // `undefined` rather than `false` on purpose: react-native-svg forwards
      // this straight to the DOM on web, where React rejects a non-boolean.
      accessibilityRole={accessibilityLabel ? "image" : undefined}
      accessibilityLabel={accessibilityLabel}
      accessible={accessibilityLabel !== undefined ? true : undefined}
    />
  );
}
