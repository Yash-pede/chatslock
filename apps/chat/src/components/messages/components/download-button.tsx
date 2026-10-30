import { Check, Download } from "lucide-react-native"
import { Pressable } from "react-native"
import Svg, { Circle } from "react-native-svg"
import { Spinner, useToast, useThemeColors } from "@repo/ui"
import { useDocumentDownload } from "../hooks/use-document-download"

const SIZE = 40
const STROKE = 3

/** Circular progress drawn around the button while downloading. */
function ProgressRing({
  progress,
  color,
  track,
}: {
  progress: number
  color: string
  track: string
}) {
  const radius = (SIZE - STROKE) / 2
  const circumference = 2 * Math.PI * radius
  return (
    <Svg width={SIZE} height={SIZE} style={{ position: "absolute" }}>
      <Circle
        cx={SIZE / 2}
        cy={SIZE / 2}
        r={radius}
        stroke={track}
        strokeWidth={STROKE}
        fill="none"
      />
      <Circle
        cx={SIZE / 2}
        cy={SIZE / 2}
        r={radius}
        stroke={color}
        strokeWidth={STROKE}
        fill="none"
        strokeDasharray={circumference}
        strokeDashoffset={circumference * (1 - Math.max(0, Math.min(1, progress)))}
        strokeLinecap="round"
        transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
      />
    </Svg>
  )
}

export interface DownloadButtonProps {
  url: string
  fileName: string
  mimeType: string
  /** Colour used for the icon and progress arc. */
  tint: string
}

/**
 * Downloads an attachment to a user-visible location. Shows a circular progress
 * ring (with a spinner in place of the icon) while downloading and a check once
 * saved.
 */
export function DownloadButton({ url, fileName, mimeType, tint }: DownloadButtonProps) {
  const colors = useThemeColors()
  const { toast } = useToast()
  const { state, progress, download } = useDocumentDownload()
  const downloading = state === "downloading"

  const handlePress = () => {
    if (downloading) return
    void download({ url, fileName, mimeType }).then((outcome) => {
      if (outcome === "saved") {
        toast({ title: "Downloaded", description: `${fileName} saved` })
      } else if (outcome === "error") {
        console.error("File not saved")
      }
      // "cancelled" (user dismissed the folder picker) stays silent.
    })
  }

  return (
    <Pressable
      onPress={handlePress}
      disabled={downloading}
      accessibilityRole="button"
      accessibilityLabel={downloading ? "Downloading" : "Download file"}
      className="h-10 w-10 shrink-0 items-center justify-center rounded-full"
      style={{ backgroundColor: `${tint}22` }}
    >
      {downloading ? (
        <ProgressRing progress={progress ?? 0} color={tint} track={colors.border} />
      ) : null}
      {state === "done" ? (
        <Check size={18} color={tint} />
      ) : downloading ? (
        <Spinner size="sm" color={tint} />
      ) : (
        <Download size={18} color={tint} />
      )}
    </Pressable>
  )
}
