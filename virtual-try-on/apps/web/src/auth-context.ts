import { createContext, useContext } from "react";
import type { AuthConfig, User } from "./types";
export interface AuthState {
  user: User | null;
  status: "unknown" | "authenticated" | "guest";
  config: AuthConfig | null;
  configLoading: boolean;
  loading: boolean;
  error: string | null;
  configError: string | null;
  reload: () => Promise<void>;
  refreshUser: () => Promise<User | null>;
  completeAuth: (user: User) => Promise<void>;
  logout: () => Promise<void>;
}
export const AuthContext = createContext<AuthState | null>(null);
export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("AuthProvider required");
  return value;
}
