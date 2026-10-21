import { apiClient } from "@repo/utils";
import "@/lib/api";

/**
 * Single entry point for authenticated API calls. All shared-client setup
 * (base URL, bearer token, 401 refresh-and-replay) lives in `@repo/utils`;
 * screens must import this instead of axios/fetch directly.
 */
export { apiClient };
export default apiClient;
