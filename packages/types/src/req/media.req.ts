import z from "zod"
import { baseSchema } from "./base"
import { compositeConversationId } from "../schema"

const str = (min = 1, max = 255) => z.string().min(min).max(max)

export const MAX_MEDIA_FILE_SIZE = 100 * 1024 * 1024

export const MEDIA_CONTENT_TYPES = [
  "audio/mpeg",
  "audio/wav",
  "audio/ogg",
  "audio/aac",
  "audio/flac",
  "audio/mp4",
  "video/mp4",
  "video/webm",
  "video/quicktime",
  "video/x-matroska",
  "video/x-msvideo",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
  "application/zip",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
] as const

export type MediaContentType = (typeof MEDIA_CONTENT_TYPES)[number]

export const MEDIA_FILE_EXTENSIONS = [
  "mp3",
  "wav",
  "ogg",
  "aac",
  "flac",
  "m4a",
  "mp4",
  "webm",
  "mov",
  "mkv",
  "avi",
  "pdf",
  "doc",
  "docx",
  "txt",
  "zip",
  "jpg",
  "jpeg",
  "png",
  "webp",
  "gif",
] as const
export type MediaFileExtension = (typeof MEDIA_FILE_EXTENSIONS)[number]

/**
 * Reads the extension from the final dot, whatever the rest of the name looks
 * like. Document pickers return real names ("My Report (1).pdf", "résumé.pdf"),
 * so restricting the base name rejected perfectly valid PDFs and documents.
 */
export function mediaFileExtension(fileName: string): MediaFileExtension | undefined {
  const name = fileName.trim().toLowerCase()
  const dot = name.lastIndexOf(".")
  if (dot <= 0 || dot === name.length - 1) return undefined

  const extension = name.slice(dot + 1)
  if (!/^[a-z0-9]{1,5}$/.test(extension)) return undefined

  return MEDIA_FILE_EXTENSIONS.includes(extension as MediaFileExtension)
    ? (extension as MediaFileExtension)
    : undefined
}

/** Extension -> canonical MIME type for this app's allowed uploads. */
const EXTENSION_CONTENT_TYPES: Record<MediaFileExtension, MediaContentType> = {
  mp3: "audio/mpeg",
  wav: "audio/wav",
  ogg: "audio/ogg",
  aac: "audio/aac",
  flac: "audio/flac",
  m4a: "audio/mp4",
  mp4: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
  mkv: "video/x-matroska",
  avi: "video/x-msvideo",
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  txt: "text/plain",
  zip: "application/zip",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
}

/**
 * Resolves the picker's MIME value onto the allowed set. Pickers frequently
 * report `application/octet-stream`, `image/jpg`, `audio/m4a`, etc.; the
 * extension is the reliable signal, and it is also what the S3 key uses.
 */
export function normalizeMediaContentType(
  fileName: string,
  contentType: string | undefined,
): MediaContentType | undefined {
  if (contentType && (MEDIA_CONTENT_TYPES as readonly string[]).includes(contentType)) {
    return contentType as MediaContentType
  }

  const extension = mediaFileExtension(fileName)
  return extension ? EXTENSION_CONTENT_TYPES[extension] : undefined
}

export const mediaUploadPresignUrlSchema = baseSchema.extend({
  body: z.strictObject({
    // Pickers can report variant types (`application/octet-stream`, `audio/m4a`);
    // the service resolves the canonical type from the extension.
    contentType: z.string().min(1).max(255),
    fileName: str(1, 255).refine(
      (name) => mediaFileExtension(name) !== undefined,
      "This file type is not allowed",
    ),
    fileSize: z
      .number()
      .int()
      .positive()
      .max(MAX_MEDIA_FILE_SIZE, "File size must not exceed 100MB"),
    conversationId: compositeConversationId,
  }),
})

export type MediaUploadPresignUrlRequest = z.infer<typeof mediaUploadPresignUrlSchema>
