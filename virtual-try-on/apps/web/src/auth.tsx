import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { api, clearCsrf, errorMessage, refreshCsrf } from "./api";
import type { AuthConfig, User } from "./types";

import { AuthContext } from "./auth-context";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [config, setConfig] = useState<AuthConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [configError, setConfigError] = useState<string | null>(null);
  const refreshUser = useCallback(async () => {
    const result = await api<{ user: User | null }>("/auth/session");
    setUser(result.user);
    return result.user;
  }, []);
  const load = useCallback(
    () =>
      Promise.allSettled([
        api<{ user: User | null }>("/auth/session"),
        api<AuthConfig>("/auth/config"),
      ]).then((results) => {
        if (results[0].status === "fulfilled") setUser(results[0].value.user);
        else {
          setUser(null);
          setError(errorMessage(results[0].reason));
        }
        if (results[1].status === "fulfilled") setConfig(results[1].value);
        else {
          setConfig(null);
          setConfigError(errorMessage(results[1].reason));
        }
        setLoading(false);
      }),
    [],
  );
  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    setConfigError(null);
    await load();
  }, [load]);
  useEffect(() => {
    void load();
    const expired = () => {
      clearCsrf();
      setUser(null);
      setError("Your session has ended. Please sign in again.");
    };
    window.addEventListener("vw:session-expired", expired);
    return () => window.removeEventListener("vw:session-expired", expired);
  }, [load]);
  const completeAuth = async (account: User) => {
    setUser(account);
    setError(null);
    try {
      await refreshCsrf();
    } catch (failure) {
      setError(errorMessage(failure));
    }
  };
  const logout = async () => {
    await api<void>("/auth/logout", { method: "POST", body: {} });
    clearCsrf();
    setUser(null);
    setError(null);
  };
  return (
    <AuthContext.Provider
      value={{
        user,
        config,
        loading,
        error,
        configError,
        reload,
        refreshUser,
        completeAuth,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
