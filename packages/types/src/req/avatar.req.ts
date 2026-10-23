import z from "zod"
import { baseSchema } from "./base"

const str = (min = 1, max = 255) => z.string().min(min).max(max)

/**
 * Image MIME types accepted for profile avatars. Deliberately an allowlist: a
 * `startsWith("image/")` check would also accept SVG (scriptable when rendered
 * in a browser), TIFF, Photoshop files and anything else a client claims.
 */
export const AVATAR_CONTENT_TYPES = ["image/jpeg", "image/png", "image/webp"] as const

export type AvatarContentType = (typeof AVATAR_CONTENT_TYPES)[number]

/** Extensions we are willing to keep in the object key. */
const AVATAR_FILE_EXTENSIONS = ["jpg", "jpeg", "png", "webp"] as const
type AvatarFileExtension = (typeof AVATAR_FILE_EXTENSIONS)[number]

/** `avatar.jpeg` -> `jpeg`. Rejects names with no extension or path characters. */
export function avatarFileExtension(fileName: string): AvatarFileExtension | undefined {
  const match = /^[A-Za-z0-9_-]{1,64}\.([A-Za-z0-9]{1,5})$/.exec(fileName)
  const extension = match?.[1]?.toLowerCase()

  return AVATAR_FILE_EXTENSIONS.includes(extension as AvatarFileExtension)
    ? (extension as AvatarFileExtension)
    : undefined
}

export const avatarImagePresignUrlSchema = baseSchema.extend({
  body: z.strictObject({
    contentType: z.enum(AVATAR_CONTENT_TYPES, "Only JPEG, PNG or WebP images are allowed"),
    fileName: str(1, 100).refine(
      (name) => avatarFileExtension(name) !== undefined,
      "Only JPEG, PNG or WebP files are allowed",
    ),
  }),
})

export type AvatarImagePresignUrlRequest = z.infer<typeof avatarImagePresignUrlSchema>
