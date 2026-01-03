"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import LogoutButton from "./LogoutButton";

const JOBS_KEY = "zrschedule_jobs_v3";
const WORKERS_KEY = "zr_workers_v2";

type JobStatus = "planned" | "active" | "done";

type Step = {
  id: string;
  templateId: string;
  templateName: string;
  hours: number;
  workerName: string;
  order: number;
};

type Job = {
  id: string;
  name: string;
  dueDate?: string; // yyyy-mm-dd or ""
  status: JobStatus;
  createdAt?: string;
  createdAtTs?: number;
  seq?: number;
  steps?: Step[];
  doneAt?: string; // yyyy-mm-dd
};

type DayKey = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";

type WeeklyTemplate = {
  days: Record<DayKey, boolean>;
  hours: Record<DayKey, number>;
};

type Absence = { id: string; date: string; reason?: string };

type Worker = {
  id: string;
  name: string;
  template: WeeklyTemplate;
  absences: Absence[];
};

function loadJSON<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function pct(n: number) {
  return `${Math.round(n * 100)}%`;
}

function isYmd(s?: string) {
  return !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

export default function DashboardPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const j = loadJSON<Job[]>(JOBS_KEY, []);
    const w = loadJSON<Worker[]>(WORKERS_KEY, []);
    setJobs(Array.isArray(j) ? j : []);
    setWorkers(Array.isArray(w) ? w : []);
    setHydrated(true);

    const onFocus = () => {
      const jj = loadJSON<Job[]>(JOBS_KEY, []);
      const ww = loadJSON<Worker[]>(WORKERS_KEY, []);
      setJobs(Array.isArray(jj) ? jj : []);
      setWorkers(Array.isArray(ww) ? ww : []);
    };

    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  const jobsCount = jobs.length;
  const workersCount = workers.length;

  const activeCount = useMemo(() => {
    return jobs.filter((j) => j?.status === "active").length;
  }, [jobs]);

  const onTime = useMemo(() => {
    const done = jobs.filter((j) => j?.status === "done");
    if (done.length === 0) return null;

    const hasAnyDoneAt = done.some((j) => isYmd(j.doneAt));
    if (!hasAnyDoneAt) return null;

    const eligible = done.filter((j) => isYmd(j.doneAt) && isYmd(j.dueDate));
    if (eligible.length === 0) return null;

    let ok = 0;
    for (const j of eligible) {
      if (!j.doneAt || !j.dueDate) continue;
      if (j.doneAt <= j.dueDate) ok++;
    }
    return ok / eligible.length;
  }, [jobs]);

  const nextText = useMemo(() => {
    if (!hydrated) return "Loading...";
    if (jobsCount === 0) return "Next: Create your first Job.";
    if (workersCount === 0) return "Next: Add Workers to your team.";
    if (activeCount === 0) return "Next: Start a job (Active) then open Schedule.";
    return "Next: Open Schedule and review finish dates.";
  }, [hydrated, jobsCount, workersCount, activeCount]);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold">Dashboard</h1>
          <p className="text-sm text-zinc-400">ZRSchedule</p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/dashboard/jobs"
            className="rounded-lg border border-zinc-800 bg-zinc-900/30 px-3 py-2 text-sm font-semibold text-zinc-100 hover:bg-zinc-900/50"
          >
            Jobs
          </Link>

          <Link
            href="/dashboard/workers"
            className="rounded-lg border border-zinc-800 bg-zinc-900/30 px-3 py-2 text-sm font-semibold text-zinc-100 hover:bg-zinc-900/50"
          >
            Workers
          </Link>

          <Link
            href="/dashboard/schedule"
            className="rounded-lg border border-zinc-800 bg-zinc-900/30 px-3 py-2 text-sm font-semibold text-zinc-100 hover:bg-zinc-900/50"
          >
            Schedule
          </Link>

          <LogoutButton />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/30 p-4">
          <div className="text-sm text-zinc-400">Jobs</div>
          <div className="mt-2 text-3xl font-extrabold">{jobsCount}</div>
          <div className="mt-2 text-xs text-zinc-500">Create your first job</div>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/30 p-4">
          <div className="text-sm text-zinc-400">Workers</div>
          <div className="mt-2 text-3xl font-extrabold">{workersCount}</div>
          <div className="mt-2 text-xs text-zinc-500">Add your team</div>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/30 p-4">
          <div className="text-sm text-zinc-400">Active</div>
          <div className="mt-2 text-3xl font-extrabold">{activeCount}</div>
          <div className="mt-2 text-xs text-zinc-500">In progress</div>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/30 p-4">
          <div className="text-sm text-zinc-400">On-time %</div>
          <div className="mt-2 text-3xl font-extrabold">
            {onTime == null ? "—" : pct(clamp(onTime, 0, 1))}
          </div>
          <div className="mt-2 text-xs text-zinc-500">Coming soon (Step 2)</div>
        </div>
      </div>

      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/30 p-4 text-sm text-zinc-200">
        {nextText}
      </div>
    </div>
  );
}
