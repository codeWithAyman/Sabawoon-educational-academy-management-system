import { createContext, useContext, useState } from "react";
import api from "../lib/api";

const AuthCtx = createContext(null);

function saveUserSession(token, user) {
  if (token) {
    localStorage.setItem("hm_token", token);
  }

  localStorage.setItem("hm_user", JSON.stringify(user));
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("hm_user") || "null");
    } catch {
      return null;
    }
  });

  async function login(email, password) {
    const { data } = await api.post("/auth/login", {
      email,
      password,
    });

    saveUserSession(data.token, data.user);
    setUser(data.user);

    return data.user;
  }

  async function register(payload) {
    const { data } = await api.post("/auth/register", payload);

    saveUserSession(data.token, data.user);
    setUser(data.user);

    return data.user;
  }

  async function refreshUser() {
    const { data } = await api.get("/auth/me");

    const currentUser = data.user;

    localStorage.setItem(
      "hm_user",
      JSON.stringify({
        id: currentUser.id,
        email: currentUser.email,
        role: currentUser.role,
        name: currentUser.full_name,
        phone: currentUser.phone,
      }),
    );

    setUser({
      id: currentUser.id,
      email: currentUser.email,
      role: currentUser.role,
      name: currentUser.full_name,
      phone: currentUser.phone,
    });

    return data;
  }

  function updateUser(updatedUser, token = null) {
    const normalizedUser = {
      id: updatedUser.id,
      email: updatedUser.email,
      role: updatedUser.role,
      name: updatedUser.full_name || updatedUser.name,
      phone: updatedUser.phone || "",
    };

    if (token) {
      localStorage.setItem("hm_token", token);
    }

    localStorage.setItem("hm_user", JSON.stringify(normalizedUser));

    setUser(normalizedUser);

    return normalizedUser;
  }

  function logout() {
    localStorage.removeItem("hm_token");
    localStorage.removeItem("hm_user");
    setUser(null);
  }

  return (
    <AuthCtx.Provider
      value={{
        user,
        login,
        register,
        refreshUser,
        updateUser,
        logout,
      }}
    >
      {children}
    </AuthCtx.Provider>
  );
}

export const useAuth = () => useContext(AuthCtx);
