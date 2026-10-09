import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { consoleLogin } from "../api";
import { CoreChip } from "../components";

export function OperatorLogin() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await consoleLogin(email, password);
      if (res.fiduciaries.length > 0) {
        navigate(`/company/${res.fiduciaries[0].slug}`);
      } else {
        setError("You don't own any companies.");
      }
    } catch (err: any) {
      setError(err.message || "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen bg-paper">
      <div className="m-auto w-full max-w-sm rounded-xl bg-surface p-8 shadow-sm">
        <div className="mb-6 flex justify-between">
          <h1 className="text-2xl font-black tracking-tight text-ink">Sign in to Sammati</h1>
          <CoreChip />
        </div>
        <form onSubmit={handleLogin} className="flex flex-col gap-4">
          <div>
            <label className="mb-1 block text-sm font-bold text-mute">Email address</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full rounded border border-line bg-paper px-3 py-2 text-ink outline-none focus:border-marigold"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-bold text-mute">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full rounded border border-line bg-paper px-3 py-2 text-ink outline-none focus:border-marigold"
            />
          </div>
          {error && <div className="text-sm font-bold text-rust">{error}</div>}
          <button
            type="submit"
            disabled={loading}
            className="mt-2 w-full rounded bg-marigold py-2 font-bold text-ink shadow-sm hover:brightness-105 disabled:opacity-50"
          >
            {loading ? "Signing in..." : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
