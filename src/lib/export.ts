// lib/export.ts
import * as XLSX from "xlsx";
import { saveAs } from "file-saver";

export type ExportJob = {
  id: string;
  name: string;
  jobNumber?: string;
  jobAddress?: string;
  status?: string;
  dueDate?: string;
  finishBase?: string;
  finishSafe?: string;
};

function monthKey(ymd: string) {
  return ymd && ymd.length >= 7 ? ymd.slice(0, 7) : "";
}

export function exportScheduleToExcel(args: {
  fileName?: string;
  activeJobs: ExportJob[];
  doneJobs: ExportJob[];
}) {
  const { activeJobs, doneJobs } = args;

  const wb = XLSX.utils.book_new();

  // Work List
  const wsActive = XLSX.utils.json_to_sheet(
    activeJobs.map((j) => ({
      Name: j.name,
      Number: j.jobNumber || "",
      Address: j.jobAddress || "",
      Status: j.status || "",
      "Due Date": j.dueDate || "",
      "Finish (Base)": j.finishBase || "",
      "Finish (Safe)": j.finishSafe || "",
    }))
  );
  XLSX.utils.book_append_sheet(wb, wsActive, "Work List");

  // Completed
  const wsDone = XLSX.utils.json_to_sheet(
    doneJobs.map((j) => ({
      Name: j.name,
      Number: j.jobNumber || "",
      Address: j.jobAddress || "",
      "Finished On": j.finishBase || "",
    }))
  );
  XLSX.utils.book_append_sheet(wb, wsDone, "Completed");

  // Monthly sheets (Done)
  const byMonth = new Map<string, ExportJob[]>();
  for (const j of doneJobs) {
    const mk = monthKey(j.finishBase || "");
    if (!mk) continue;
    if (!byMonth.has(mk)) byMonth.set(mk, []);
    byMonth.get(mk)!.push(j);
  }

  const months = Array.from(byMonth.keys()).sort((a, b) => b.localeCompare(a));
  for (const m of months) {
    const rows = byMonth.get(m)!;
    const ws = XLSX.utils.json_to_sheet(
      rows.map((j) => ({
        Name: j.name,
        Number: j.jobNumber || "",
        Address: j.jobAddress || "",
        "Finished On": j.finishBase || "",
      }))
    );
    XLSX.utils.book_append_sheet(wb, ws, `Done ${m}`);
  }

  const out = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  const blob = new Blob([out], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });

  const safeName =
    args.fileName || `ZRSchedule_${new Date().toISOString().slice(0, 10)}.xlsx`;

  saveAs(blob, safeName);
}
