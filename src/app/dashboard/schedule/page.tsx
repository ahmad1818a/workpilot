"use client";

import { useEffect, useMemo, useState } from "react";

import JobsMap from "./jobs-map";
import {
  withBufferHours,
  computeJobsSchedule,
  fmtYMD,
  parseYMD,
  normalizeWorkerKey,
  addWorkHours,
  makeFallbackWorker,
  Worker,
} from "../../../lib/schedule";

import { exportScheduleToExcel } from "../../../lib/export";
import { listJobs, listWorkers, setJobDone } from "@/lib/db";

type JobStatus = "planned" | "active" | "done";
type JobPriority = "normal" | "high";

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
  jobNumber?: string;
  jobAddress?: string;

  dueDate: string; // yyyy-mm-dd
  totalHours: number;
  status: JobStatus;
  createdAt: string; // yyyy-mm-dd
  steps: Step[];

  priority?: JobPriority;
  lockDueDate?: boolean;

  doneAt?: string; // yyyy-mm-dd
};

// ✅ More Blue theme
const THEME = {
  pageBg: "bg-slate-950",
  pageText: "text-slate-100",
  subtle: "text-slate-300",
  subtle2: "text-slate-400",

  cardBg: "bg-slate-900/60",
  border: "border-slate-800",

  chipBg: "bg-slate-800/40",
  chipBorder: "border-slate-700/50",

  blueText: "text-sky-300",
  blueBg: "bg-sky-500/15",
  blueBorder: "border-sky-500/25",

  doneText: "text-emerald-300",
  doneBg: "bg-emerald-500/15",
  doneBorder: "border-emerald-500/25",

  amberText: "text-amber-200",
  amberBg: "bg-amber-500/15",
  amberBorder: "border-amber-400/30",

  redText: "text-red-300",
  redBg: "bg-red-500/10",
  redBorder: "border-red-500/25",
};

function todayYMD() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function StatusChip({ job }: { job: Job }) {
  if (job.status === "done") {
    return (
      <span
        className={`px-2 py-0.5 rounded-full border ${THEME.doneBorder} ${THEME.doneBg} ${THEME.doneText}`}
      >
        DONE
      </span>
    );
  }
  if (job.status === "active") {
    return (
      <span
        className={`px-2 py-0.5 rounded-full border ${THEME.blueBorder} ${THEME.blueBg} ${THEME.blueText}`}
      >
        ACTIVE
      </span>
    );
  }
  return (
    <span
      className={`px-2 py-0.5 rounded-full border ${THEME.chipBorder} ${THEME.chipBg} text-slate-200`}
    >
      PLANNED
    </span>
  );
}

function monthKeyFromYMD(ymd: string) {
  if (!ymd || ymd.length < 7) return "";
  return ymd.slice(0, 7); // yyyy-mm
}

function monthLabel(ym: string) {
  if (!ym || ym.length < 7) return ym || "—";
  const [y, m] = ym.split("-").map((x) => Number(x));
  const names = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const mm = names[(m || 1) - 1] ?? "Month";
  return `${mm} ${y}`;
}

export default function SchedulePage() {
  const [tab, setTab] = useState<"timeline" | "map">("timeline");
  const [jobs, setJobs] = useState<Job[]>([]);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [selectedJobId, setSelectedJobId] = useState<string>("");

  const [doneMonth, setDoneMonth] = useState<string>("all");
  const [search, setSearch] = useState<string>("");

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const reload = async () => {
    setErr(null);
    setLoading(true);
    try {
      const j = (await listJobs()) as any as Job[];
      const w = (await listWorkers()) as any as Worker[];

      setJobs(j);
      setWorkers(w);

      const firstNotDone = j.find((x) => x.status !== "done")?.id || j[0]?.id || "";
      if (firstNotDone) setSelectedJobId(firstNotDone);
    } catch (e: any) {
      setErr(e?.message ?? "Failed to load schedule data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    reload();
  }, []);

  const schedule = useMemo(() => computeJobsSchedule(jobs as any, workers), [jobs, workers]);

  const workerMap = useMemo(
    () => new Map(workers.map((w) => [normalizeWorkerKey(w.name), w])),
    [workers]
  );

  const jobStepsTotal = (job: Job) => job.steps.reduce((a, s) => a + (s.hours || 0), 0);

  const baseFinishText = (job: Job) => {
    const d = schedule.jobFinish.get(job.id);
    return d ? fmtYMD(d) : "—";
  };

  const safeFinishText = (job: Job) => {
    const baseFinish = schedule.jobFinish.get(job.id);
    if (!baseFinish) return "—";

    const total = jobStepsTotal(job);
    const safeTotal = withBufferHours(total, 0.10);
    const extra = Math.max(0, safeTotal - total);
    if (extra <= 0) return fmtYMD(baseFinish);

    const lastWorkerKey = schedule.jobLastStepWorker.get(job.id) || "";
    const lastStep = [...(job.steps || [])].sort((a, b) => a.order - b.order).slice(-1)[0];
    const fallbackName = lastStep?.workerName || "Worker";
    const worker = workerMap.get(lastWorkerKey) ?? makeFallbackWorker(fallbackName);

    const safeFinish = addWorkHours({ startDate: baseFinish, totalHours: extra, worker });
    return fmtYMD(safeFinish);
  };

  const daysNeeded = (job: Job) => {
    const d = schedule.jobFinish.get(job.id);
    if (!d) return 0;
    const start = parseYMD(todayYMD()).getTime();
    const end = d.getTime();
    return Math.max(0, Math.round((end - start) / (1000 * 60 * 60 * 24)));
  };

  const isLateLocked = (job: Job) => {
    if (!job.lockDueDate) return false;
    if (!job.dueDate) return false;
    const finish = schedule.jobFinish.get(job.id);
    if (!finish) return false;
    return finish.getTime() > parseYMD(job.dueDate).getTime();
  };

  const markDone = async (jobId: string) => {
    await setJobDone(jobId, true);
    await reload();
    setDoneMonth("all");
  };

  const undoDone = async (jobId: string) => {
    await setJobDone(jobId, false);
    await reload();
  };

  const selectedJob = useMemo(
    () => jobs.find((j) => j.id === selectedJobId) ?? null,
    [jobs, selectedJobId]
  );

  // ✅ search: name + number + address
  const matchSearch = (j: Job) => {
    const q = (search || "").trim().toLowerCase();
    if (!q) return true;
    return (
      (j.name || "").toLowerCase().includes(q) ||
      (j.jobNumber || "").toLowerCase().includes(q) ||
      (j.jobAddress || "").toLowerCase().includes(q)
    );
  };

  // DONE list (desc)
  const doneJobs = useMemo(() => {
    const list = jobs.filter((j) => j.status === "done");
    return [...list].sort((a, b) => baseFinishText(b).localeCompare(baseFinishText(a)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobs, schedule]);

  // Done months tabs
  const doneMonths = useMemo(() => {
    const set = new Set<string>();
    for (const j of doneJobs) {
      const finish = baseFinishText(j);
      const mk = monthKeyFromYMD(finish === "—" ? "" : finish);
      if (mk) set.add(mk);
    }
    return Array.from(set).sort((a, b) => b.localeCompare(a));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doneJobs]);

  // Done filtered by month + search
  const doneJobsFiltered = useMemo(() => {
    const base =
      doneMonth === "all"
        ? doneJobs
        : doneJobs.filter((j) => monthKeyFromYMD(baseFinishText(j)) === doneMonth);
    return base.filter(matchSearch);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doneJobs, doneMonth, search]);

  // Active list sorted by EARLIEST finish (asc) + search
  const activeJobs = useMemo(() => {
    const list = jobs.filter((j) => j.status !== "done").filter(matchSearch);

    return [...list].sort((a, b) => {
      const aDate = schedule.jobFinish.get(a.id);
      const bDate = schedule.jobFinish.get(b.id);
      const aKey = aDate ? fmtYMD(aDate) : "9999-12-31";
      const bKey = bDate ? fmtYMD(bDate) : "9999-12-31";
      if (aKey !== bKey) return aKey.localeCompare(bKey);
      const ad = a.dueDate || "9999-12-31";
      const bd = b.dueDate || "9999-12-31";
      if (ad !== bd) return ad.localeCompare(bd);
      return (a.createdAt || "").localeCompare(b.createdAt || "");
    });
  }, [jobs, schedule, search]);

  // Map hides done + respects search
  const jobsForMap = useMemo(() => jobs.filter((j) => j.status !== "done").filter(matchSearch), [
    jobs,
    search,
  ]);

  // Export
  const exportExcel = () => {
    exportScheduleToExcel({
      activeJobs: activeJobs.map((j) => ({
        id: j.id,
        name: j.name,
        jobNumber: j.jobNumber || "",
        jobAddress: j.jobAddress || "",
        status: j.status,
        dueDate: j.dueDate || "",
        finishBase: baseFinishText(j),
        finishSafe: safeFinishText(j),
      })),
      doneJobs: doneJobsFiltered.map((j) => ({
        id: j.id,
        name: j.name,
        jobNumber: j.jobNumber || "",
        jobAddress: j.jobAddress || "",
        status: j.status,
        dueDate: j.dueDate || "",
        finishBase: baseFinishText(j),
        finishSafe: "",
      })),
    });
  };

  return (
    <div className={`p-4 space-y-4 ${THEME.pageBg} ${THEME.pageText} min-h-screen`}>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">
            Schedule <span className={THEME.blueText}>• ZRSchedule</span>
          </h1>
          <p className={`text-sm ${THEME.subtle}`}>
            Search • Export Excel • Mark Done + Undo • Completed on top • Work list sorted by earliest finish • Done hidden from Map
          </p>
          {loading ? <p className={`text-xs ${THEME.subtle2}`}>Loading…</p> : null}
          {err ? <p className={`text-xs ${THEME.redText}`}>❌ {err}</p> : null}
        </div>

        <div className="flex gap-2">
          <button
            className={`px-3 py-2 rounded-lg border ${THEME.border} ${
              tab === "timeline" ? "bg-slate-800/60" : "bg-slate-900/40"
            }`}
            onClick={() => setTab("timeline")}
          >
            Timeline
          </button>
          <button
            className={`px-3 py-2 rounded-lg border ${THEME.border} ${
              tab === "map" ? "bg-slate-800/60" : "bg-slate-900/40"
            }`}
            onClick={() => setTab("map")}
          >
            Map
          </button>

          <button
            onClick={reload}
            className={`px-3 py-2 rounded-lg border ${THEME.border} bg-slate-900/40 hover:bg-slate-800/50`}
            title="Reload from Supabase"
          >
            Refresh
          </button>
        </div>
      </div>

      {jobs.length === 0 ? (
        <div className={`rounded-xl ${THEME.cardBg} border ${THEME.border} p-4 text-sm ${THEME.subtle}`}>
          No jobs yet
        </div>
      ) : tab === "timeline" ? (
        <div className="space-y-6">
          {/* SEARCH + CLEAR + EXPORT */}
          <div className={`rounded-xl ${THEME.cardBg} border ${THEME.border} p-3`}>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="text-sm font-semibold">Search</div>
                <div className={`text-xs ${THEME.subtle}`}>By job name, job number, or address</div>
              </div>

              <div className="w-full sm:w-[560px] flex gap-2">
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search… (name / #number / address)"
                  className={`w-full px-3 py-2 rounded-lg border ${THEME.border} bg-slate-900/40 text-slate-100 placeholder:text-slate-500 outline-none`}
                />

                <button
                  onClick={() => setSearch("")}
                  disabled={!search.trim()}
                  className={`px-3 py-2 rounded-lg border ${THEME.border} ${
                    search.trim()
                      ? `${THEME.blueBg} ${THEME.blueText} border-sky-500/30 hover:bg-sky-500/20`
                      : "bg-slate-900/40 text-slate-500"
                  }`}
                  title="Clear search"
                >
                  ❌
                </button>

                <button
                  onClick={exportExcel}
                  className={`px-3 py-2 rounded-lg border ${THEME.blueBorder} ${THEME.blueBg} ${THEME.blueText} hover:bg-sky-500/20`}
                  title="Export schedule to Excel"
                >
                  Export
                </button>
              </div>
            </div>
          </div>

          {/* COMPLETED ON TOP */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Completed (Done)</h2>
              <div className={`text-xs ${THEME.subtle}`}>{doneJobs.length} jobs</div>
            </div>

            <div className="mb-3 flex flex-wrap gap-2">
              <button
                onClick={() => setDoneMonth("all")}
                className={`px-3 py-1.5 rounded-lg text-sm border ${THEME.border} ${
                  doneMonth === "all"
                    ? `${THEME.blueBg} ${THEME.blueText} border-sky-500/30`
                    : "bg-slate-900/40"
                }`}
              >
                All
              </button>

              {doneMonths.map((ym) => (
                <button
                  key={ym}
                  onClick={() => setDoneMonth(ym)}
                  className={`px-3 py-1.5 rounded-lg text-sm border ${THEME.border} ${
                    doneMonth === ym
                      ? `${THEME.blueBg} ${THEME.blueText} border-sky-500/30`
                      : "bg-slate-900/40"
                  }`}
                >
                  {monthLabel(ym)}
                </button>
              ))}
            </div>

            {doneJobsFiltered.length === 0 ? (
              <div className={`rounded-xl ${THEME.cardBg} border ${THEME.border} p-4 text-sm ${THEME.subtle}`}>
                No completed jobs for this month (or search)
              </div>
            ) : (
              <div className="space-y-3">
                {doneJobsFiltered.map((j) => (
                  <div key={j.id} className={`rounded-xl ${THEME.cardBg} border ${THEME.border} p-4`}>
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="font-semibold truncate">
                            {j.name} {j.jobNumber ? `(#${j.jobNumber})` : ""}
                          </div>
                          <StatusChip job={j} />
                        </div>

                        <div className={`mt-2 text-xs ${THEME.subtle2}`}>
                          Finished on: <b className={THEME.doneText}>{baseFinishText(j)}</b>
                        </div>

                        {j.jobAddress ? (
                          <div className={`mt-2 text-xs ${THEME.subtle2} truncate`}>📍 {j.jobAddress}</div>
                        ) : null}
                      </div>

                      <div className="text-right">
                        <button
                          onClick={() => undoDone(j.id)}
                          className={`px-3 py-2 rounded-lg text-sm border ${THEME.blueBorder} ${THEME.blueBg} ${THEME.blueText} hover:bg-sky-500/20`}
                        >
                          Undo Done → Planned
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* WORK LIST sorted by earliest finish */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Work List</h2>
              <div className={`text-xs ${THEME.subtle}`}>Today: {todayYMD()}</div>
            </div>

            {activeJobs.length === 0 ? (
              <div className={`rounded-xl ${THEME.cardBg} border ${THEME.border} p-4 text-sm ${THEME.subtle}`}>
                No jobs match search (or all are done)
              </div>
            ) : (
              <div className="space-y-3">
                {activeJobs.map((j) => {
                  const late = isLateLocked(j);
                  const finishBase = baseFinishText(j);
                  const finishSafe = safeFinishText(j);

                  const shouldBeFinished =
                    finishBase !== "—" && finishBase < todayYMD() && j.status !== "done";

                  return (
                    <div key={j.id} className={`rounded-xl ${THEME.cardBg} border ${THEME.border} p-4`}>
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <div className="font-semibold truncate">
                              {j.name} {j.jobNumber ? `(#${j.jobNumber})` : ""}
                            </div>
                            <StatusChip job={j} />

                            {shouldBeFinished ? (
                              <span
                                className={`px-2 py-0.5 rounded-full border ${THEME.amberBorder} ${THEME.amberBg} ${THEME.amberText}`}
                              >
                                SHOULD BE FINISHED
                              </span>
                            ) : null}
                          </div>

                          <div className="mt-1 flex flex-wrap gap-2 text-xs">
                            <span className={`px-2 py-0.5 rounded-full border ${THEME.chipBorder} ${THEME.chipBg}`}>
                              Due: {j.dueDate || "—"}
                            </span>

                            <span
                              className={
                                "px-2 py-0.5 rounded-full border " +
                                (j.priority === "high"
                                  ? `${THEME.amberBorder} ${THEME.amberBg} ${THEME.amberText}`
                                  : `${THEME.chipBorder} ${THEME.chipBg} ${THEME.subtle}`)
                              }
                            >
                              {j.priority === "high" ? "Priority: HIGH" : "Priority: Normal"}
                            </span>

                            <span
                              className={
                                "px-2 py-0.5 rounded-full border " +
                                (j.lockDueDate
                                  ? `${THEME.blueBorder} ${THEME.blueBg} ${THEME.blueText}`
                                  : `${THEME.chipBorder} ${THEME.chipBg} ${THEME.subtle}`)
                              }
                            >
                              {j.lockDueDate ? "Locked" : "Not locked"}
                            </span>
                          </div>

                          <div className={`mt-2 text-sm ${THEME.subtle}`}>
                            Steps Hours: {jobStepsTotal(j).toFixed(1)}h
                          </div>
                          <div className={`text-sm ${THEME.subtle}`}>Days needed: {daysNeeded(j)}</div>

                          {late ? (
                            <div
                              className={`mt-2 text-xs border ${THEME.redBorder} ${THEME.redBg} ${THEME.redText} px-2 py-1 rounded-lg inline-block`}
                            >
                              ⚠ Locked job is late (Finish is after Due)
                            </div>
                          ) : null}
                        </div>

                        <div className="text-right text-sm flex flex-col items-end gap-2">
                          <div>
                            <div>
                              Finish (Base): <b>{finishBase}</b>
                            </div>
                            <div>
                              Finish (Safe +10%):{" "}
                              <b className={THEME.blueText}>{finishSafe}</b>
                            </div>
                            <div className={`mt-2 text-xs ${THEME.subtle2}`}>
                              Status: <span className="font-semibold">{j.status.toUpperCase()}</span>
                            </div>
                          </div>

                          <button
                            onClick={() => markDone(j.id)}
                            className={`px-3 py-2 rounded-lg text-sm border ${THEME.doneBorder} ${THEME.doneBg} ${THEME.doneText} hover:bg-emerald-500/25`}
                            title="Move this job to Completed (Done)"
                          >
                            Mark Done
                          </button>
                        </div>
                      </div>

                      {j.jobAddress ? (
                        <div className={`mt-2 text-xs ${THEME.subtle2} truncate`}>📍 {j.jobAddress}</div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className={`rounded-xl overflow-hidden border ${THEME.border}`}>
          <JobsMap
            jobs={jobsForMap}
            selectedJobId={selectedJobId}
            onSelectJobId={setSelectedJobId}
            selectedJob={selectedJob}
            baseFinishText={baseFinishText}
            safeFinishText={safeFinishText}
          />
        </div>
      )}
    </div>
  );
}
