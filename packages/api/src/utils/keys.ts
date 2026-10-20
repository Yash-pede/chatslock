/**
 * Key building/parsing for the single-table layout. The prefixes themselves live
 * in `@repo/types/schema` with the storage schemas; these helpers are server-only.
 */
import {PREFIXES} from "@repo/types/schema";

/**
 * Joins a prefix and the parts that follow it: `buildKey(PREFIXES.CONVERSATION, type, conversationId)`
 * -> `CONVERSATION#DIRECT#<id>`. Throws on an empty or already-prefixed value so ids
 * cannot be double-prefixed (`USER#USER#123`) or silently blank (`USER#`).
 */
export const buildKey = (prefix: string, ...parts: readonly (string | number)[]): string => {
    const key = `${prefix}${parts.join("#")}`;

    if (parts.length === 0 || parts.some((part) => part === "")) {
        throw new Error(`Cannot build key "${key}": id parts must not be empty`);
    }
    if (parts.some((part) => String(part).includes("#"))) {
        throw new Error(`Cannot build key "${key}": id parts must not contain "#"`);
    }
    if (parts[0] !== undefined && String(parts[0]).startsWith(prefix.slice(0, -1))) {
        throw new Error(`Cannot build key "${key}": id is already prefixed`);
    }

    return key;
};

/**
 * Strips a key prefix from an id that may or may not carry it, for values coming
 * back from other items. Returns `undefined` when the id does not start with the
 * expected prefix, so callers decide what to do rather than getting a wrong id.
 */
export const stripKeyPrefix = <T extends string>(id: T, prefix: string): T | undefined =>
    id.startsWith(prefix) ? id.slice(prefix.length) as T : undefined;
