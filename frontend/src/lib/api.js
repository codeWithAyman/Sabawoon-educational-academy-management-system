import axios from "axios";

const api = axios.create({
  baseURL: "/api",
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("hm_token");

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status;
    const code = error.response?.data?.code;

    const isAuthenticationFailure =
      status === 401 && (code === "AUTH_REQUIRED" || code === "AUTH_INVALID");

    if (isAuthenticationFailure) {
      localStorage.removeItem("hm_token");
      localStorage.removeItem("hm_user");

      const path = location.pathname;

      if (
        !path.startsWith("/login") &&
        !path.startsWith("/register") &&
        path !== "/"
      ) {
        location.href = "/login";
      }
    }

    return Promise.reject(error);
  },
);

export default api;
