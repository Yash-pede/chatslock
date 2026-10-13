import type {RoleName} from "../utils";

export const usersTableName = "users";
/**
 * A row in the users table.
 * Partition key: `userId` (Cognito `sub`).
 */
export type User = {
    userId: string;
    username: string;
    fullName: string;
    imageUrl?: string;
    role: RoleName;
    agentId?: string;
    createdAt: string;
    updatedAt: string;
};

/** Primary key of the users table. */
export type UserKey = Pick<User, "userId">;

/** Attributes required to create a user. */
export type CreateUserInput = Omit<User, "createdAt" | "updatedAt">;

/** A user update: the partition key plus any fields to change. */
export type UpdateUserInput = Pick<User, "userId"> &
    Partial<Omit<User, "userId" | "createdAt" | "updatedAt">>;
