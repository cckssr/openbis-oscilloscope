import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { getMe } from "../../api/auth";
import { ApiError } from "../../api/client";
import type { UserInfo } from "../../api/types";

interface AuthContextValue {
  token: string | null;
  user: UserInfo | null;
  /** true while the stored token is being validated against /auth/me on first load */
  isLoading: boolean;
  /** Validate token against /auth/me and persist it. Throws ApiError on failure. */
  login: (token: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const STORAGE_KEY = "osc_auth_token";

function getOpenBISCookie(): string | null {
  return document.cookie.match(/(?:^|;\s*)openbis=([^;]+)/)?.[1] ?? null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(
    () => localStorage.getItem(STORAGE_KEY) ?? getOpenBISCookie(),
  );
  const [user, setUser] = useState<UserInfo | null>(null);
  const [isLoading, setIsLoading] = useState(
    () => !!(localStorage.getItem(STORAGE_KEY) ?? getOpenBISCookie()),
  );

  // Validate the stored token once on mount.
  useEffect(() => {
    if (!token) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    getMe(token)
      .then((userInfo) => {
        setUser(userInfo);
        // Persist cookie-sourced token to localStorage so it survives navigation
        if (!localStorage.getItem(STORAGE_KEY)) {
          localStorage.setItem(STORAGE_KEY, token);
        }
      })
      .catch((err) => {
        // 401 means the token expired; clear it silently.
        if (err instanceof ApiError && err.status === 401) {
          localStorage.removeItem(STORAGE_KEY);
          setToken(null);
        }
        // Other errors (network down, etc.) leave the token in place so the
        // user doesn't have to log in again once connectivity is restored.
      })
      .finally(() => setIsLoading(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const login = async (newToken: string) => {
    const userInfo = await getMe(newToken); // throws ApiError on 401
    localStorage.setItem(STORAGE_KEY, newToken);
    setToken(newToken);
    setUser(userInfo);
  };

  const logout = () => {
    localStorage.removeItem(STORAGE_KEY);
    setToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ token, user, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}
