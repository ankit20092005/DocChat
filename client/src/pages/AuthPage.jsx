import { useEffect, useRef, useState } from "react";
import { Eye, EyeOff, LoaderCircle, LockKeyhole, Mail } from "lucide-react";
import { Link, useLocation } from "react-router";
import { useAuth } from "../context/Auth";
import { errorText } from "../api/client";
import { Brand, IconButton, ThemeButton } from "../components/Primitives";

export default function AuthPage({ register = false }) {
  const { signIn } = useAuth();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef(null);
  useEffect(() => {
    document.title = (register ? "Create an account" : "Sign in") + " · DocChat";
    return () => pending.current?.abort();
  }, [register]);
  async function submit(event) {
    event.preventDefault();
    if (pending.current) return;
    setError("");
    if (new TextEncoder().encode(password).length > 72) { setError("Use a password of 72 UTF-8 bytes or fewer."); return; }
    const controller = new AbortController();
    pending.current = controller;
    setBusy(true);
    try { await signIn(register ? "register" : "login", email.trim(), password, controller.signal); }
    catch (e) { if (!controller.signal.aborted) setError(errorText(e, "Couldn’t sign in. Please try again.")); }
    finally { pending.current = null; if (!controller.signal.aborted) setBusy(false); }
  }
  return <main className="auth-layout">
    <section className="auth-story" aria-label="About DocChat">
      <img className="auth-art" src="/reading-room.webp" alt="" fetchPriority="high" />
      <Brand light />
      <div className="story-copy">
        <h2>Your documents,<br /><em>in conversation.</em></h2>
        <p>Ask a question. Follow the answer back to the page it came from.</p>
      </div>
    </section>
    <section className="auth-side">
      <div className="auth-tools"><ThemeButton /></div>
      <div className="auth-form-wrap">
        <h1>{register ? "Create an account" : "Welcome back"}</h1>
        <p className="auth-intro">{register ? "Set up your personal document workspace." : "Sign in to your document workspace."}</p>
        <form onSubmit={submit} className="auth-form">
          <label htmlFor="email">Email address</label>
          <div className="field"><Mail size={18} /><input required id="email" name="email" type="email" autoComplete="email"
            maxLength={254} placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
          <label htmlFor="password">Password</label>
          <div className="field"><LockKeyhole size={18} /><input required id="password" name="password" type={visible ? "text" : "password"}
            autoComplete={register ? "new-password" : "current-password"} minLength={register ? 8 : 1}
            aria-describedby={register ? "password-help" : undefined}
            placeholder={register ? "Choose a password" : "Enter your password"} value={password} onChange={(e) => setPassword(e.target.value)} />
            <IconButton label={visible ? "Hide password" : "Show password"} aria-pressed={visible} onClick={() => setVisible(!visible)}>
              {visible ? <EyeOff size={17} /> : <Eye size={17} />}</IconButton>
          </div>
          {register && <p id="password-help" className="field-help">Use at least 8 characters.</p>}
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="primary auth-submit" disabled={busy}>{busy && <LoaderCircle className="spin" size={17} />}
            {register ? "Create account" : "Sign in"}</button>
        </form>
        <p className="auth-switch">{register ? "Already have an account? " : "New to DocChat? "}
          <Link to={register ? "/login" : "/register"} state={location.state}>{register ? "Sign in" : "Create an account"}</Link>
        </p>
      </div>
    </section>
  </main>;
}
