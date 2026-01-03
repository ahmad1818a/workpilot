"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/dashboard";

  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string>("");

  const submit = async () => {
    setMsg("");
    setLoading(true);
    try {
      if (!email || !password) {
        setMsg("Please enter email + password.");
        return;
      }

      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
        });
        if (error) throw error;

        // لو عندك Email Confirm ON: المستخدم يحتاج يفتح الايميل
        // لو OFF: سيدخل مباشرة
        const { data } = await supabase.auth.getUser();
        if (data.user) router.push(next);
        else setMsg("Account created. Check your email to confirm, then login.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;

        router.push(next);
      }
    } catch (e: any) {
      setMsg(e?.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const resetPassword = async () => {
    setMsg("");
    setLoading(true);
    try {
      if (!email) {
        setMsg("Enter your email first.");
        return;
      }
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/login`,
      });
      if (error) throw error;
      setMsg("Password reset email sent. Check your inbox.");
    } catch (e: any) {
      setMsg(e?.message || "Failed to send reset email");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: 420, margin: "40px auto", padding: 16 }}>
      <h1 style={{ fontSize: 22, fontWeight: 700 }}>ZRSchedule</h1>
      <p style={{ opacity: 0.8, marginTop: 6 }}>
        {mode === "login" ? "Sign in" : "Create an account"}
      </p>

      <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
        <button
          onClick={() => setMode("login")}
          disabled={loading}
          style={{
            flex: 1,
            padding: 10,
            borderRadius: 10,
            border: "1px solid #ddd",
            background: mode === "login" ? "#111" : "#fff",
            color: mode === "login" ? "#fff" : "#111",
          }}
        >
          Login
        </button>
        <button
          onClick={() => setMode("signup")}
          disabled={loading}
          style={{
            flex: 1,
            padding: 10,
            borderRadius: 10,
            border: "1px solid #ddd",
            background: mode === "signup" ? "#111" : "#fff",
            color: mode === "signup" ? "#fff" : "#111",
          }}
        >
          Sign up
        </button>
      </div>

      <div style={{ display: "grid", gap: 10, marginTop: 14 }}>
        <input
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          style={{ padding: 12, borderRadius: 10, border: "1px solid #ddd" }}
        />
        <input
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          type="password"
          autoComplete={mode === "login" ? "current-password" : "new-password"}
          style={{ padding: 12, borderRadius: 10, border: "1px solid #ddd" }}
        />

        <button
          onClick={submit}
          disabled={loading}
          style={{
            padding: 12,
            borderRadius: 10,
            border: "none",
            background: "#111",
            color: "#fff",
            fontWeight: 700,
          }}
        >
          {loading ? "Please wait..." : mode === "login" ? "Login" : "Create account"}
        </button>

        {mode === "login" && (
          <button
            onClick={resetPassword}
            disabled={loading}
            style={{
              padding: 10,
              borderRadius: 10,
              border: "1px solid #ddd",
              background: "#fff",
            }}
          >
            Forgot password
          </button>
        )}

        {msg && (
          <div
            style={{
              padding: 10,
              borderRadius: 10,
              background: "#f5f5f5",
              border: "1px solid #e5e5e5",
            }}
          >
            {msg}
          </div>
        )}
      </div>
    </div>
  );
}
