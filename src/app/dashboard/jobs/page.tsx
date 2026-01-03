"use client";

import { useEffect, useMemo, useState } from "react";
import { useLang } from "@/app/providers";
import {
  Worker,
  withBufferHours,
  computeJobsSchedule,
  addWorkHours,
  normalizeWorkerKey,
  makeFallbackWorker,
  fmtYMD,
} from "../../../lib/schedule";

type JobStatus = "planned" | "active" | "done";

type Step = {
  id: string;
  templateId: string;
  templateName: string;
  hours: number;
  workerName: string;
  order: number; // 1,2,3...
};

type Job = {
  id: string;
  name: string;

  jobNumber?: string;
  jobAddress?: string;

  dueDate: string; // yyyy-mm-dd
  locked: boolean;
  totalHours: number; // kept for compatibility
  status: JobStatus;

  createdAt: string; // yyyy-mm-dd
  createdAtTs?: number;
  seq?: number;

  doneAt?: string; // yyyy-mm-dd (set when Finish clicked)
  steps: Step[];
};

type StepTemplate = { id: string; name: string; splitSlots?: number };

const JOBS_KEY = "zrschedule_jobs_v3";
const TEMPLATES_KEY = "zrschedule_step_templates_v1";
const WORKERS_KEY = "zr_workers_v2";

// ---------------- helpers ----------------
function uid() {
  return Math.random().toString(36).slice(2, 10);
}
function toNumber(v: unknown) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}
function todayYMD() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}
function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
function addDays(d: Date, days: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
}

function loadTemplates(): StepTemplate[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(TEMPLATES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((s: any) => ({
        id: String(s.id),
        name: String(s.name ?? ""),
        splitSlots: clamp(toNumber(s.splitSlots ?? 1), 1, 5),
      }))
      .filter((x) => x.name.trim().length > 0);
  } catch {
    return [];
  }
}

function loadJobs(): Job[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(JOBS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed.map((j: any) => ({
      id: String(j.id ?? uid()),
      name: String(j.name ?? ""),

      jobNumber: j.jobNumber != null ? String(j.jobNumber) : "",
      jobAddress: j.jobAddress != null ? String(j.jobAddress) : "",

      dueDate: String(j.dueDate ?? ""),
      locked: Boolean(j.locked ?? false),
      totalHours: clamp(toNumber(j.totalHours), 0, 100000),
      status:
        j.status === "active" || j.status === "done" || j.status === "planned"
          ? j.status
          : "planned",
      createdAt: String(j.createdAt ?? todayYMD()),
      createdAtTs: toNumber(j.createdAtTs ?? 0) || Date.now(),
      seq: toNumber(j.seq ?? 0) || 0,

      doneAt: typeof j.doneAt === "string" ? j.doneAt : "",

      steps: Array.isArray(j.steps)
        ? j.steps.map((s: any) => ({
            id: String(s.id ?? uid()),
            templateId: String(s.templateId ?? ""),
            templateName: String(s.templateName ?? ""),
            hours: clamp(toNumber(s.hours), 0, 100000),
            workerName: String(s.workerName ?? ""),
            order: clamp(toNumber(s.order), 1, 999999),
          }))
        : [],
    }));
  } catch {
    return [];
  }
}

function saveJobs(jobs: Job[]) {
  try {
    localStorage.setItem(JOBS_KEY, JSON.stringify(jobs));
  } catch {}
}

function loadWorkers(): Worker[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(WORKERS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as Worker[];
  } catch {
    return [];
  }
}

// ✅ Days needed based on worker weekly template (work days)
function avgDailyHoursFromTemplate(w: Worker) {
  const days = Object.keys(w.template.days) as (keyof typeof w.template.days)[];
  let onCount = 0;
  let hoursSum = 0;

  for (const d of days) {
    const isOn = Boolean(w.template.days[d]);
    const h = Number(w.template.hours[d] ?? 0);
    if (isOn && h > 0) {
      onCount += 1;
      hoursSum += h;
    }
  }

  if (onCount === 0) return 8;
  return hoursSum / onCount;
}

function ceilDiv(a: number, b: number) {
  if (b <= 0) return 0;
  return Math.ceil(a / b);
}

// ---------------- UI ----------------
export default function JobsPage() {
  const { t } = useLang();

  const [jobs, setJobs] = useState<Job[]>([]);
  const [templates, setTemplates] = useState<StepTemplate[]>([]);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [hydrated, setHydrated] = useState(false);

  // ✅ Accordion open/close per job
  const [openJobs, setOpenJobs] = useState<Record<string, boolean>>({});
  const isOpen = (id: string) => openJobs[id] ?? false;
  const toggleOpen = (id: string) =>
    setOpenJobs((p) => ({ ...p, [id]: !(p[id] ?? false) }));
  const closeAll = () => setOpenJobs({});
  const openAll = (list: Job[]) => {
    const all: Record<string, boolean> = {};
    list.forEach((j) => (all[j.id] = true));
    setOpenJobs(all);
  };

  // Create job form
  const [jobName, setJobName] = useState("");
  const [jobDueDate, setJobDueDate] = useState("");
  const [jobNumber, setJobNumber] = useState("");
  const [jobAddress, setJobAddress] = useState("");

  // Draft per job (step add panel)
  const [draft, setDraft] = useState<
    Record<
      string,
      {
        templateId: string;
        hours: number;
        workerSelect: string;
        workerOther: string;
      }
    >
  >({});

  const getDraft = (jobId: string) =>
    draft[jobId] ?? { templateId: "", hours: 1, workerSelect: "", workerOther: "" };

  const patchDraft = (
    jobId: string,
    patch: Partial<{
      templateId: string;
      hours: number;
      workerSelect: string;
      workerOther: string;
    }>
  ) => {
    setDraft((p) => ({ ...p, [jobId]: { ...getDraft(jobId), ...patch } }));
  };

  // Load
  useEffect(() => {
    setTemplates(loadTemplates());
    setJobs(loadJobs());
    setWorkers(loadWorkers());
    setHydrated(true);
  }, []);

  // Refresh on focus
  useEffect(() => {
    const onFocus = () => {
      setTemplates(loadTemplates());
      setWorkers(loadWorkers());
      setJobs(loadJobs());
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  // Autosave
  useEffect(() => {
    if (!hydrated) return;
    saveJobs(jobs);
  }, [jobs, hydrated]);

  // ---------- computed schedule ----------
  const schedule = useMemo(() => computeJobsSchedule(jobs, workers), [jobs, workers]);

  // ✅ Sort jobs by Estimated finish (Base) ASC
  const sortedJobs = useMemo(() => {
    const copy = [...jobs];

    const keyTime = (j: Job) => {
      const d = schedule.jobFinish.get(j.id);
      return d ? startOfDay(d).getTime() : Number.POSITIVE_INFINITY;
    };

    const dueTime = (j: Job) => {
      if (!j.dueDate) return Number.POSITIVE_INFINITY;
      const [y, m, d] = j.dueDate.split("-").map((x) => Number(x));
      if (!y || !m || !d) return Number.POSITIVE_INFINITY;
      return new Date(y, m - 1, d).getTime();
    };

    copy.sort((a, b) => {
      const af = keyTime(a);
      const bf = keyTime(b);
      if (af !== bf) return af - bf;

      const ad = dueTime(a);
      const bd = dueTime(b);
      if (ad !== bd) return ad - bd;

      const as = toNumber(a.seq ?? 0);
      const bs = toNumber(b.seq ?? 0);
      if (as !== bs) return as - bs;

      const at = toNumber(a.createdAtTs ?? 0);
      const bt = toNumber(b.createdAtTs ?? 0);
      return at - bt;
    });

    return copy;
  }, [jobs, schedule.jobFinish]);

  const stepsHoursAllJobs = useMemo(() => {
    return jobs.reduce((acc, j) => acc + j.steps.reduce((a, s) => a + (s.hours || 0), 0), 0);
  }, [jobs]);

  const jobStepsTotal = (job: Job) => job.steps.reduce((a, s) => a + (s.hours || 0), 0);

  const jobFinishText = (jobId: string) => {
    const d = schedule.jobFinish.get(jobId);
    return d ? fmtYMD(d) : "—";
  };

  // ✅ Safe +10% starts from NEXT day after base finish
  const jobFinishSafeText = (job: Job) => {
    const baseFinish = schedule.jobFinish.get(job.id);
    if (!baseFinish) return "—";

    const total = jobStepsTotal(job);
    const safeTotal = withBufferHours(total, 0.1);
    const extra = Math.max(0, safeTotal - total);
    if (extra <= 0) return fmtYMD(baseFinish);

    const lastWorkerKey = schedule.jobLastStepWorker.get(job.id) || "";
    const workerMap = new Map(workers.map((w) => [normalizeWorkerKey(w.name), w]));
    const lastWorker =
      workerMap.get(lastWorkerKey) ??
      makeFallbackWorker(job.steps[job.steps.length - 1]?.workerName || "Worker");

    const startNext = startOfDay(addDays(baseFinish, 1));
    const safeFinish = addWorkHours({ startDate: startNext, totalHours: extra, worker: lastWorker });
    return fmtYMD(safeFinish);
  };

  // ✅ Days needed respects template splitSlots (1..5)
  const jobDaysNeeded = (job: Job) => {
    if (!job.steps?.length) return 0;

    const workerMap = new Map(workers.map((w) => [normalizeWorkerKey(w.name), w]));
    const templateMap = new Map(
      templates.map((t) => [t.id, clamp(toNumber(t.splitSlots ?? 1), 1, 5)])
    );

    let totalDays = 0;
    const stepsSorted = [...job.steps].sort((a, b) => a.order - b.order);

    for (const s of stepsSorted) {
      const key = normalizeWorkerKey(s.workerName);
      const w = workerMap.get(key) ?? makeFallbackWorker(s.workerName || "Worker");
      const daily = avgDailyHoursFromTemplate(w);

      const split = templateMap.get(s.templateId) ?? 1;
      const effectiveHours = Number(s.hours || 0) * split;

      totalDays += ceilDiv(effectiveHours, daily);
    }

    return totalDays;
  };

  // ---------- actions ----------
  const addJob = () => {
    const name = jobName.trim();
    if (!name) return alert("Job name required");

    const maxSeq = jobs.reduce((mx, j) => Math.max(mx, toNumber(j.seq ?? 0)), 0);
    const j: Job = {
      id: uid(),
      name,
      jobNumber: jobNumber.trim(),
      jobAddress: jobAddress.trim(),
      dueDate: jobDueDate,
      locked: false,
      totalHours: 0,
      status: "planned",
      createdAt: todayYMD(),
      createdAtTs: Date.now(),
      seq: maxSeq + 1,
      steps: [],
      doneAt: "",
    };

    setJobs((p) => [j, ...p]);
    setOpenJobs((p) => ({ ...p, [j.id]: true }));

    setJobName("");
    setJobDueDate("");
    setJobNumber("");
    setJobAddress("");
  };

  const deleteJob = (jobId: string) => setJobs((p) => p.filter((j) => j.id !== jobId));

  const setJobStatus = (jobId: string, status: JobStatus) => {
    setJobs((p) =>
      p.map((j) => {
        if (j.id !== jobId) return j;
        if (status === "done") return { ...j, status, doneAt: todayYMD() };
        return { ...j, status, doneAt: "" };
      })
    );
  };

  const setJobDueDateInline = (jobId: string, dueDate: string) => {
    setJobs((p) =>
      p.map((j) => {
        if (j.id !== jobId) return j;
        const next = { ...j, dueDate };
        if (!dueDate) next.locked = false;
        return next;
      })
    );
  };

  const setJobLocked = (jobId: string, locked: boolean) => {
    setJobs((p) =>
      p.map((j) => {
        if (j.id !== jobId) return j;
        if (!j.dueDate) return { ...j, locked: false };
        return { ...j, locked };
      })
    );
  };

  const removeStep = (jobId: string, stepId: string) => {
    setJobs((p) =>
      p.map((j) => (j.id === jobId ? { ...j, steps: j.steps.filter((s) => s.id !== stepId) } : j))
    );
  };

  const addStep = (jobId: string) => {
    const d = getDraft(jobId);
    const tpl = templates.find((x) => x.id === d.templateId);
    if (!tpl) return alert("Choose template");

    const hours = clamp(toNumber(d.hours), 0, 100000);
    if (hours <= 0) return alert(`${t("step_hours")} must be > 0`);

    let worker = "";
    if (d.workerSelect === "__other__") worker = d.workerOther.trim();
    else worker = d.workerSelect.trim();
    if (!worker) return alert(`${t("step_worker")} is required`);

    setJobs((p) =>
      p.map((j) => {
        if (j.id !== jobId) return j;
        const nextOrder = (j.steps.reduce((mx, s) => Math.max(mx, s.order), 0) || 0) + 1;

        const step: Step = {
          id: uid(),
          templateId: tpl.id,
          templateName: tpl.name,
          workerName: worker,
          hours,
          order: nextOrder,
        };
        return { ...j, steps: [...j.steps, step] };
      })
    );

    patchDraft(jobId, { templateId: "", hours: 1, workerSelect: "", workerOther: "" });
  };

  const statusLabel = (s: JobStatus) => {
    if (s === "active") return t("status_active");
    if (s === "done") return t("status_done");
    return t("status_planned");
  };

  const statusPill = (s: JobStatus) => {
    if (s === "done") return "border-emerald-500/30 bg-emerald-500/10 text-emerald-200";
    if (s === "active") return "border-amber-500/30 bg-amber-500/10 text-amber-200";
    return "border-zinc-700 bg-zinc-900/40 text-zinc-200";
  };

  const workerWorkload = useMemo(() => {
    const map = new Map<
      string,
      { name: string; items: { jobName: string; stepName: string; hours: number; order: number }[] }
    >();

    for (const job of jobs) {
      for (const s of job.steps) {
        const key = normalizeWorkerKey(s.workerName);
        const prev = map.get(key) ?? { name: s.workerName.trim() || "Unknown", items: [] };
        prev.items.push({ jobName: job.name, stepName: s.templateName, hours: s.hours, order: s.order });
        map.set(key, prev);
      }
    }

    const arr = Array.from(map.values()).map((w) => ({
      ...w,
      items: w.items.sort((a, b) => a.jobName.localeCompare(b.jobName) || a.order - b.order),
      totalHours: w.items.reduce((acc, x) => acc + (x.hours || 0), 0),
    }));

    arr.sort((a, b) => a.name.localeCompare(b.name));
    return arr;
  }, [jobs]);

  const workerNames = useMemo(() => {
    const names = workers.map((w) => (w.name || "").trim()).filter(Boolean);
    names.sort((a, b) => a.localeCompare(b));
    return names;
  }, [workers]);

  return (
    <div className="min-h-screen text-zinc-100">
      {/* ✅ Background stays BLACK */}
      <div className="min-h-screen bg-gradient-to-b from-zinc-950 via-zinc-950 to-zinc-900/80">
        <div className="mx-auto max-w-6xl px-4 py-6 space-y-6">
          {/* Header */}
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <h1 className="text-2xl font-extrabold tracking-tight">
                {t("jobs_title")}
                <span className="ml-2 text-sm font-semibold text-violet-200/80">• ZRSchedule</span>
              </h1>
              <p className="mt-1 text-sm text-zinc-400">{t("jobs_subtitle")}</p>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => openAll(sortedJobs)}
                className="rounded-xl border border-zinc-800 bg-zinc-950/40 px-3 py-2 text-sm font-semibold hover:bg-zinc-900"
              >
                Open all
              </button>
              <button
                onClick={closeAll}
                className="rounded-xl border border-zinc-800 bg-zinc-950/40 px-3 py-2 text-sm font-semibold hover:bg-zinc-900"
              >
                Close all
              </button>
              <div className="rounded-xl border border-violet-500/25 bg-violet-500/10 px-3 py-2 text-sm text-violet-200">
                Total steps hours: <b>{stepsHoursAllJobs.toFixed(1)}h</b>
              </div>
            </div>
          </div>

          {/* ✅ BLUE AREA + BLACK TEXT */}
          <div className="zr-blue-panel rounded-2xl p-4">
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm font-bold">{t("workers_workload_title")}</div>
              <div className="text-xs opacity-70">Tip: keep worker names consistent</div>
            </div>

            {workerWorkload.length === 0 ? (
              <div className="mt-2 text-sm opacity-70">{t("workers_workload_empty")}</div>
            ) : (
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                {workerWorkload.map((w) => (
                  <div key={w.name} className="rounded-2xl border border-black/10 bg-white/10 p-3">
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-semibold">{w.name}</div>
                      <div className="text-xs opacity-70">{w.totalHours.toFixed(1)}h</div>
                    </div>

                    <div className="mt-2 space-y-2">
                      {w.items.map((it, idx) => (
                        <div key={idx} className="rounded-xl border border-black/10 bg-white/10 px-3 py-2 text-sm">
                          <div className="font-semibold">{it.jobName}</div>
                          <div className="text-xs opacity-70">
                            {it.order}. {it.stepName} • {it.hours}h
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="mt-2 text-[11px] opacity-70">
                      If finish looks wrong, make sure this worker exists in Workers page (same name).
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ✅ BLUE AREA + BLACK TEXT */}
          <div className="zr-blue-panel rounded-2xl p-4">
            <div className="grid gap-3 md:grid-cols-3">
              <div className="md:col-span-2">
                <label className="text-xs font-semibold opacity-80">{t("job_name")}</label>
                <input
                  value={jobName}
                  onChange={(e) => setJobName(e.target.value)}
                  className="mt-1 w-full rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-violet-300"
                  placeholder={t("job_name_placeholder")}
                />
              </div>

              <div>
                <label className="text-xs font-semibold opacity-80">{t("due_date")}</label>
                <input
                  type="date"
                  value={jobDueDate}
                  onChange={(e) => setJobDueDate(e.target.value)}
                  className="mt-1 w-full rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-violet-300"
                />
              </div>
            </div>

            <div className="mt-3 grid gap-3 md:grid-cols-4">
              <div className="md:col-span-1">
                <label className="text-xs font-semibold opacity-80">{t("job_number")}</label>
                <input
                  value={jobNumber}
                  onChange={(e) => setJobNumber(e.target.value)}
                  className="mt-1 w-full rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-violet-300"
                  placeholder={t("job_number_placeholder")}
                />
              </div>

              <div className="md:col-span-3">
                <label className="text-xs font-semibold opacity-80">{t("job_address")}</label>
                <input
                  value={jobAddress}
                  onChange={(e) => setJobAddress(e.target.value)}
                  className="mt-1 w-full rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-violet-300"
                  placeholder={t("job_address_placeholder")}
                />
              </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                onClick={addJob}
                className="rounded-xl bg-violet-300 px-4 py-2 text-sm font-bold text-black hover:bg-violet-400"
              >
                {t("add_job")}
              </button>

              <div className="ml-auto text-xs opacity-70">Sorted by earliest finish • Accordion view</div>
            </div>
          </div>

          {/* List */}
          <div className="space-y-4">
            {sortedJobs.length === 0 ? (
              <div className="rounded-2xl border border-zinc-800 bg-zinc-950/40 p-6 text-sm text-zinc-400">
                {t("empty_jobs")}
              </div>
            ) : (
              sortedJobs.map((j) => {
                const d = getDraft(j.id);

                return (
                  // ✅ BLUE AREA + BLACK TEXT (job header + details)
                  <div key={j.id} className="zr-blue-panel rounded-2xl p-4">
                    {/* Top row */}
                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="text-lg font-extrabold truncate">{j.name}</div>

                          {/* ✅ status pills keep their colors */}
                          <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${statusPill(j.status)}`}>
                            {statusLabel(j.status)}
                          </span>

                          {j.status === "done" && j.doneAt ? (
                            <span className="rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-200">
                              Done: {j.doneAt}
                            </span>
                          ) : null}

                          <span className="rounded-full border border-black/10 bg-white/10 px-2 py-0.5 text-xs">
                            Steps: {jobStepsTotal(j).toFixed(1)}h
                          </span>

                          <span className="rounded-full border border-black/10 bg-white/10 px-2 py-0.5 text-xs">
                            Finish: {jobFinishText(j.id)}
                          </span>

                          <span className="rounded-full border border-violet-500/25 bg-violet-500/10 px-2 py-0.5 text-xs text-violet-200">
                            Safe +10%: {jobFinishSafeText(j)}
                          </span>

                          <span className="rounded-full border border-black/10 bg-white/10 px-2 py-0.5 text-xs">
                            Days: {jobDaysNeeded(j)}
                          </span>

                          <span className="rounded-full border border-black/10 bg-white/10 px-2 py-0.5 text-xs">
                            Due: {j.dueDate || "—"}
                          </span>

                          <span className="rounded-full border border-black/10 bg-white/10 px-2 py-0.5 text-xs">
                            {j.locked ? "Locked" : "Not locked"}
                          </span>

                          {j.jobNumber ? (
                            <span className="rounded-full border border-black/10 bg-white/10 px-2 py-0.5 text-xs">
                              #{j.jobNumber}
                            </span>
                          ) : null}

                          {j.jobAddress ? (
                            <span className="rounded-full border border-black/10 bg-white/10 px-2 py-0.5 text-xs">
                              {j.jobAddress}
                            </span>
                          ) : null}
                        </div>
                      </div>

                      {/* Actions (stay same colors) */}
                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={() => toggleOpen(j.id)}
                          className="rounded-xl border border-zinc-800 bg-zinc-770/20 px-3 py-2 text-sm font-semibold hover:bg-zinc-900"
                        >
                          {isOpen(j.id) ? "Close" : "Open"}
                        </button>

                        <button
                          onClick={() => setJobStatus(j.id, "active")}
                          className="rounded-xl border border-zinc-800 bg-zinc-850/00 px-3 py-2 text-sm font-semibold hover:bg-zinc-900"
                        >
                          {t("start")}
                        </button>

                        <button
                            onClick={() => setJobStatus(j.id, "done")}
                          className="rounded-xl border border-emerald-500/25 bg-emerald-500/70 px-3 py-2 text-sm font-semibold text-emerald-200 hover:bg-emerald-500/15"
                        >
                          {t("finish")}
                        </button>

                        <button
                          onClick={() => deleteJob(j.id)}
                          className="rounded-xl border border-red-500/25 bg-red-500/70 px-3 py-2 text-sm font-semibold text-red-200 hover:bg-red-500/15"
                        >
                          {t("delete")}
                        </button>
                      </div>
                    </div>

                    {/* Details (Accordion) */}
                    {isOpen(j.id) ? (
                      <>
                        {/* Job controls */}
                        <div className="mt-4 rounded-2xl border border-black/10 bg-white/10 p-3">
                          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                            <div className="flex items-center gap-2">
                              <label className="text-xs font-semibold opacity-80">{t("due_date")}</label>
                              <input
                                type="date"
                                value={j.dueDate}
                                onChange={(e) => setJobDueDateInline(j.id, e.target.value)}
                                className="rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-violet-300"
                              />
                            </div>

                            <label className="flex items-center gap-2 text-sm">
                              <input
                                type="checkbox"
                                checked={Boolean(j.locked)}
                                disabled={!j.dueDate}
                                onChange={(e) => setJobLocked(j.id, e.target.checked)}
                              />
                              Locked (must finish by due date)
                              {!j.dueDate ? <span className="text-xs opacity-70">(set due date first)</span> : null}
                            </label>
                          </div>
                        </div>

                        {/* Steps + Add step */}
                        <div className="mt-4 grid gap-3 lg:grid-cols-3">
                          {/* Steps list */}
                          <div className="lg:col-span-2 rounded-2xl border border-black/10 bg-white/10 p-3">
                            <div className="flex items-center justify-between">
                              <div className="text-sm font-bold">{t("steps")}</div>
                              <div className="text-xs opacity-70">Auto order</div>
                            </div>

                            {j.steps.length === 0 ? (
                              <div className="mt-3 text-sm opacity-70">No steps yet</div>
                            ) : (
                              <div className="mt-3 space-y-2">
                                {[...j.steps]
                                  .sort((a, b) => a.order - b.order)
                                  .map((s) => (
                                    <div
                                      key={s.id}
                                      className="flex items-center justify-between gap-2 rounded-xl border border-black/10 bg-white/10 px-3 py-2"
                                    >
                                      <div className="min-w-0">
                                        <div className="font-semibold">
                                          {s.order}. {s.templateName}{" "}
                                          <span className="text-xs opacity-70">({s.hours}h)</span>
                                        </div>
                                        <div className="text-xs opacity-70">
                                          {t("step_worker")}:{" "}
                                          <span className="font-semibold">{s.workerName}</span>
                                        </div>
                                      </div>

                                      <button
                                        onClick={() => removeStep(j.id, s.id)}
                                        className="shrink-0 rounded-lg border border-zinc-800 bg-zinc-950/120 px-2 py-1 text-xs hover:bg-zinc-900"
                                      >
                                        {t("remove")}
                                      </button>
                                    </div>
                                  ))}
                              </div>
                            )}
                          </div>

                          {/* Add step panel */}
                          <div className="rounded-2xl border border-black/10 bg-white/10 p-3">
                            <div className="text-sm font-bold mb-2">{t("add_step")}</div>

                            <div className="space-y-2">
                              <div>
                                <label className="text-xs font-semibold opacity-80">Template</label>
                                <select
                                  value={d.templateId}
                                  onChange={(e) => patchDraft(j.id, { templateId: e.target.value })}
                                  className="mt-1 w-full rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-violet-300"
                                >
                                  <option value="">-- select step --</option>
                                  {templates.map((x) => (
                                    <option key={x.id} value={x.id}>
                                      {x.name}
                                    </option>
                                  ))}
                                </select>
                              </div>

                              <div>
                                <label className="text-xs font-semibold opacity-80">{t("step_hours")}</label>
                                <input
                                  type="number"
                                  min={0}
                                  value={d.hours}
                                  onChange={(e) => patchDraft(j.id, { hours: toNumber(e.target.value) })}
                                  className="mt-1 w-full rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-violet-300"
                                />
                              </div>

                              <div>
                                <label className="text-xs font-semibold opacity-80">{t("step_worker")}</label>
                                <select
                                  value={d.workerSelect}
                                  onChange={(e) => patchDraft(j.id, { workerSelect: e.target.value })}
                                  className="mt-1 w-full rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-violet-300"
                                >
                                  <option value="">-- select worker --</option>
                                  {workerNames.map((name) => (
                                    <option key={name} value={name}>
                                      {name}
                                    </option>
                                  ))}
                                  <option value="__other__">Other…</option>
                                </select>

                                {d.workerSelect === "__other__" ? (
                                  <input
                                    value={d.workerOther}
                                    onChange={(e) => patchDraft(j.id, { workerOther: e.target.value })}
                                    className="mt-2 w-full rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-violet-300"
                                    placeholder={t("step_worker_placeholder")}
                                  />
                                ) : null}
                              </div>

                              <button
                                onClick={() => addStep(j.id)}
                                className="mt-2 w-full rounded-xl bg-violet-300 px-3 py-2 text-sm font-bold text-black hover:bg-violet-400"
                              >
                                + Add Step
                              </button>
                            </div>

                            <div className="mt-4 space-y-2 text-sm">
                              <div className="flex items-center justify-between rounded-xl border border-black/10 bg-white/10 px-3 py-2">
                                <span className="opacity-70">{t("days_needed")}</span>
                                <span className="font-semibold">{jobDaysNeeded(j)}</span>
                              </div>

                              <div className="flex items-center justify-between rounded-xl border border-black/10 bg-white/10 px-3 py-2">
                                <span className="opacity-70">{t("estimated_finish")}</span>
                                <span className="font-semibold">{jobFinishText(j.id)}</span>
                              </div>

                              <div className="flex items-center justify-between rounded-xl border border-violet-500/25 bg-violet-500/10 px-3 py-2">
                                <span className="text-violet-200/10">Safe +10%</span>
                                <span className="font-semibold text-violet-200">{jobFinishSafeText(j)}</span>
                              </div>

                              <div className="rounded-xl border border-black/10 bg-white/10 p-2 text-xs opacity-70">
                                Uses Workers weekly template. Days needed respects Step splitSlots (1..5).
                              </div>
                            </div>
                          </div>
                        </div>
                      </>
                    ) : null}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
