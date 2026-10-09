/**
 * Shared props for every ReorderableList. The library's default autoscroll on Android is ~150dp/s,
 * far slower than a drag; 5x measured ~520dp/s (a brisk drag), and a larger edge zone starts it
 * before the finger runs out of screen.
 */
export const REORDER_AUTOSCROLL = {
  autoscrollSpeedScale: 5,
  autoscrollThreshold: 0.15,
} as const;
