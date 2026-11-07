import { useState, type FormEvent } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { useLogin, useMe, useRegister } from "@/api/hooks";
import { Button, Field, Icon, Input, Panel } from "@/components/ui";
import { errorMessage } from "@/api/client";
import { clearReturnTo, peekReturnTo, safeReturnTo } from "@/lib/returnTo";

export function AuthPage({ mode }: { mode: "login" | "register" }) {
  const me = useMe();
  const nav = useNavigate();
  const loc = useLocation() as { state?: { from?: string } };
  const login = useLogin();
  const register = useRegister();
  const [identifier, setIdentifier] = useState("");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const from = safeReturnTo(loc.state?.from) ?? peekReturnTo() ?? "/";
  const sharedSheet = from.startsWith("/s/");

  if (me.data) {
    clearReturnTo();
    return <Navigate to={from} replace />;
  }

  const busy = login.isPending || register.isPending;
  const err = login.error ?? register.error;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      if (mode === "login") await login.mutateAsync({ identifier, password });
      else await register.mutateAsync({ email, username: username || undefined, password });
      clearReturnTo();
      nav(from, { replace: true });
    } catch {
      /* toast shown by hook */
    }
  };

  return (
    <div className="flex min-h-full items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="font-display text-3xl font-black tracking-[0.2em] text-cyan glow-text">
            NEOM<span className="text-crimson">//</span>NET
          </div>
          <div className="mt-1 font-display text-[0.6rem] uppercase tracking-[0.35em] text-muted">Campaign Operating System · v0.1</div>
        </div>
        {sharedSheet && (
          <div className="mb-3 flex items-center gap-2 border border-cyan/40 bg-cyan/5 px-3 py-2 text-xs text-cyan" data-testid="shared-login-hint">
            <Icon name="link" size={14} /> {mode === "login" ? "Sign in" : "Create an account"} to open the shared character sheet. You stay signed in on this device.
          </div>
        )}
        <Panel title={mode === "login" ? "Authenticate" : "Register identity"} icon="fingerprint">
          <form onSubmit={submit} className="space-y-3">
            {mode === "login" ? (
              <Field label="Email or handle">
                <Input autoFocus value={identifier} onChange={(e) => setIdentifier(e.target.value)} autoComplete="username" required />
              </Field>
            ) : (
              <>
                <Field label="Email">
                  <Input autoFocus type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
                </Field>
                <Field label="Handle (optional)" hint="Shown to other players. Letters, numbers, _ - . only, no @. Defaults to the part of your email before @.">
                  <Input value={username} onChange={(e) => setUsername(e.target.value.replace(/[^a-zA-Z0-9_\-.]/g, ""))} autoComplete="nickname" placeholder={email.split("@")[0] || "handle"} />
                </Field>
              </>
            )}
            <Field label="Passphrase" hint={mode === "register" ? "At least 4 characters" : undefined}>
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === "login" ? "current-password" : "new-password"} required />
            </Field>
            {err && <div className="text-xs text-crimson">{errorMessage(err)}</div>}
            <Button type="submit" variant="solid" className="w-full" disabled={busy} icon={mode === "login" ? "log-in" : "user-plus"}>
              {mode === "login" ? "Jack in" : "Create account"}
            </Button>
          </form>
          <div className="mt-3 text-center text-xs text-muted">
            {mode === "login" ? (
              <>
                No identity yet?{" "}
                <Link to="/register" state={{ from }} className="text-cyan hover:underline">
                  Register
                </Link>
              </>
            ) : (
              <>
                Already registered?{" "}
                <Link to="/login" state={{ from }} className="text-cyan hover:underline">
                  Log in
                </Link>
              </>
            )}
          </div>
        </Panel>
      </div>
    </div>
  );
}
