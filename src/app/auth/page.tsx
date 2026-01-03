"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

export default function AuthCallbackPage() {
  const router = useRouter();
  const params = useSearchParams();
  const supabase = createClient();

  const [msg, setMsg] = useState("Signing you in...");

  useEffect(() => {
    const run = async () => {
      try {
        // ✅ Supabase يعطي code في الرابط
        const code = params.get("code");
        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
        }

        // ✅ تأكد session موجود
        const { data: s, error: sErr } = await supabase.auth.getSession();
        if (sErr) throw sErr;

        if (!s.session) {
          setMsg("Not logged in. Redirecting to login...");
          router.replace("/login");
          return;
        }

        // ✅ إذا عندنا اسم شركة مؤقت -> ننشئ الشركة الآن
        const pending = localStorage.getItem("pending_company_name");
        if (pending) {
          setMsg("Creating your company...");
          const { error: rpcErr } = await supabase.rpc("create_company_with_owner", {
            company_name: pending,
          });
          if (rpcErr) throw rpcErr;

          localStorage.removeItem("pending_company_name");
        }

        setMsg("Done. Redirecting...");
        router.replace("/dashboard");
      } catch (e: any) {
        setMsg(e?.message || "Something went wrong");
      }
    };

    run();
  }, [params, router, supabase]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-6">
      <div className="w-full max-w-md bg-slate-900/60 border border-slate-800 rounded-2xl p-6 rounded-2xl">
        <h1 className="text-xl font-semibold">Auth Callback</h1>
        <p className="text-slate-300 mt-2">{msg}</p>
      </div>
    </div>
  );
}
