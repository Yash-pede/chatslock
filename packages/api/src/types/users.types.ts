import type z from "zod";
import type {createUserSchema, updateUserSchema, userSchema} from "../schema";

/** A row in the users table; partition key `USER#<userId>`, sort key `PROFILE`. */
export type User = z.infer<typeof userSchema>;

/** Fields required to create a user; timestamps are added by the DAO. */
export type CreateUserInput = z.infer<typeof createUserSchema>;

/** A user update: the partition key plus any fields to change. */
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
