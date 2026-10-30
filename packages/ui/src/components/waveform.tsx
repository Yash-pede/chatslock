import React from "react"
import { View } from "react-native"
import { cn } from "../lib/utils"

export type WaveformMode = "livemic" | "ambient"

export interface WaveformProps extends React.ComponentPropsWithoutRef<typeof View> {
  className?: string
  /**
   * `livemic` colours every bar (live recording), `ambient` dims the bars after
   * `progress` (playback).
   */
  mode?: WaveformMode
  /** Bar amplitudes, each `0..1`. */
  levels: number[]
  /** Played fraction `0..1`; only used by `ambient`. */
  progress?: number
  /** Colour of the active bars. */
  color?: string
  /** Overrides the colour of the not-yet-played bars in `ambient` mode. */
  dimColor?: string
  height?: number
  barWidth?: number
  gap?: number
}

/**
 * AniUI waveform. `livemic` is used while recording (all bars lit), `ambient`
 * for playback (bars past `progress` are dimmed).
 */
export function Waveform({
  className,
  mode = "ambient",
  levels,
  progress = 0,
  color,
  dimColor,
  height = 24,
  barWidth = 3,
  gap = 2,
  ...props
}: WaveformProps) {
  const active = color ?? "#3b82f6"
  const idle = dimColor ?? `${active}59`
  const playedBars = Math.round(Math.max(0, Math.min(1, progress)) * levels.length)

  return (
    <View
      className={cn("flex-row items-center", className)}
      style={{ height, gap }}
      {...props}
    >
      {levels.map((level, index) => (
        <View
          key={index}
          style={{
            width: barWidth,
            height: Math.max(barWidth, Math.round(level * height)),
            borderRadius: barWidth,
            backgroundColor: mode === "ambient" && index >= playedBars ? idle : active,
          }}
        />
      ))}
    </View>
  )
}
