/**
 * Design tokens: fixed sizes.
 *
 * chatslock is a single-pane mobile app, so these describe one column measured
 * off a 360dp-wide reference screen. Anything that has to react to the window
 * — insets, keyboard height — is derived per screen instead of living here.
 */
export const sizing = {
  /** Conversation-row avatar. */
  avatar: 54,
  /** Smaller avatar for the chat header. */
  avatarSmall: 40,
  /** Story avatar in the horizontal row. */
  storyAvatar: 56,
  /** Unread-count pill. */
  badge: 22,
  /** Floating action button. */
  fab: 56,

  /**
   * Fixed conversation-row height.
   *
   * Pinned rather than derived so the list can use `getItemLayout` and skip
   * measuring every row — the single biggest list-scrolling win here.
   */
  rowHeight: 76,

  /** Large screen-title block. */
  titleBlockHeight: 56,
  /** Filter tab bar. */
  filterBarHeight: 44,
  /** Search pill. */
  searchHeight: 42,
  /** Conversation header, below the status-bar inset. */
  headerHeight: 56,
  /** Bottom tab bar, below the home-indicator inset. */
  tabBarHeight: 56,
  /** Composer resting height, above the keyboard/home inset. */
  composerHeight: 52,
  /** Form input height. Taller than a toolbar control so the tap target clears
   *  the platform floor without the field looking like a button. */
  fieldHeight: 52,
  /** Widest the message column grows in landscape. */
  contentMaxWidth: 640,
  /** Widest bubbles grow as a share of the column. */
  bubbleMaxRatio: 0.82,

  /** Hit target floor for tappable controls. */
  hitSlop: 44,

  /**
   * Icon sizes, in three steps only.
   *
   * An icon that sits beside a `headline` label, one inside a `caption` line of
   * supporting copy, and one as the whole point of a screen. A fourth step
   * always looks like one of these three that was mistyped.
   */
  iconSmall: 16,
  icon: 20,
  iconLarge: 32,
} as const;
