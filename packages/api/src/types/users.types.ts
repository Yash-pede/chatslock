import type {RoleName} from "../utils";

/**
 * A row in the users table.
 * Partition key: `userId` (Cognito `sub`).
 * Timestamps are epoch milliseconds and are populated by the DAO, never by
 * callers.
 */
export type User = {
    userId: string;
    cognitoUsername: string;
    username: string;
    fullName: string;
    imageUrl?: string;
    phone?: string;
    role: RoleName;
    agentId?: string;
    createdAt: number;
    updatedAt: number;
};

/** Primary key of the users table. */
export type UserKey = Pick<User, "userId">;

/** Fields required to create a user; timestamps are added by the DAO. */
export type CreateUserInput = Omit<User, "createdAt" | "updatedAt">;

/** A user update: the partition key plus any fields to change. */
export type UpdateUserInput = Pick<User, "userId"> &
    Partial<Omit<User, "userId" | "createdAt" | "updatedAt">>;
