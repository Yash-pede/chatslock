import type {ZodType, z} from "zod";

/** Validates an item against a schema, throwing instead of returning a result. */
export const parseOrThrow = <S extends ZodType>(schema: S, input: unknown): z.output<S> => {
    const result = schema.safeParse(input);
    if (!result.success) throw new Error(result.error.message, {cause: result.error});
    return result.data;
};

/**
 * Returns the object's defined-valued entries as `[key, value]` pairs, typed by key;
 * keys listed in `exclude` are dropped.
 */
export const definedEntries = <T extends object, K extends Exclude<keyof T, E>, E extends keyof T = never>(
    input: T,
    exclude: readonly E[] = [],
): [K, T[K]][] =>
    Object.entries(input).filter(
        ([key, value]) => value !== undefined && !exclude.includes(key as E),
    ) as [K, T[K]][];
