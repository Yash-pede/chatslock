import * as z from "zod"

export const baseSchema = z.strictObject({
  body: z.strictObject({}),
  query: z.strictObject({}),
  params: z.strictObject({}),
})

export type eventReply = {
  type: string
  data: string
}

export const baseEventSchema = z.strictObject({
  eventType: z.string(),
  data: z.any(),
})
