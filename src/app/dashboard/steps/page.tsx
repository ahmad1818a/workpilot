"use client";

import { useEffect, useMemo, useState } from "react";

const JOBS_KEY = "zrschedule_jobs_v3";
const WORKERS_KEY = "zr_workers_v2";
const TEMPLATES_KEY = "zrschedule_step_templates_v1";
const ALLOC_KEY = "zrschedule_step_allocations_v1";

// ---------------- Types ----------------
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

type Step = {
  id: string;
  templateId: string;
  templateName: string;
  hours: number;
  workerName: string;
  order: number;
};

type JobStatus = "planned" | "active" | "done";

type Job = {
  id: string;
  name: string;
  dueDate: string; // "" means none
  status: JobStatus;
  steps: Step[];
  seq?: number;
  createdAtTs?: number;
};

type StepTemplate = {
  id: string;
  name: string;
  mode?: "sequential" | "daily_split";
  splitSlots?: number; // 1..5
};

type StepAllocation = {
  id: string;
  date: string; // yyyy-mm-dd
  workerName: string;
  stepTemplateId: string;
  jobId: string;
  hours: number;
  createdAtTs: number;
};

// ---------------- Helpers ----------------
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

function normalizeKey(s: string) {
  return (s || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function fmtYMD(d: Date) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function parseYMD(s: string) {
  const [y, m, d] = (s || "").split("-").map((x) => Number(x));
  if (!y || !m || !d) return new Date(NaN);
  return new Date(y, m - 1, d);
}

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function addDays(d: Date, days: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
}

function dayKeyOf(d: Date): DayKey {
  const n = d.getDay();
  if (n === 0) return "sun";
  if (n === 1) return "mon";
  if (n === 2) return "tue";
  if (n === 3) return "wed";
  if (n === 4) return "thu";
  if (n === 5) return "fri";
  return "sat";
}

function isAbsent(worker: Worker, ymd: string) {
  return (worker.absences || []).some((a) => a?.date === ymd);
}

function hoursForDay(worker: Worker, d: Date) {
  const k = dayKeyOf(d);
  const on = !!worker.template?.days?.[k];
  if (!on) return 0;
  const h = toNumber(worker.template?.hours?.[k] ?? 0);
  return Math.max(0, h);
}

function round2(x: number) {
  return Math.round(x * 100) / 100;
}

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

function saveJSON(key: string, value: any) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

// ---------------- Sorting rule (same as Jobs) ----------------
function sortJobsRule(a: Job, b: Job) {
  const aHas = !!a.dueDate;
  const bHas = !!b.dueDate;

  if (aHas !== bHas) return aHas ? -1 : 1;

  if (aHas && bHas) {
    const ad = parseYMD(a.dueDate).getTime();
    const bd = parseYMD(b.dueDate).getTime();
    if (ad !== bd) return ad - bd;
  }

  const as = toNumber((a as any).seq ?? 0);
  const bs = toNumber((b as any).seq ?? 0);
  if (as !== bs) return as - bs;

  const at = toNumber((a as any).createdAtTs ?? 0);
  const bt = toNumber((b as any).createdAtTs ?? 0);
  return at - bt;
}

// ---------------- Build templates from Jobs steps ----------------
function buildTemplatesFromJobs(jobs: Job[]): StepTemplate[] {
  const map = new Map<string, StepTemplate>();
  for (const j of jobs || []) {
    for (const s of j.steps || []) {
      const id = String(s.templateId || "");
      const name = String(s.templateName || "").trim();
      if (!id || !name) continue;
      if (!map.has(id)) {
        map.set(id, { id, name, mode: "daily_split", splitSlots: 2 });
      }
    }
  }
  const arr = Array.from(map.values());
  arr.sort((a, b) => a.name.localeCompare(b.name));
  return arr;
}

function workersForTemplate(jobs: Job[], tplId: string) {
  const set = new Set<string>();
  for (const j of jobs || []) {
    if (j.status === "done") continue;
    for (const s of j.steps || []) {
      if (s.templateId !== tplId) continue;
      const w = (s.workerName || "").trim();
      if (w) set.add(w);
    }
  }
  const arr = Array.from(set);
  arr.sort((a, b) => a.localeCompare(b));
  return arr;
}

function buildNeedsForWorker(args: {
  jobs: Job[];
  alloc: StepAllocation[];
  tplId: string;
  workerName: string;
}) {
  const { jobs, alloc, tplId, workerName } = args;
  const wKey = normalizeKey(workerName);

  const relevantJobs = (jobs || [])
    .filter((j) => j.status !== "done")
    .slice()
    .sort(sortJobsRule);

  const allocSum = new Map<string, number>();
  for (const a of alloc || []) {
    if (a.stepTemplateId !== tplId) continue;
    if (normalizeKey(a.workerName) !== wKey) continue;
    allocSum.set(a.jobId, (allocSum.get(a.jobId) || 0) + toNumber(a.hours));
  }

  const needs: { job: Job; remaining: number }[] = [];

  for (const j of relevantJobs) {
    const step = (j.steps || []).find(
      (s) => s.templateId === tplId && normalizeKey(s.workerName) === wKey
    );
    if (!step) continue;

    const required = Math.max(0, toNumber(step.hours));
    const done = Math.max(0, allocSum.get(j.id) || 0);
    const remaining = Math.max(0, required - done);

    if (remaining > 0) needs.push({ job: j, remaining });
  }

  return needs;
}

export default function StepsPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [templates, setTemplates] = useState<StepTemplate[]>([]);
  const [alloc, setAlloc] = useState<StepAllocation[]>([]);
  const [hydrated, setHydrated] = useState(false);

  const [selectedTemplateId, setSelectedTemplateId] = useState("");

  // Week view
  const [weekStartYmd, setWeekStartYmd] = useState(() => fmtYMD(startOfDay(new Date())));

  // Create template
  const [newTemplateName, setNewTemplateName] = useState("");

  // Draft split (not saved until Apply)
  const [draftSplit, setDraftSplit] = useState<number>(2);
  const [dirty, setDirty] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);

  // ---------- First load ----------
  useEffect(() => {
    const j = loadJSON<Job[]>(JOBS_KEY, []);
    const w = loadJSON<Worker[]>(WORKERS_KEY, []);
    const tRaw = loadJSON<any[]>(TEMPLATES_KEY, []);
    const a = loadJSON<StepAllocation[]>(ALLOC_KEY, []);

    setJobs(j);
    setWorkers(w);
    setAlloc(a);

    const cleaned: StepTemplate[] = (Array.isArray(tRaw) ? tRaw : [])
      .map((x: any) => ({
        id: String(x?.id ?? ""),
        name: String(x?.name ?? ""),
        mode: x?.mode === "sequential" ? "sequential" : "daily_split",
        splitSlots: clamp(toNumber(x?.splitSlots ?? 2), 1, 5),
      }))
      .filter((x) => x.id && x.name.trim());

    const next = cleaned.length ? cleaned : buildTemplatesFromJobs(j);
    setTemplates(next);

    // ✅ Auto select first template if nothing selected
    setSelectedTemplateId((prev) => prev || next[0]?.id || "");

    // ✅ Now allow saving via effects (prevents overwrite bugs)
    setHydrated(true);
  }, []);

  // Save allocations after hydrated
  useEffect(() => {
    if (!hydrated) return;
    saveJSON(ALLOC_KEY, alloc);
  }, [alloc, hydrated]);

  // Save templates after hydrated (ONLY from templates state)
  useEffect(() => {
    if (!hydrated) return;
    saveJSON(TEMPLATES_KEY, templates);
  }, [templates, hydrated]);

  const selectedTemplate = useMemo(
    () => templates.find((t) => t.id === selectedTemplateId) || null,
    [templates, selectedTemplateId]
  );

  // When template changes, load saved split into draft
  useEffect(() => {
    if (!selectedTemplate) return;
    const saved = clamp(toNumber(selectedTemplate.splitSlots ?? 2), 1, 5);
    setDraftSplit(saved);
    setDirty(false);
  }, [selectedTemplateId]); // only when selection changes

  useEffect(() => {
    if (!savedFlash) return;
    const t = setTimeout(() => setSavedFlash(false), 1200);
    return () => clearTimeout(t);
  }, [savedFlash]);

  const weekDays = useMemo(() => {
    const start = parseYMD(weekStartYmd);
    const arr: { date: Date; ymd: string }[] = [];
    for (let i = 0; i < 7; i++) {
      const d = addDays(start, i);
      arr.push({ date: d, ymd: fmtYMD(d) });
    }
    return arr;
  }, [weekStartYmd]);

  // Worker map + fallback 8h Mon-Fri
  const workerMap = useMemo(() => {
    const m = new Map<string, Worker>();
    for (const w of workers || []) m.set(normalizeKey(w.name), w);

    const fallback = (name: string): Worker => ({
      id: "fallback",
      name,
      template: {
        days: { mon: true, tue: true, wed: true, thu: true, fri: true, sat: false, sun: false },
        hours: { mon: 8, tue: 8, wed: 8, thu: 8, fri: 8, sat: 0, sun: 0 },
      },
      absences: [],
    });

    return { get: (name: string) => m.get(normalizeKey(name)) ?? fallback(name) };
  }, [workers]);

  // ---------- UI actions ----------
  function addTemplate() {
    const name = newTemplateName.trim();
    if (!name) return alert("Template name is required");

    const id = "tpl_" + uid();
    const t: StepTemplate = { id, name, mode: "daily_split", splitSlots: 2 };

    setTemplates((p) => [t, ...p].sort((a, b) => a.name.localeCompare(b.name)));
    setSelectedTemplateId(id);
    setNewTemplateName("");
  }

  function deleteSelectedTemplate() {
    if (!selectedTemplate) return;
    const ok = confirm(`Delete template "${selectedTemplate.name}"?`);
    if (!ok) return;

    const tplId = selectedTemplate.id;

    setTemplates((prev) => prev.filter((t) => t.id !== tplId));
    setAlloc((prev) => prev.filter((a) => a.stepTemplateId !== tplId));

    setSelectedTemplateId((prev) => {
      if (prev !== tplId) return prev;
      const left = templates.filter((t) => t.id !== tplId);
      return left[0]?.id || "";
    });
  }

  function applySplit() {
    if (!selectedTemplate) return;
    const nextSplit = clamp(toNumber(draftSplit), 1, 5);

    setTemplates((prev) =>
      prev.map((t) =>
        t.id === selectedTemplate.id ? { ...t, mode: "daily_split", splitSlots: nextSplit } : t
      )
    );

    setDirty(false);
    setSavedFlash(true);
  }

  function resetSplit() {
    if (!selectedTemplate) return;
    const saved = clamp(toNumber(selectedTemplate.splitSlots ?? 2), 1, 5);
    setDraftSplit(saved);
    setDirty(false);
  }

  function clearWeekAlloc() {
    if (!selectedTemplate || weekDays.length < 7) return;
    const tplId = selectedTemplate.id;
    const start = weekDays[0].ymd;
    const end = weekDays[6].ymd;

    setAlloc((prev) =>
      prev.filter((a) => !(a.stepTemplateId === tplId && a.date >= start && a.date <= end))
    );
  }

  function autoFillWeekAllWorkers() {
    if (!selectedTemplate) return alert("Select Step Template first");
    if (weekDays.length < 7) return;

    // ✅ Always use saved splitSlots (from template state)
    const slots = clamp(toNumber(selectedTemplate.splitSlots ?? 2), 1, 5);
    const tplId = selectedTemplate.id;

    const wList = workersForTemplate(jobs, tplId);
    if (wList.length === 0) return alert("No workers found for this template in Jobs steps yet.");

    const start = weekDays[0].ymd;
    const end = weekDays[6].ymd;

    // remove existing allocations for this step for the week (all workers)
    const kept = alloc.filter(
      (a) => !(a.stepTemplateId === tplId && a.date >= start && a.date <= end)
    );

    const newOnes: StepAllocation[] = [];

    for (const wName of wList) {
      const w = workerMap.get(wName);

      const needs = buildNeedsForWorker({ jobs, alloc: kept, tplId, workerName: wName });
      const remainingMap = new Map<string, number>();
      for (const n of needs) remainingMap.set(n.job.id, n.remaining);

      const orderedJobs = needs.map((x) => x.job);

      for (const day of weekDays) {
        const cap = hoursForDay(w, day.date);
        if (cap <= 0) continue;
        if (isAbsent(w, day.ymd)) continue;

        const active = orderedJobs
          .filter((j) => (remainingMap.get(j.id) || 0) > 0)
          .slice(0, slots);

        if (active.length === 0) continue;

        // split capacity equally across active jobs, but never exceed remaining
        let usedSoFar = 0;

        for (let i = 0; i < active.length; i++) {
          const job = active[i];
          const rem = remainingMap.get(job.id) || 0;
          if (rem <= 0) continue;

          const base = round2(cap / active.length);
          let give = i === active.length - 1 ? round2(cap - usedSoFar) : base;
          give = Math.max(0, Math.min(rem, give));
          if (give <= 0) continue;

          newOnes.push({
            id: uid(),
            date: day.ymd,
            workerName: w.name,
            stepTemplateId: tplId,
            jobId: job.id,
            hours: give,
            createdAtTs: Date.now(),
          });

          usedSoFar = round2(usedSoFar + give);
          remainingMap.set(job.id, rem - give);
        }
      }
    }

    setAlloc([...kept, ...newOnes]);
  }

  // ---------- Week view data ----------
  const weekAlloc = useMemo(() => {
    if (!selectedTemplate || weekDays.length < 7) return [];
    const tplId = selectedTemplate.id;
    const start = weekDays[0].ymd;
    const end = weekDays[6].ymd;

    return (alloc || [])
      .filter((a) => a.stepTemplateId === tplId)
      .filter((a) => a.date >= start && a.date <= end)
      .slice()
      .sort((a, b) => a.date.localeCompare(b.date) || a.workerName.localeCompare(b.workerName));
  }, [alloc, selectedTemplate, weekDays]);

  const allocByDay = useMemo(() => {
    const map = new Map<string, StepAllocation[]>();
    for (const a of weekAlloc) {
      const arr = map.get(a.date) || [];
      arr.push(a);
      map.set(a.date, arr);
    }
    return map;
  }, [weekAlloc]);

  const jobNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const j of jobs) m.set(j.id, j.name);
    return m;
  }, [jobs]);

  const splitLabel = (n: number) => {
    if (n === 1) return "1 (100%)";
    const pct = Math.round(100 / n);
    return `${n} (${pct}% × ${n})`;
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold">Steps Planner</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Create templates here. Steps for jobs are still added inside Jobs page.
        </p>
      </div>

      {/* Create Template */}
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-4">
        <div className="grid gap-3 md:grid-cols-3">
          <div className="md:col-span-2">
            <label className="text-xs text-zinc-400">New Step Template</label>
            <input
              value={newTemplateName}
              onChange={(e) => setNewTemplateName(e.target.value)}
              className="mt-1 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-sky-500"
              placeholder="Example: Cutting"
            />
          </div>
          <div className="flex items-end">
            <button
              onClick={addTemplate}
              className="w-full rounded-xl bg-sky-500 px-4 py-2 text-sm font-bold text-black hover:bg-sky-400"
            >
              + Add Template
            </button>
          </div>
        </div>
      </div>

      {/* Select + Split + Week */}
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-4">
        <div className="grid gap-3 md:grid-cols-3">
          <div>
            <label className="text-xs text-zinc-400">Step Template</label>
            <select
              value={selectedTemplateId}
              onChange={(e) => setSelectedTemplateId(e.target.value)}
              className="mt-1 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-sky-500"
            >
              <option value="">-- select step --</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>

            {selectedTemplate ? (
              <div className="mt-2 flex gap-2">
                <button
                  onClick={deleteSelectedTemplate}
                  className="rounded-xl border border-red-900/60 px-3 py-2 text-xs font-semibold text-red-300 hover:bg-red-950/20"
                >
                  Delete Template
                </button>
              </div>
            ) : null}

            {/* Split box */}
            {selectedTemplate ? (
              <div className="mt-3 rounded-xl border border-zinc-800 bg-zinc-950/40 p-3">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-bold">Split</div>
                  {savedFlash ? (
                    <div className="text-xs text-emerald-300">Saved ✅</div>
                  ) : dirty ? (
                    <div className="text-xs text-amber-300">Not applied</div>
                  ) : (
                    <div className="text-xs text-zinc-500">
                      Current: {splitLabel(clamp(toNumber(selectedTemplate.splitSlots ?? 2), 1, 5))}
                    </div>
                  )}
                </div>

                <div className="mt-2 flex flex-wrap gap-2">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      onClick={() => {
                        setDraftSplit(n);
                        setDirty(true);
                      }}
                      className={
                        "rounded-lg border px-3 py-1 text-xs " +
                        (draftSplit === n
                          ? "border-emerald-500 bg-emerald-500/10 text-emerald-200"
                          : "border-zinc-700 hover:bg-zinc-900")
                      }
                    >
                      {splitLabel(n)}
                    </button>
                  ))}
                </div>

                <div className="mt-3 flex items-center gap-2">
                  <button
                    onClick={applySplit}
                    disabled={!dirty}
                    className={
                      "rounded-lg px-3 py-1 text-xs font-semibold " +
                      (dirty
                        ? "bg-sky-500 text-black hover:bg-sky-400"
                        : "bg-zinc-800 text-zinc-400 cursor-not-allowed")
                    }
                  >
                    Apply
                  </button>

                  <button
                    onClick={resetSplit}
                    disabled={!dirty}
                    className={
                      "rounded-lg border px-3 py-1 text-xs " +
                      (dirty
                        ? "border-zinc-700 hover:bg-zinc-900"
                        : "border-zinc-800 text-zinc-500 cursor-not-allowed")
                    }
                  >
                    Reset
                  </button>

                  <div className="ml-auto text-xs text-zinc-500">
                    Example: split=2 means each worker can work on 2 jobs per day (50/50).
                  </div>
                </div>
              </div>
            ) : null}
          </div>

          <div>
            <label className="text-xs text-zinc-400">Week Start</label>
            <input
              type="date"
              value={weekStartYmd}
              onChange={(e) => setWeekStartYmd(e.target.value)}
              className="mt-1 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-sky-500"
            />
          </div>

          <div className="flex items-end gap-2">
            <button
              onClick={autoFillWeekAllWorkers}
              className="rounded-xl bg-sky-500 px-4 py-2 text-sm font-bold text-black hover:bg-sky-400"
            >
              Auto Fill Week
            </button>

            <button
              onClick={clearWeekAlloc}
              className="rounded-xl border border-red-900/60 px-4 py-2 text-sm font-semibold text-red-300 hover:bg-red-950/20"
            >
              Clear Week
            </button>
          </div>
        </div>
      </div>

      {/* Week Plan */}
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/30 p-4">
        <div className="text-sm font-bold">Week Plan</div>

        {!selectedTemplate ? (
          <div className="mt-2 text-sm text-zinc-500">Select Step first.</div>
        ) : (
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            {weekDays.map((d) => {
              const items = allocByDay.get(d.ymd) || [];
              const total = items.reduce((a, x) => a + toNumber(x.hours), 0);

              return (
                <div key={d.ymd} className="rounded-2xl border border-zinc-800 bg-zinc-950/50 p-3">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-semibold">{d.ymd}</div>
                    <div className="text-xs text-zinc-400">Total: {total.toFixed(2)}h</div>
                  </div>

                  {items.length === 0 ? (
                    <div className="mt-2 text-xs text-zinc-500">—</div>
                  ) : (
                    <div className="mt-2 space-y-2">
                      {items.map((a) => (
                        <div key={a.id} className="rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2">
                          <div className="text-xs text-zinc-400">{a.workerName}</div>
                          <div className="text-sm font-semibold">{jobNameById.get(a.jobId) || a.jobId}</div>
                          <div className="text-xs text-zinc-400">{a.hours}h</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
