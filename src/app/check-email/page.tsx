"use client";

import { useSearchParams } from "next/navigation";

export default function CheckEmailPage() {
  const params = useSearchParams();
  const email = params.get("email") || "";

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-6">
      <div className="w-full max-w-md bg-slate-900/60 border border-slate-800 rounded-2xl p-6">
        <h1 className="text-2xl font-semibold">Check your email</h1>

        <p className="text-slate-300 mt-2">
          We sent a confirmation link to{" "}
          <span className="text-sky-300">{email}</span>.
        </p>

        <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950 p-3 text-slate-300 text-sm">
          بعد ما تضغط رابط التأكيد، راح يتم إنشاء شركتك تلقائيًا وتدخل للـ Dashboard.
        </div>

        <div className="mt-5 text-sm text-slate-400">
          ما وصل الإيميل؟ شيّك Spam/Junk أو جرّب تسجل مرة ثانية.
        </div>

        <div className="mt-5 flex gap-2">
          <a
            href="/login"
            className="inline-block rounded-xl bg-slate-800 border border-slate-700 text-slate-200 px-4 py-2"
          >
            Go to Login
          </a>
          <a
            href="/signup"
            className="inline-block rounded-xl bg-slate-950 border border-slate-800 text-slate-200 px-4 py-2"
          >
            Back to Signup
          </a>
        </div>
      </div>
    </div>
  );
}
