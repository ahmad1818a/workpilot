"use client";

import Link from "next/link";
import { useLang } from "@/app/providers";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { lang, setLang, t } = useLang();

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="border-b border-zinc-800 bg-zinc-950/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          {/* Logo / Title */}
          <div className="font-extrabold tracking-tight">
            ZRSchedule
            <span className="ml-2 rounded-full bg-sky-500/15 px-2 py-0.5 text-xs font-semibold text-sky-300">
              {t("dashboard")}
            </span>
          </div>

          {/* Navigation + Language */}
          <div className="flex items-center gap-3">
            <nav className="flex items-center gap-2 text-sm">
              <Link
                href="/dashboard"
                className="rounded-md px-3 py-2 hover:bg-zinc-900"
              >
                {t("home")}
              </Link>

              <Link
                href="/dashboard/jobs"
                className="rounded-md px-3 py-2 hover:bg-zinc-900"
              >
                {t("jobs")}
              </Link>

              {/* ✅ NEW: Steps */}
              <Link
                href="/dashboard/steps"
                className="rounded-md px-3 py-2 hover:bg-zinc-900"
              >
                {t("steps")}
              </Link>

              <Link
                href="/dashboard/workers"
                className="rounded-md px-3 py-2 hover:bg-zinc-900"
              >
                {t("workers")}
              </Link>

              <Link
                href="/dashboard/schedule"
                className="rounded-md px-3 py-2 hover:bg-zinc-900"
              >
                {t("schedule")}
              </Link>
            </nav>

            {/* Language switch */}
            <select
              value={lang}
              onChange={(e) => setLang(e.target.value as "en" | "ar")}
              className="rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs outline-none"
            >
              <option value="en">{t("english")}</option>
              <option value="ar">{t("arabic")}</option>
            </select>
          </div>
        </div>
      </header>

      {/* Page content */}
      <main className="mx-auto max-w-6xl px-4 py-6">
        {children}
      </main>
    </div>
  );
}
