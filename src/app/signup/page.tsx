"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

export default function SignupPage() {
  const supabase = createClient();
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [companyName, setCompanyName] = useState("");

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    setLoading(true);

    try {
      // ✅ Signup
      const { error: signUpErr } = await supabase.auth.signUp({
        email,
        password,
        options: {
          // بعد ما يضغط رابط التأكيد، يرجع هنا
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      });
      if (signUpErr) throw signUpErr;

      // ✅ هل فيه session الآن؟ (إذا Email confirmation OFF غالباً نعم)
      const { data: s1, error: sErr } = await supabase.auth.getSession();
      if (sErr) throw sErr;

      const session = s1.session;

      // ✅ إذا ما في session -> Email confirmation ON غالباً
      if (!session) {
        // نخزن اسم الشركة مؤقتًا
        localStorage.setItem("pending_company_name", companyName);

        router.push(
          `/check-email?email=${encodeURIComponent(email)}`
        );
        return;
      }

      // ✅ إذا فيه session -> ننشئ الشركة فوراً
      const { error: rpcErr } = await supabase.rpc("create_company_with_owner", {
        company_name: companyName,
      });
      if (rpcErr) throw rpcErr;

      router.push("/dashboard");
    } catch (e: any) {
      setErr(e?.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-6">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-md bg-slate-900/60 border border-slate-800 rounded-2xl p-6"
      >
        <h1 className="text-2xl font-semibold">Create your company</h1>
        <p className="text-slate-300 mt-2">
          Start a free trial and invite your team later.
        </p>

        {err && (
          <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-red-200">
            {err}
          </div>
        )}

        <div className="mt-5 space-y-3">
          <input
            className="w-full rounded-xl bg-slate-950 border border-slate-800 p-3"
            placeholder="Company name"
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            required
          />

          <input
            className="w-full rounded-xl bg-slate-950 border border-slate-800 p-3"
            placeholder="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />

          <input
            className="w-full rounded-xl bg-slate-950 border border-slate-800 p-3"
            placeholder="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />

          <button
            disabled={loading}
            className="w-full rounded-xl bg-sky-500/15 border border-sky-500/25 text-sky-300 py-3 disabled:opacity-60"
          >
            {loading ? "Creating..." : "Create Company"}
          </button>
        </div>

        <div className="mt-4 text-sm text-slate-400">
          Already have an account?{" "}
          <a className="text-sky-300 underline" href="/login">
            Login
          </a>
        </div>
      </form>
    </div>
  );
}
