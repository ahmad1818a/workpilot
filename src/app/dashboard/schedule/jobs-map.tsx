"use client";

import React from "react";

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

  dueDate: string;
  totalHours: number;
  status: JobStatus;
  createdAt: string;
  steps: Step[];

  // ✅ NEW
  priority?: JobPriority;
  lockDueDate?: boolean;
};

export default function JobsMap({
  jobs,
  selectedJobId,
  onSelectJobId,
  selectedJob,
  baseFinishText,
  safeFinishText,
}: {
  jobs: Job[];
  selectedJobId: string;
  onSelectJobId: (id: string) => void;
  selectedJob: Job | null;
  baseFinishText: (job: Job) => string;
  safeFinishText: (job: Job) => string;
}) {
  const address = selectedJob?.jobAddress?.trim() || "New Jersey";
  const q = encodeURIComponent(address);

  return (
    <div className="grid md:grid-cols-2 gap-0">
      {/* Left list */}
      <div className="p-3 bg-black/30 border-r border-white/10">
        <div className="text-sm font-bold mb-2">Jobs</div>

        <div className="space-y-2 max-h-[520px] overflow-auto pr-1">
          {jobs.map((j) => (
            <button
              key={j.id}
              onClick={() => onSelectJobId(j.id)}
              className={
                "w-full text-left rounded-xl border px-3 py-2 " +
                (j.id === selectedJobId
                  ? "border-sky-500 bg-sky-500/10"
                  : "border-white/10 bg-white/5 hover:bg-white/10")
              }
            >
              <div className="flex items-center justify-between gap-2">
                <div className="font-semibold">{j.name}</div>

                <div className="flex gap-1">
                  {j.lockDueDate ? (
                    <span className="text-[10px] px-2 py-0.5 rounded-full border border-sky-400/40 bg-sky-400/10 text-sky-200">
                      Locked
                    </span>
                  ) : null}

                  {j.priority === "high" ? (
                    <span className="text-[10px] px-2 py-0.5 rounded-full border border-amber-400/40 bg-amber-400/10 text-amber-200">
                      HIGH
                    </span>
                  ) : null}
                </div>
              </div>

              <div className="text-xs text-white/70 mt-1">
                Due: {j.dueDate || "—"} • Base: {baseFinishText(j)} •{" "}
                <span className="text-emerald-300">Safe: {safeFinishText(j)}</span>
              </div>
              <div className="text-xs text-white/50">📍 {j.jobAddress || "No address"}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Right map */}
      <div className="bg-black/10">
        <div className="p-3 border-b border-white/10">
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="font-semibold">{selectedJob?.name || "Map"}</div>
              <div className="text-xs text-white/70">{selectedJob?.jobAddress || "No address"}</div>
            </div>

            <div className="flex gap-1">
              {selectedJob?.lockDueDate ? (
                <span className="text-[10px] px-2 py-0.5 rounded-full border border-sky-400/40 bg-sky-400/10 text-sky-200">
                  Locked
                </span>
              ) : null}

              {selectedJob?.priority === "high" ? (
                <span className="text-[10px] px-2 py-0.5 rounded-full border border-amber-400/40 bg-amber-400/10 text-amber-200">
                  Priority HIGH
                </span>
              ) : null}
            </div>
          </div>

          {selectedJob?.jobAddress ? (
            <a
              className="text-xs text-sky-300 underline"
              target="_blank"
              rel="noreferrer"
              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                selectedJob.jobAddress
              )}`}
            >
              Open in Google Maps
            </a>
          ) : null}
        </div>

        <iframe
          title="map"
          className="w-full"
          style={{ height: 520 }}
          loading="lazy"
          src={`https://www.google.com/maps?q=${q}&output=embed`}
        />
      </div>
    </div>
  );
}
