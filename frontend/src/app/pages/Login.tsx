import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { ChevronRight, ExternalLink } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { NoOpenBISSessionError } from "../context/openbisSession";
import { useAppConfig } from "../hooks/useAppConfig";
import { ApiError } from "../../api/client";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "../components/ui/collapsible";
import { de } from "../../i18n/de";

const t = de.login;

/** Maps a failed login to a German message. */
function loginErrorMessage(err: unknown, expiredMessage: string): string {
  if (err instanceof NoOpenBISSessionError) return t.sso.noSession;
  if (err instanceof ApiError) {
    return err.status === 401 ? expiredMessage : t.errors.server(err.status, err.message);
  }
  return t.errors.unreachable;
}

/**
 * Login page. The primary path is single sign-on: open openBIS in a new tab,
 * log in there, come back and press "Anmeldung prüfen" (re-reads the `openbis`
 * cookie). Pasting a session token is tucked away under "Erweitert".
 * @returns The page
 */
export function Login() {
  const { login, loginFromOpenBISCookie } = useAuth();
  const navigate = useNavigate();
  const config = useAppConfig();
  const openbisUrl = config?.openbis_url || null;

  const [token, setToken] = useState("");
  const [advancedOpen, setAdvancedOpen] = useState<boolean | null>(null); // null = default
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [ssoOpened, setSsoOpened] = useState(false);

  // Without SSO the token field is the only way in, so it starts expanded.
  const showAdvanced = advancedOpen ?? !openbisUrl;

  const run = useCallback(
    async (action: () => Promise<void>, expiredMessage: string, silent = false) => {
      setError(null);
      setIsLoading(true);
      try {
        await action();
        navigate("/", { replace: true });
      } catch (err) {
        if (!(silent && err instanceof NoOpenBISSessionError)) {
          setError(loginErrorMessage(err, expiredMessage));
        }
      } finally {
        setIsLoading(false);
      }
    },
    [navigate],
  );

  // Coming back from the openBIS tab: check once automatically, without nagging.
  useEffect(() => {
    if (!ssoOpened) return;
    const onFocus = () => void run(loginFromOpenBISCookie, t.sso.expired, true);
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [ssoOpened, run, loginFromOpenBISCookie]);

  const handleTokenSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!token.trim()) return;
    void run(() => login(token.trim()), t.errors.invalidToken);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-(--lab-bg) p-4">
      <div className="w-full max-w-md space-y-6 rounded border-2 border-(--lab-border) bg-white p-6 sm:p-8">
        <div>
          <h1 className="mb-1 text-xl font-semibold text-(--lab-text-primary)">{t.title}</h1>
          <p className="text-sm text-(--lab-text-secondary)">{t.subtitle}</p>
        </div>

        {openbisUrl && (
          <section className="space-y-3" aria-label={t.sso.button}>
            <Button asChild variant="primary" size="lg" className="w-full">
              <a
                href={openbisUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setSsoOpened(true)}
              >
                {t.sso.button}
                <ExternalLink />
              </a>
            </Button>
            <p className="help-text">{t.sso.returnHint}</p>
            <Button
              variant="secondary"
              className="w-full"
              disabled={isLoading}
              onClick={() => void run(loginFromOpenBISCookie, t.sso.expired)}
            >
              {isLoading ? t.sso.checking : t.sso.check}
            </Button>
          </section>
        )}

        <Collapsible open={showAdvanced} onOpenChange={setAdvancedOpen}>
          <CollapsibleTrigger
            className="group flex min-h-8 w-full items-center gap-1 rounded text-left text-sm font-medium text-(--lab-text-secondary) outline-none hover:text-(--lab-text-primary) focus-visible:ring-2 focus-visible:ring-(--lab-accent)/40 coarse:min-h-11"
          >
            <ChevronRight className="size-4 transition-transform group-data-[state=open]:rotate-90" aria-hidden />
            {t.advanced.toggle}
          </CollapsibleTrigger>
          <CollapsibleContent>
            <form onSubmit={handleTokenSubmit} className="mt-3 space-y-3">
              <div className="space-y-1">
                <label htmlFor="session-token" className="text-xs font-medium text-(--lab-text-secondary)">
                  {t.advanced.label}
                </label>
                <Input
                  id="session-token"
                  type="password"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  placeholder={t.advanced.placeholder}
                  className="font-mono coarse:h-11"
                  autoComplete="off"
                  autoFocus={!openbisUrl}
                />
                {config?.debug && (
                  <p className="help-text">
                    {t.advanced.debugHint}{" "}
                    <code className="rounded bg-(--lab-panel) px-1 font-mono">debug-token</code>
                  </p>
                )}
              </div>
              <Button
                type="submit"
                variant={openbisUrl ? "secondary" : "primary"}
                className="w-full"
                disabled={isLoading || !token.trim()}
              >
                {isLoading ? t.advanced.submitting : t.advanced.submit}
              </Button>
            </form>
          </CollapsibleContent>
        </Collapsible>

        {error && (
          <p role="alert" className="rounded border-2 border-(--lab-danger) px-3 py-2 text-sm text-(--lab-danger)">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
