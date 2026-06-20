import axios from "axios";

/**
 * Base Axios Instance
 */
const api = axios.create({
  baseURL: import.meta.env.VITE_BASEURL,
  timeout: 15000,
  headers: {
    "Content-Type": "application/json"
  }
});

let isRefreshing = false;
let failedQueue = [];
let sessionExpiredNotified = false; // avoid firing the "login again" prompt repeatedly

/**
 * Resolve / Reject queued requests
 */
const processQueue = (error, token = null) => {
  failedQueue.forEach(p => {
    error ? p.reject(error) : p.resolve(token);
  });
  failedQueue = [];
};

/** Read the stored refresh token (lives on the cached user object). */
const getRefreshToken = () => {
  try {
    const userStr = localStorage.getItem("user");
    return userStr ? JSON.parse(userStr)?.refreshToken || null : null;
  } catch {
    return null;
  }
};

/**
 * Session is no longer recoverable (no refresh token, or refresh failed).
 * Clear the stored auth and ask the React layer to open the login modal.
 * Guarded so concurrent 401s don't spam the prompt.
 */
const handleSessionExpired = () => {
  localStorage.removeItem("token");
  localStorage.removeItem("user");
  if (sessionExpiredNotified) return;
  sessionExpiredNotified = true;
  window.dispatchEvent(new CustomEvent("auth:session-expired"));
};

// once a fresh login happens, allow the prompt to fire again next time
window.addEventListener("auth:login", () => {
  sessionExpiredNotified = false;
});

/**
 * REQUEST INTERCEPTOR
 * → Normal API  : x-access-token
 * → Refresh API : x-refresh-token
 */
api.interceptors.request.use(
  (config) => {
    const accessToken = localStorage.getItem("token");

    let refreshToken = null;
    try {
      const userStr = localStorage.getItem("user");
      if (userStr) {
        const user = JSON.parse(userStr);
        refreshToken = user?.refreshToken || null;
      }
    } catch {
      refreshToken = null;
    }

    // 🔁 Refresh API
    if (config.url?.includes("/auth/refresh-token")) {
      if (refreshToken) {
        config.headers["x-refresh-token"] = refreshToken;
      }
      delete config.headers["x-access-token"];
      return config;
    }

    // 🔐 Normal APIs
    if (accessToken) {
      config.headers["x-access-token"] = accessToken;
    }

    return config;
  },
  (error) => Promise.reject(error)
);

/**
 * RESPONSE INTERCEPTOR
 * → Handle 401 → refresh → retry
 */
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // ❌ Refresh API itself failed (e.g. missing/expired refresh token) → session over
    if (originalRequest?.url?.includes("/auth/refresh-token")) {
      handleSessionExpired();
      return Promise.reject(error);
    }

    if (error.response?.status === 401 && !originalRequest._retry) {
      // No refresh token to renew with → don't bother calling refresh, just
      // ask the user to log in again. This avoids the backend's
      // "One of these headers is required: x-refresh-token" 401 loop.
      if (!getRefreshToken()) {
        handleSessionExpired();
        return Promise.reject(error);
      }

      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        }).then((token) => {
          originalRequest.headers["x-access-token"] = token;
          return api(originalRequest);
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        /* 🔁 CALL REFRESH API */
        const res = await api.get("/auth/refresh-token");

        const newAccessToken =
          res?.data?.data?.accessToken || res?.data?.accessToken;

        if (!newAccessToken) {
          throw new Error("No access token from refresh API");
        }

        localStorage.setItem("token", newAccessToken);
        api.defaults.headers["x-access-token"] = newAccessToken;

        processQueue(null, newAccessToken);

        originalRequest.headers["x-access-token"] = newAccessToken;
        return api(originalRequest);

      } catch (err) {
        processQueue(err, null);
        handleSessionExpired();
        return Promise.reject(err);

      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);

export default api;
