import {configureApi} from "@repo/utils";

export const API_BASE_URL =
    process.env.EXPO_PUBLIC_API_URL?.trim();

configureApi(API_BASE_URL);
