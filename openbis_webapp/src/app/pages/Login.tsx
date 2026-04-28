import { useState } from "react";
import { useNavigate } from "react-router";
import { useAuth } from "../context/AuthContext";
import { ApiError } from "../../api/client";

export function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [token, setToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token.trim()) return;
    setError(null);
    setIsLoading(true);
    try {
      await login(token.trim());
      navigate("/", { replace: true });
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 401) {
          setError("Token ungültig oder abgelaufen.");
        } else {
          setError(`Serverfehler ${err.status}: ${err.message}`);
        }
      } else {
        setError("Backend nicht erreichbar. Läuft der Server?");
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-(--lab-bg) flex items-center justify-center">
      <div className="w-full max-w-sm border-2 border-(--lab-border) rounded bg-white p-8">
        <h1 className="text-xl font-semibold text-(--lab-text-primary) mb-1">
          Oszilloskop-Steuerung
        </h1>
        <p className="text-sm text-(--lab-text-secondary) mb-6">
          OpenBIS-Sitzungstoken eingeben, um fortzufahren.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-(--lab-text-secondary) mb-1">
              Bearer Token
            </label>
            <input
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="openbis-session-token"
              className="w-full border-2 border-(--lab-border) rounded px-3 py-2 text-sm font-mono focus:outline-none focus:border-(--lab-accent) bg-white"
              autoComplete="off"
              autoFocus
            />
            <p className="text-xs text-(--lab-text-secondary) mt-1">
              Im DEBUG-Modus:{" "}
              <code className="font-mono bg-(--lab-panel) px-1 rounded">
                debug-token
              </code>
            </p>
          </div>

          {error && <p className="text-xs text-(--lab-danger)">{error}</p>}

          <button
            type="submit"
            disabled={isLoading || !token.trim()}
            className="w-full py-2 px-4 border-2 border-(--lab-accent) bg-white text-(--lab-accent) hover:bg-(--lab-accent) hover:text-white rounded font-medium text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? "Verbinden…" : "Verbinden"}
          </button>
        </form>
      </div>
    </div>
  );
}
