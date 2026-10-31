import { useEffect, useState } from "react"
import { getThumbnailAsync, type VideoThumbnailsResult } from "expo-video-thumbnails"

type Thumbnail = VideoThumbnailsResult

/**
 * Video posters are generated once per URL with `expo-video-thumbnails` and
 * cached for the session, so re-rendering a bubble (or reopening the viewer)
 * never regenerates them.
 */
const cache = new Map<string, Thumbnail | null>()
const inflight = new Map<string, Promise<Thumbnail | null>>()

function load(url: string): Promise<Thumbnail | null> {
  if (cache.has(url)) return Promise.resolve(cache.get(url) ?? null)

  const pending = inflight.get(url)
  if (pending) return pending

  const promise = getThumbnailAsync(url, { time: 0, quality: 0.7 })
    .then((thumbnail) => thumbnail ?? null)
    .catch(() => null)

  inflight.set(url, promise)
  void promise.then((thumbnail) => {
    cache.set(url, thumbnail)
    inflight.delete(url)
  })
  return promise
}

interface ThumbnailState {
  thumbnail: Thumbnail | null
  /** True until generation settles (success or failure). */
  loading: boolean
}

const initialFor = (url: string): ThumbnailState =>
  cache.has(url)
    ? { thumbnail: cache.get(url) ?? null, loading: false }
    : { thumbnail: null, loading: Boolean(url) }

/**
 * A poster image for a video URL, for the bubble/viewer preview. `loading` is
 * true until the (cached) thumbnail is resolved, so callers can show a loader.
 */
export function useVideoThumbnail(url: string): ThumbnailState {
  const [state, setState] = useState<ThumbnailState>(() => initialFor(url))

  // Reflect a synchronous cache hit when `url` changes (derived during render).
  const [resolvedUrl, setResolvedUrl] = useState(url)
  if (resolvedUrl !== url) {
    setResolvedUrl(url)
    setState(initialFor(url))
  }

  useEffect(() => {
    if (!url || cache.has(url)) return

    let cancelled = false
    void load(url).then((thumbnail) => {
      if (!cancelled) setState({ thumbnail, loading: false })
    })
    return () => {
      cancelled = true
    }
  }, [url])

  return state
}
