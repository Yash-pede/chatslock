import axios, { AxiosError, AxiosInstance, AxiosResponse, InternalAxiosRequestConfig } from "axios"
import { getApiBaseUrl } from "./config"
import { tokenManager } from "./auth/tokenManager"
import { tokenRefreshService } from "./auth/tokenRefreshService"

/**
 * The shared client for authenticated API calls. The base URL is resolved per
 * request (from `configureApi`/env), the access token is attached, and a 401
 * triggers one transparent refresh-and-replay.
 */
export const apiClient: AxiosInstance = axios.create({
  timeout: 30000,
})

apiClient.interceptors.request.use(
  async (config: InternalAxiosRequestConfig) => {
    config.baseURL = getApiBaseUrl()

    const accessToken = tokenManager.getAccessToken()
    if (!accessToken) {
      // Cold start: the background refresh is (or should be) in flight. Wait
      // on the shared refresh once instead of sending a request that will 401
      // and start yet another refresh.
      await tokenRefreshService.refreshNow()
    }

    const current = tokenManager.getAccessToken()
    if (current) {
      config.headers.Authorization = `Bearer ${current}`
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

    // A concurrent refresh completed while this request was in flight: replay
    // with the fresh token instead of starting another refresh.
    const freshToken = tokenManager.getAccessToken()
    if (freshToken && !tokenManager.isAccessTokenExpired()) {
      originalRequest._retry = true
      originalRequest.headers.Authorization = `Bearer ${freshToken}`
      return apiClient(originalRequest)
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
      await tokenRefreshService.refreshNow()
      const accessToken = tokenManager.getAccessToken()
      if (!accessToken) throw new Error("The session could not be refreshed.")

      processQueue(null, accessToken)
      originalRequest.headers.Authorization = `Bearer ${accessToken}`
      return apiClient(originalRequest)
    } catch (refreshError) {
      processQueue(refreshError, null)
      return Promise.reject(refreshError)
    } finally {
      isRefreshing = false
    }
  },
)

export default apiClient
