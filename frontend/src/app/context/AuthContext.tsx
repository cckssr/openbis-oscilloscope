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
import {
  NoOpenBISSessionError,
  readOpenBISCookie,
  readOpenBISTokenFragment,
} from "./openbisSession";

interface AuthContextValue {
  token: string | null;
  user: UserInfo | null;
  /** true while the stored token is being validated against /auth/me on first load */
  isLoading: boolean;
  /** Validate token against /auth/me and persist it. Throws ApiError on failure. */
  login: (token: string) => Promise<void>;
  /**
   * Re-reads the `openbis` cookie (or URL fragment) and logs in with it.
   * Throws {@link NoOpenBISSessionError} when there is none, ApiError when it is rejected.
   */
  loginFromOpenBISCookie: () => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const STORAGE_KEY = "osc_auth_token";

/**
 * Provides the session token and user. On startup the token comes from
 * localStorage, the `openbis` cookie or a `#token=` fragment (in that order)
 * and is validated once against `/auth/me`; a 401 clears it silently.
 * @param props - `children` to render inside the provider
 * @returns The provider element
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  // Resolve the initial token exactly once: reading the URL fragment clears it.
  const [initialToken] = useState<string | null>(
    () =>
      localStorage.getItem(STORAGE_KEY) ??
      readOpenBISCookie() ??
      readOpenBISTokenFragment(),
  );
  const [token, setToken] = useState<string | null>(initialToken);
  const [user, setUser] = useState<UserInfo | null>(null);
  const [isLoading, setIsLoading] = useState(initialToken !== null);

  // Validate the stored token once on mount.
  useEffect(() => {
    if (!token) return; // isLoading starts false when there is no stored token
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

  const loginFromOpenBISCookie = async () => {
    const found = readOpenBISCookie() ?? readOpenBISTokenFragment();
    if (!found) throw new NoOpenBISSessionError();
    await login(found);
  };

  const logout = () => {
    localStorage.removeItem(STORAGE_KEY);
    setToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{ token, user, isLoading, login, loginFromOpenBISCookie, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

/**
 * Reads the auth context.
 * @returns Token, user and the login/logout actions
 * @throws Error when used outside {@link AuthProvider}
 */
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}
