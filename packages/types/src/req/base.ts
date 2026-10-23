import * as z from "zod"

export const baseSchema = z.strictObject({
  body: z.strictObject({}),
  query: z.strictObject({}),
  params: z.strictObject({}),
})
