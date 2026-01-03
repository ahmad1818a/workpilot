"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function OnboardingCompanyPage() {
  const router = useRouter();
  const params = useSearchParams();

  const [companyName, setCompanyName] = useState("");
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [err, setErr] = useState<string>("");

  // ✅ إذا المستخدم أصلاً عنده membership، لا تخلّيه يقعد هنا
  useEffect(() => {
    const run = async () => {
      setErr("");
      const supabase = createClient();

      const { data: userRes, error: userErr } = await supabase.auth.getUser();
      if (userErr) {
        setErr(userErr.message);
        setChecking(false);
        return;
      }
      if (!userRes.user) {
        router.replace("/login?next=/onboarding/company");
        return;
      }

      const { data: membership, error: memErr } = await supabase
        .from("memberships")
        .select("company_id")
        .eq("user_id", userRes.user.id)
        .maybeSingle();

      // لو policy تمنع select، يظهر خطأ هنا
      if (memErr) {
        // نكمّل عادي ونخلي المستخدم ينشئ شركة (بس نعرض الخطأ لو حاب)
        // setErr(memErr.message);
      }

      if (membership?.company_id) {
        router.replace("/dashboard");
        return;
      }

      setChecking(false);
    };

    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onCreateCompany = async () => {
    const name = companyName.trim();
    if (!name) return;

    setLoading(true);
    setErr("");

    try {
      const supabase = createClient();

      const { data: userRes, error: userErr } = await supabase.auth.getUser();
      if (userErr) throw userErr;
      if (!userRes.user) {
        router.replace("/login?next=/onboarding/company");
        return;
      }

      const user = userRes.user;

      // 1) إنشاء شركة
      const { data: company, error: cErr } = await supabase
        .from("companies")
        .insert({ name })
        .select("id,name")
        .single();

      if (cErr) throw cErr;

      // 2) ربط المستخدم بالشركة كـ owner
      const { error: mErr } = await supabase.from("memberships").insert({
        user_id: user.id,
        company_id: company.id,
        role: "owner",
      });

      if (mErr) throw mErr;

      // 3) روح للداشبورد (أو next لو موجود)
      const next = params.get("next") || "/dashboard";
      router.replace(next);
      router.refresh();
    } catch (e: any) {
      setErr(e?.message ?? "Failed to create company");
    } finally {
      setLoading(false);
    }
  };

  if (checking) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-6">
        <div className="text-sm text-slate-300">Checking account…</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-6">
      <div className="w-full max-w-lg rounded-2xl border border-slate-800 bg-slate-900/40 p-5">
        <h1 className="text-xl font-bold">Create your company</h1>
        <p className="text-sm text-slate-300 mt-1">
          Enter your company name to start using ZRSchedule.
        </p>

        {err ? (
          <div className="mt-3 text-sm border border-red-500/30 bg-red-500/10 text-red-200 px-3 py-2 rounded-lg">
            {err}
            <div className="mt-2 text-xs text-red-200/80">
              If you see “permission denied / RLS”, you need an INSERT policy on
              <b> companies</b> + <b>memberships</b>.
            </div>
          </div>
        ) : null}

        <div className="mt-4">
          <label className="text-sm font-semibold">Company name</label>
          <input
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            placeholder="Example: Modern Carpentry Design"
            className="mt-2 w-full px-3 py-2 rounded-lg border border-slate-800 bg-slate-950/40 outline-none"
          />
        </div>

        <button
          onClick={onCreateCompany}
          disabled={loading || !companyName.trim()}
          className={`mt-4 w-full px-3 py-2 rounded-lg border ${
            companyName.trim()
              ? "border-sky-500/30 bg-sky-500/10 text-sky-200 hover:bg-sky-500/20"
              : "border-slate-800 bg-slate-900/30 text-slate-500"
          }`}
        >
          {loading ? "Creating…" : "Create company"}
        </button>

        <div className="mt-3 text-xs text-slate-400">
          This will create a company row and add you as <b>owner</b>.
        </div>
      </div>
    </div>
  );
}
