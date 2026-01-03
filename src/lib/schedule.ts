// src/lib/schedule.ts
// =======================================================
// ZRSchedule - Scheduler core (worker calendar + absences)
// + Supports Step Template splitSlots (1..5 etc) correctly
// =======================================================

export type DayKey = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";

export type WeeklyTemplate = {
  days: Record<DayKey, boolean>; // ON/OFF
  hours: Record<DayKey, number>; // hours per day
};

export type Absence = {
  id: string;
  date: string; // yyyy-mm-dd
  reason?: string;
};

export type Worker = {
  id: string;
  name: string;
  template: WeeklyTemplate;
  absences: Absence[];
};

// ---------- Date helpers ----------
export function fmtYMD(d: Date) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export function parseYMD(s: string) {
  // expects yyyy-mm-dd
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
  // JS: 0 Sun ... 6 Sat
  const n = d.getDay();
  if (n === 0) return "sun";
  if (n === 1) return "mon";
  if (n === 2) return "tue";
  if (n === 3) return "wed";
  if (n === 4) return "thu";
  if (n === 5) return "fri";
  return "sat";
}

function safeNum(n: any, fallback = 0) {
  const x = Number(n);
  return Number.isFinite(x) ? x : fallback;
}

// ---------- Worker normalization ----------
export function normalizeWorkerKey(name: string) {
  return (name || "").trim().toLowerCase().replace(/\s+/g, " ");
}

export function makeFallbackWorker(name: string): Worker {
  const t: WeeklyTemplate = {
    days: { mon: true, tue: true, wed: true, thu: true, fri: true, sat: false, sun: false },
    hours: { mon: 8, tue: 8, wed: 8, thu: 8, fri: 8, sat: 0, sun: 0 },
  };
  return { id: "fallback", name: name || "Worker", template: t, absences: [] };
}

function isAbsent(worker: Worker, ymd: string) {
  return (worker.absences || []).some((a) => a?.date === ymd);
}

function hoursForDay(worker: Worker, d: Date) {
  const k = dayKeyOf(d);
  const on = !!worker.template?.days?.[k];
  if (!on) return 0;
  const h = safeNum(worker.template?.hours?.[k], 0);
  return Math.max(0, h);
}

// ---------- Public utilities ----------
export function withBufferHours(hours: number, pct: number) {
  const h = safeNum(hours, 0);
  const p = Math.max(0, safeNum(pct, 0));
  return Math.ceil(h * (1 + p));
}

/**
 * ✅ Correct allocation:
 * splitSlots DOES NOT multiply hours.
 * It reduces effective daily capacity for THIS step for THIS job:
 *   effectiveDailyCap = workerDailyCap / splitSlots
 */
export function addWorkHours(args: {
  startDate: Date;
  totalHours: number;
  worker: Worker;
  splitSlots?: number; // 1..5 etc
}) {
  let date = startOfDay(args.startDate);
  let remaining = Math.max(0, safeNum(args.totalHours, 0));
  const worker = args.worker;

  const slots = Math.max(1, Math.min(50, Math.floor(safeNum(args.splitSlots, 1) || 1)));

  if (remaining <= 0) return date;

  // Safety to avoid infinite loops in bad templates:
  for (let guard = 0; guard < 20000; guard++) {
    const ymd = fmtYMD(date);
    const absent = isAbsent(worker, ymd);
    const cap = absent ? 0 : hoursForDay(worker, date);

    // ✅ IMPORTANT: effective cap for this job for this step
    const effectiveCap = cap > 0 ? cap / slots : 0;

    if (effectiveCap > 0) {
      if (remaining <= effectiveCap + 1e-9) {
        return date; // finishes today
      }
      remaining -= effectiveCap;
    }

    date = addDays(date, 1);
  }

  return date;
}

// ---------- Scheduler types ----------
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
  dueDate?: string; // yyyy-mm-dd optional
  createdAt?: string; // yyyy-mm-dd
  createdAtTs?: number; // Date.now()
  seq?: number; // serial
  status?: "planned" | "active" | "done";
  steps: Step[];
};

// ---------- Template split settings ----------
const TEMPLATES_KEY = "zrschedule_step_templates_v1";

type StepTemplateStored = {
  id: string;
  name?: string;
  mode?: "sequential" | "daily_split";
  splitSlots?: number; // 1..5 etc
};

function loadSplitMapFromLocalStorage(): Map<string, number> {
  const map = new Map<string, number>();
  if (typeof window === "undefined") return map;

  try {
    const raw = localStorage.getItem(TEMPLATES_KEY);
    if (!raw) return map;
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return map;

    for (const x of arr as StepTemplateStored[]) {
      const id = String((x as any)?.id ?? "").trim();
      if (!id) continue;

      // default split = 1
      let slots = safeNum((x as any)?.splitSlots, 1);
      slots = Math.max(1, Math.min(5, Math.floor(slots))); // we support 1..5 (you can raise this if you want)
      map.set(id, slots);
    }
  } catch {
    // ignore
  }

  return map;
}

// ---------- Scheduler ----------
export function computeJobsSchedule(jobs: Job[], workers: Worker[]) {
  const workerMap = new Map<string, Worker>();
  for (const w of workers || []) {
    workerMap.set(normalizeWorkerKey(w.name), w);
  }

  // ✅ read split per templateId
  const splitMap = loadSplitMapFromLocalStorage(); // templateId -> splitSlots

  // ✅ stable sorting (DueDate first then earliest, else seq/createdAtTs)
  const sortedJobs = [...(jobs || [])].sort((a: any, b: any) => {
    const aHasDue = !!a.dueDate;
    const bHasDue = !!b.dueDate;

    // 1) jobs with dueDate first
    if (aHasDue !== bHasDue) return aHasDue ? -1 : 1;

    // 2) earlier due first
    if (aHasDue && bHasDue) {
      const ad = parseYMD(a.dueDate).getTime();
      const bd = parseYMD(b.dueDate).getTime();
      if (ad !== bd) return ad - bd;
    }

    // 3) fallback: seq
    const aSeq = safeNum(a.seq, 0);
    const bSeq = safeNum(b.seq, 0);
    if (aSeq !== bSeq) return aSeq - bSeq;

    // 4) fallback: createdAtTs
    const at = safeNum(a.createdAtTs, 0);
    const bt = safeNum(b.createdAtTs, 0);
    return at - bt;
  });

  // Worker availability pointer: when each worker becomes free
  const workerFreeDate = new Map<string, Date>();
  const today = startOfDay(new Date());

  const jobFinish = new Map<string, Date>();
  const jobLastStepWorker = new Map<string, string>(); // normalized worker key

  // ✅ schedule all steps sequentially (by job order, steps order)
  for (const job of sortedJobs) {
    const steps = [...(job.steps || [])].sort((a, b) => safeNum(a.order, 0) - safeNum(b.order, 0));

    let lastFinish: Date | null = null;
    let lastWorkerKey = "";

    for (const s of steps) {
      const wKey = normalizeWorkerKey(s.workerName);
      const w = workerMap.get(wKey) ?? makeFallbackWorker(s.workerName || "Worker");

      const wAvail = workerFreeDate.get(wKey) ?? today;

      // ✅ step must start after:
      // - worker is free
      // - AND previous step of same job finished
      const start = lastFinish ? (wAvail > lastFinish ? wAvail : lastFinish) : wAvail;

      // ✅ split slots for this step template
      const slots = Math.max(1, Math.min(5, Math.floor(safeNum(splitMap.get(s.templateId), 1))));

      const finish = addWorkHours({
        startDate: start,
        totalHours: safeNum(s.hours, 0),
        worker: w,
        splitSlots: slots,
      });

      // ✅ after finishing, next available day is next day start
      const nextAvail = addDays(finish, 1);
      workerFreeDate.set(wKey, nextAvail);

      lastFinish = finish;
      lastWorkerKey = wKey;
    }

    if (lastFinish) {
      jobFinish.set(job.id, lastFinish);
      jobLastStepWorker.set(job.id, lastWorkerKey);
    }
  }

  return {
    jobFinish,
    jobLastStepWorker,
  };
}
