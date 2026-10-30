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

const MEDIA_FILE_EXTENSIONS = [
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
type MediaFileExtension = (typeof MEDIA_FILE_EXTENSIONS)[number]

export function mediaFileExtension(fileName: string): MediaFileExtension | undefined {
  const match = /^[A-Za-z0-9_-]{1,64}\.([A-Za-z0-9]{1,5})$/.exec(fileName)
  const extension = match?.[1]?.toLowerCase()

  return MEDIA_FILE_EXTENSIONS.includes(extension as MediaFileExtension)
    ? (extension as MediaFileExtension)
    : undefined
}

export const mediaUploadPresignUrlSchema = baseSchema.extend({
  body: z.strictObject({
    contentType: z.enum(MEDIA_CONTENT_TYPES, "This file type is not allowed"),
    fileName: str(1, 100).refine(
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