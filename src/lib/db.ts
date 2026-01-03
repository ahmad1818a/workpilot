import { createClient } from "@/lib/supabase/client";

export type DayKey = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";

export type WeeklyTemplate = {
  days: Record<DayKey, boolean>;
  hours: Record<DayKey, number>;
};

export type Absence = { id: string; date: string; reason?: string };

export type Worker = {
  id: string;
  name: string;
  template: WeeklyTemplate;
  absences: Absence[];
};

export type JobStatus = "planned" | "active" | "done";
export type JobPriority = "normal" | "high";

export type StepRow = {
  id: string;
  templateId: string;
  templateName: string;
  hours: number;
  workerName: string;
  order: number;
};

export type JobRow = {
  id: string;
  name: string;
  dueDate: string; // yyyy-mm-dd or ""
  totalHours: number; // computed from steps
  status: JobStatus;
  createdAt: string; // yyyy-mm-dd
  steps: StepRow[];
  doneAt?: string; // yyyy-mm-dd
};

// -------- helpers ----------
function ymdFrom(v: any): string {
  if (!v) return "";
  if (typeof v === "string") return v.slice(0, 10);
  return String(v).slice(0, 10);
}

function defaultTemplate(): WeeklyTemplate {
  return {
    days: { mon: true, tue: true, wed: true, thu: true, fri: true, sat: false, sun: false },
    hours: { mon: 7, tue: 7, wed: 7, thu: 7, fri: 7, sat: 0, sun: 0 },
  };
}

function sumSteps(steps: StepRow[]) {
  return steps.reduce((a, s) => a + (Number(s.hours) || 0), 0);
}

// =========================
// Auth + Company
// =========================
export async function getCurrentCompanyId(): Promise<string> {
  const supabase = createClient();

  const { data: userRes, error: userErr } = await supabase.auth.getUser();
  if (userErr) throw userErr;
  if (!userRes.user) throw new Error("Not authenticated");

  const { data: membership, error } = await supabase
    .from("memberships")
    .select("company_id")
    .eq("user_id", userRes.user.id)
    .maybeSingle();

  if (error) throw error;
  if (!membership?.company_id) throw new Error("No company membership found");

  return String(membership.company_id);
}

// =========================
// Workers (Supabase)
// =========================
export async function listWorkers(): Promise<Worker[]> {
  const supabase = createClient();
  const companyId = await getCurrentCompanyId();

  const { data: workers, error } = await supabase
    .from("workers")
    .select("id,name,weekly_template,created_at")
    .eq("company_id", companyId)
    .order("created_at", { ascending: true });

  if (error) throw error;

  const ids = (workers ?? []).map((w: any) => w.id);
  let absences: any[] = [];

  if (ids.length) {
    const { data: a, error: aErr } = await supabase
      .from("worker_absences")
      .select("id,worker_id,date,reason")
      .eq("company_id", companyId)
      .in("worker_id", ids);

    if (aErr) throw aErr;
    absences = a ?? [];
  }

  const byWorker = new Map<string, Absence[]>();
  for (const a of absences) {
    const arr = byWorker.get(a.worker_id) ?? [];
    arr.push({ id: a.id, date: ymdFrom(a.date), reason: a.reason ?? "" });
    byWorker.set(a.worker_id, arr);
  }

  return (workers ?? []).map((w: any) => ({
    id: w.id,
    name: w.name ?? "",
    template: (w.weekly_template as WeeklyTemplate) ?? defaultTemplate(),
    absences: byWorker.get(w.id) ?? [],
  }));
}

export async function createWorker(name: string): Promise<Worker> {
  const supabase = createClient();
  const companyId = await getCurrentCompanyId();

  const { data, error } = await supabase
    .from("workers")
    .insert({
      company_id: companyId,
      name,
      weekly_template: defaultTemplate(),
    })
    .select("id,name,weekly_template")
    .single();

  if (error) throw error;

  return {
    id: data.id,
    name: data.name ?? "",
    template: (data.weekly_template as WeeklyTemplate) ?? defaultTemplate(),
    absences: [],
  };
}

export async function updateWorkerName(workerId: string, name: string) {
  const supabase = createClient();
  const companyId = await getCurrentCompanyId();

  const { error } = await supabase
    .from("workers")
    .update({ name })
    .eq("company_id", companyId)
    .eq("id", workerId);

  if (error) throw error;
}

export async function updateWorkerTemplate(workerId: string, template: WeeklyTemplate) {
  const supabase = createClient();
  const companyId = await getCurrentCompanyId();

  const { error } = await supabase
    .from("workers")
    .update({ weekly_template: template })
    .eq("company_id", companyId)
    .eq("id", workerId);

  if (error) throw error;
}

export async function deleteWorker(workerId: string) {
  const supabase = createClient();
  const companyId = await getCurrentCompanyId();

  // delete absences first (safe)
  await supabase.from("worker_absences").delete().eq("company_id", companyId).eq("worker_id", workerId);

  const { error } = await supabase.from("workers").delete().eq("company_id", companyId).eq("id", workerId);
  if (error) throw error;
}

export async function addWorkerAbsence(workerId: string, date: string, reason?: string) {
  const supabase = createClient();
  const companyId = await getCurrentCompanyId();

  const { error } = await supabase.from("worker_absences").insert({
    company_id: companyId,
    worker_id: workerId,
    date,
    reason: reason ?? "",
  });

  if (error) throw error;
}

export async function removeWorkerAbsence(absenceId: string) {
  const supabase = createClient();
  const companyId = await getCurrentCompanyId();

  const { error } = await supabase
    .from("worker_absences")
    .delete()
    .eq("company_id", companyId)
    .eq("id", absenceId);

  if (error) throw error;
}

// =========================
// Jobs + Steps (Supabase)
// =========================
export async function listJobs(): Promise<JobRow[]> {
  const supabase = createClient();
  const companyId = await getCurrentCompanyId();

  const { data: jobs, error } = await supabase
    .from("jobs")
    .select("id,name,due_date,status,created_at,done_at")
    .eq("company_id", companyId)
    .order("created_at", { ascending: true });

  if (error) throw error;

  const jobIds = (jobs ?? []).map((j: any) => j.id);
  let steps: any[] = [];

  if (jobIds.length) {
    const { data: st, error: stErr } = await supabase
      .from("job_steps")
      .select("id,job_id,template_id,template_name,hours,worker_name,step_order")
      .eq("company_id", companyId)
      .in("job_id", jobIds);

    if (stErr) throw stErr;
    steps = st ?? [];
  }

  const byJob = new Map<string, StepRow[]>();
  for (const s of steps) {
    const jobId = String((s as any).job_id ?? "");
    if (!jobId) continue;

    const arr = byJob.get(jobId) ?? [];
    arr.push({
      id: String((s as any).id ?? ""),
      templateId: String((s as any).template_id ?? ""),
      templateName: String((s as any).template_name ?? ""),
      hours: Number((s as any).hours ?? 0),
      workerName: String((s as any).worker_name ?? ""),
      order: Number((s as any).step_order ?? 1),
    });
    byJob.set(jobId, arr);
  }

  return (jobs ?? []).map((j: any) => {
    const stepsSorted = (byJob.get(j.id) ?? []).sort((a, b) => a.order - b.order);
    return {
      id: j.id,
      name: j.name ?? "",
      dueDate: ymdFrom(j.due_date),
      status: (j.status as JobStatus) ?? "planned",
      createdAt: ymdFrom(j.created_at),
      doneAt: ymdFrom(j.done_at),
      steps: stepsSorted,
      totalHours: sumSteps(stepsSorted),
    };
  });
}

export async function createJob(payload: { name: string; dueDate?: string; status?: JobStatus }) {
  const supabase = createClient();
  const companyId = await getCurrentCompanyId();

  const { data, error } = await supabase
    .from("jobs")
    .insert({
      company_id: companyId,
      name: payload.name,
      due_date: payload.dueDate || null,
      status: payload.status ?? "planned",
    })
    .select("id,name,due_date,status,created_at,done_at")
    .single();

  if (error) throw error;

  return {
    id: data.id,
    name: data.name ?? "",
    dueDate: ymdFrom(data.due_date),
    status: (data.status as JobStatus) ?? "planned",
    createdAt: ymdFrom(data.created_at),
    doneAt: ymdFrom(data.done_at),
    steps: [],
    totalHours: 0,
  } as JobRow;
}

export async function updateJob(jobId: string, patch: Partial<{ name: string; dueDate: string; status: JobStatus }>) {
  const supabase = createClient();
  const companyId = await getCurrentCompanyId();

  const dbPatch: any = {};
  if (patch.name != null) dbPatch.name = patch.name;
  if (patch.dueDate != null) dbPatch.due_date = patch.dueDate || null;
  if (patch.status != null) dbPatch.status = patch.status;

  const { error } = await supabase.from("jobs").update(dbPatch).eq("company_id", companyId).eq("id", jobId);
  if (error) throw error;
}

export async function deleteJob(jobId: string) {
  const supabase = createClient();
  const companyId = await getCurrentCompanyId();

  // delete steps first
  await supabase.from("job_steps").delete().eq("company_id", companyId).eq("job_id", jobId);

  const { error } = await supabase.from("jobs").delete().eq("company_id", companyId).eq("id", jobId);
  if (error) throw error;
}

export async function upsertJobStep(jobId: string, step: Partial<StepRow> & { id?: string }) {
  const supabase = createClient();
  const companyId = await getCurrentCompanyId();

  // insert
  if (!step.id) {
    const { data, error } = await supabase
      .from("job_steps")
      .insert({
        company_id: companyId,
        job_id: jobId,
        template_id: step.templateId ?? "",
        template_name: step.templateName ?? "Step",
        hours: Number(step.hours ?? 0),
        worker_name: step.workerName ?? "",
        step_order: Number(step.order ?? 1),
      })
      .select("id")
      .single();

    if (error) throw error;
    return String(data.id);
  }

  // update
  const { error } = await supabase
    .from("job_steps")
    .update({
      template_id: step.templateId ?? "",
      template_name: step.templateName ?? "Step",
      hours: Number(step.hours ?? 0),
      worker_name: step.workerName ?? "",
      step_order: Number(step.order ?? 1),
    })
    .eq("company_id", companyId)
    .eq("id", step.id)
    .eq("job_id", jobId);

  if (error) throw error;
  return step.id;
}

export async function deleteJobStep(stepId: string) {
  const supabase = createClient();
  const companyId = await getCurrentCompanyId();

  const { error } = await supabase.from("job_steps").delete().eq("company_id", companyId).eq("id", stepId);
  if (error) throw error;
}

// ✅ Schedule page needs this
export async function setJobDone(jobId: string, done: boolean) {
  const supabase = createClient();
  const companyId = await getCurrentCompanyId();

  const patch: any = done
    ? { status: "done", done_at: new Date().toISOString() }
    : { status: "planned", done_at: null };

  const { error } = await supabase.from("jobs").update(patch).eq("company_id", companyId).eq("id", jobId);
  if (error) throw error;
}
