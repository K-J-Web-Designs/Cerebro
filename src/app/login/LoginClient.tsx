"use client";

import { Suspense, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ArrowRight, Mail, Sparkles } from "lucide-react";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import styles from "./login.module.css";

function LoginForm({
  supabaseUrl,
  supabaseAnonKey,
}: {
  supabaseUrl: string;
  supabaseAnonKey: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialMode =
    searchParams.get("mode") === "register" ? "register" : "login";
  const callbackUrl = searchParams.get("callbackUrl") || "/workspace";

  const supabaseEnabled = Boolean(supabaseUrl && supabaseAnonKey);
  const supabase = useMemo(
    () =>
      createBrowserSupabaseClient({
        url: supabaseUrl,
        anonKey: supabaseAnonKey,
      }),
    [supabaseUrl, supabaseAnonKey]
  );

  const [mode, setMode] = useState<"login" | "register" | "magic">(initialMode);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(
    searchParams.get("error") ? "Authentication could not be completed." : null
  );
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setStatusMessage(null);
    setLoading(true);

    try {
      if (!supabase) {
        const res = await fetch("/api/auth/local-demo", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: email || "kris@cerebro.app",
            name: name || email.split("@")[0] || "Kris Jones",
          }),
        });
        if (!res.ok) {
          setError("Could not start local session.");
          setLoading(false);
          return;
        }
        router.push(callbackUrl);
        router.refresh();
        return;
      }

      if (mode === "magic") {
        const { error: otpError } = await supabase.auth.signInWithOtp({
          email: email.trim(),
          options: {
            emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(callbackUrl)}`,
          },
        });
        if (otpError) {
          setError(otpError.message);
        } else {
          setStatusMessage(
            "Magic sign-in link sent! Check your inbox to continue into Cerebro."
          );
        }
        setLoading(false);
        return;
      }

      if (mode === "register") {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: {
              full_name: name.trim(),
            },
            emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(callbackUrl)}`,
          },
        });
        if (signUpError) {
          setError(signUpError.message);
          setLoading(false);
          return;
        }
        if (!data.session) {
          setStatusMessage(
            "Account created! Confirm your email via the link sent by Supabase to sign in."
          );
          setLoading(false);
          return;
        }
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (signInError) {
          setError(signInError.message);
          setLoading(false);
          return;
        }
      }

      router.push(callbackUrl);
      router.refresh();
    } catch {
      setError("Authentication request failed.");
      setLoading(false);
    }
  }

  async function handleOAuth(provider: "google" | "github") {
    if (!supabase) return;
    setError(null);
    setLoading(true);
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(callbackUrl)}`,
      },
    });
    if (oauthError) {
      setError(oauthError.message);
      setLoading(false);
    }
  }

  async function handleLocalDemo() {
    setError(null);
    setLoading(true);
    const res = await fetch("/api/auth/local-demo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "kris@cerebro.app",
        name: "Kris Jones",
      }),
    });
    if (!res.ok) {
      setError("Could not start local demo session.");
      setLoading(false);
      return;
    }
    router.push(callbackUrl);
    router.refresh();
  }

  return (
    <div className={styles.shell}>
      <div className={styles.card}>
        <Link href="/" className={styles.brandRow}>
          <img src="/icon.svg" alt="Cerebro" width={32} height={32} />
          <div>
            <span className={styles.brandTitle}>Cerebro</span>
            <span className={styles.brandSub}>
              {supabaseEnabled
                ? "Sign in with Supabase Auth"
                : "Local Workspace Mode (Supabase env not set)"}
            </span>
          </div>
        </Link>

        <div
          className={styles.tabs}
          style={{ gridTemplateColumns: "1fr 1fr 1fr" }}
          role="tablist"
        >
          <button
            type="button"
            role="tab"
            aria-selected={mode === "login"}
            className={mode === "login" ? styles.tabActive : styles.tab}
            onClick={() => {
              setMode("login");
              setError(null);
              setStatusMessage(null);
            }}
          >
            Sign In
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "magic"}
            className={mode === "magic" ? styles.tabActive : styles.tab}
            onClick={() => {
              setMode("magic");
              setError(null);
              setStatusMessage(null);
            }}
          >
            Magic Link
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "register"}
            className={mode === "register" ? styles.tabActive : styles.tab}
            onClick={() => {
              setMode("register");
              setError(null);
              setStatusMessage(null);
            }}
          >
            Sign Up
          </button>
        </div>

        <form onSubmit={handleSubmit} className={styles.form}>
          {mode === "register" && (
            <label className={styles.field}>
              <span>Full Name</span>
              <input
                id="auth-name"
                type="text"
                className="input"
                placeholder="Kris Jones"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </label>
          )}

          <label className={styles.field}>
            <span>Email</span>
            <input
              id="auth-email"
              type="email"
              className="input"
              placeholder="your.account@domain.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </label>

          {mode !== "magic" && (
            <label className={styles.field}>
              <span>Password</span>
              <input
                id="auth-password"
                type="password"
                className="input"
                placeholder="Minimum 6 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={6}
                required
              />
            </label>
          )}

          {error && <p className={styles.error}>{error}</p>}
          {statusMessage && (
            <p
              style={{
                fontSize: "0.84rem",
                color: "var(--accent-sage)",
                background: "var(--accent-sage-soft)",
                padding: "0.5rem 0.75rem",
                borderRadius: "var(--radius-sm)",
              }}
            >
              {statusMessage}
            </p>
          )}

          <button
            id="auth-submit"
            type="submit"
            className="btn btn-primary"
            disabled={loading}
          >
            {mode === "magic" ? (
              <>
                <Mail size={15} />
                {loading ? "Sending Link..." : "Send Magic Link"}
              </>
            ) : (
              <>
                {loading
                  ? "Authenticating..."
                  : mode === "register"
                    ? "Create Supabase Account"
                    : "Sign In"}
                <ArrowRight size={15} />
              </>
            )}
          </button>
        </form>

        {supabaseEnabled ? (
          <>
            <div className={styles.divider}>
              <span>or continue with OAuth</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>
              <button
                type="button"
                className="btn"
                onClick={() => void handleOAuth("google")}
                disabled={loading}
              >
                Google
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => void handleOAuth("github")}
                disabled={loading}
              >
                GitHub
              </button>
            </div>
          </>
        ) : (
          <>
            <div className={styles.divider}>
              <span>local preview (no Supabase keys set)</span>
            </div>
            <button
              id="demo-login-btn"
              type="button"
              className={`btn ${styles.demoBtn}`}
              onClick={handleLocalDemo}
              disabled={loading}
            >
              <Sparkles size={15} />
              Continue as Kris Jones (Local Preview)
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export function LoginClient({
  supabaseUrl,
  supabaseAnonKey,
}: {
  supabaseUrl: string;
  supabaseAnonKey: string;
}) {
  return (
    <Suspense fallback={<div className={styles.shell}>Loading...</div>}>
      <LoginForm
        supabaseUrl={supabaseUrl}
        supabaseAnonKey={supabaseAnonKey}
      />
    </Suspense>
  );
}
