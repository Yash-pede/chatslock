import axios, { AxiosError, AxiosInstance, AxiosResponse, InternalAxiosRequestConfig } from "axios"
import { getApiBaseUrl } from "./config"
import { tokenManager } from "./auth/tokenManager"
import { refresh as refreshTokens } from "./auth/authService"
import { authEvents } from "./auth/authEvents"

/**
 * The shared client for authenticated API calls. The base URL is resolved per
 * request (from `configureApi`/env), the access token is attached, and a 401
 * triggers one transparent refresh-and-replay.
 */
export const apiClient: AxiosInstance = axios.create({
  timeout: 30000,
})

/**
 * Latest token known to the client, kept in sync with `tokenManager`. Reading
 * it in the request interceptor avoids the async secure-store lookup that used
 * to send the very first request after sign-in out without a token.
 */
let currentAccessToken: string | null = null

const syncAccessToken = () => {
  currentAccessToken = tokenManager.getAccessToken()
}

// `tokenManager` is synchronous; this only mirrors its state.
syncAccessToken()
tokenManager.onChange(syncAccessToken)

apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    config.baseURL = getApiBaseUrl()
    // Refresh before the request goes out rather than eating a 401 first.
    if (tokenManager.isAccessTokenExpired()) syncAccessToken()

    const accessToken = currentAccessToken
    if (accessToken) {
      config.headers.Authorization = `Bearer ${accessToken}`
    }
    // Only send a JSON content type when there is a body: a bodyless GET with
    // `Content-Type: application/json` is needlessly rejected by strict proxies.
    if (config.data !== undefined && config.headers["Content-Type"] === undefined) {
      config.headers["Content-Type"] = "application/json"
    }
    return config
  },
  (error: AxiosError) => Promise.reject(error),
)

type RetriableConfig = InternalAxiosRequestConfig & { _retry?: boolean }

let isRefreshing = false
let failedQueue: Array<{
  resolve: (token: string) => void
  reject: (error: unknown) => void
}> = []

function processQueue(error: unknown, token: string | null = null): void {
  failedQueue.forEach((promise) => {
    if (error) promise.reject(error)
    else if (token) promise.resolve(token)
  })
  failedQueue = []
}

apiClient.interceptors.response.use(
  (response: AxiosResponse) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as RetriableConfig | undefined

    if (error.response?.status !== 401 || !originalRequest || originalRequest._retry) {
      return Promise.reject(error)
    }

    // A 401 while refreshing (or on the refresh call itself) means the
    // session is dead — don't loop.
    if (isRefreshing) {
      return new Promise((resolve, reject) => {
        failedQueue.push({
          resolve: (token: string) => {
            originalRequest.headers.Authorization = `Bearer ${token}`
            resolve(apiClient(originalRequest))
          },
          reject,
        })
      })
    }

    originalRequest._retry = true
    isRefreshing = true

    try {
      const tokens = await refreshTokens()
      processQueue(null, tokens.accessToken)
      originalRequest.headers.Authorization = `Bearer ${tokens.accessToken}`
      return apiClient(originalRequest)
    } catch (refreshError) {
      processQueue(refreshError, null)
      await tokenManager.clearAllTokens()
      authEvents.emitLogout()
      return Promise.reject(refreshError)
    } finally {
      isRefreshing = false
    }
  },
)

export default apiClient
