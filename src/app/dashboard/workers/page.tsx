"use client";

import { useEffect, useMemo, useState } from "react";
import {
  listWorkers,
  createWorker,
  updateWorkerName,
  updateWorkerTemplate,
  deleteWorker,
  addWorkerAbsence,
  removeWorkerAbsence,
  type Worker,
  type DayKey,
  type WeeklyTemplate,
} from "@/lib/db";

const DAYS: { key: DayKey; label: string }[] = [
  { key: "mon", label: "Mon" },
  { key: "tue", label: "Tue" },
  { key: "wed", label: "Wed" },
  { key: "thu", label: "Thu" },
  { key: "fri", label: "Fri" },
  { key: "sat", label: "Sat" },
  { key: "sun", label: "Sun" },
];

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export default function WorkersPage() {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string>("");

  const [workers, setWorkers] = useState<Worker[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");

  const [newName, setNewName] = useState("");
  const [saving, setSaving] = useState(false);

  // Absence form
  const [absDate, setAbsDate] = useState("");
  const [absReason, setAbsReason] = useState("");

  const selected = useMemo(
    () => workers.find((w) => w.id === selectedId) ?? null,
    [workers, selectedId]
  );

  const refresh = async () => {
    setErr("");
    setLoading(true);
    try {
      const data = await listWorkers();
      setWorkers(data);
      if (!selectedId && data[0]?.id) setSelectedId(data[0].id);
      if (selectedId && !data.some((w) => w.id === selectedId)) {
        setSelectedId(data[0]?.id ?? "");
      }
    } catch (e: any) {
      setErr(e?.message ?? "Failed to load workers");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onCreate = async () => {
    const name = newName.trim();
    if (!name) return;

    setSaving(true);
    setErr("");
    try {
      const w = await createWorker(name);
      const next = [...workers, w];
      setWorkers(next);
      setSelectedId(w.id);
      setNewName("");
    } catch (e: any) {
      setErr(e?.message ?? "Create worker failed");
    } finally {
      setSaving(false);
    }
  };

  const onRename = async (workerId: string, name: string) => {
    setSaving(true);
    setErr("");
    try {
      await updateWorkerName(workerId, name);
      setWorkers((prev) => prev.map((w) => (w.id === workerId ? { ...w, name } : w)));
    } catch (e: any) {
      setErr(e?.message ?? "Rename failed");
    } finally {
      setSaving(false);
    }
  };

  const setTemplateField = (day: DayKey, patch: Partial<{ on: boolean; hours: number }>) => {
    if (!selected) return;

    const t: WeeklyTemplate = {
      days: { ...selected.template.days },
      hours: { ...selected.template.hours },
    };

    if (typeof patch.on === "boolean") t.days[day] = patch.on;
    if (typeof patch.hours === "number") t.hours[day] = clamp(patch.hours, 0, 24);

    // update UI immediately
    setWorkers((prev) => prev.map((w) => (w.id === selected.id ? { ...w, template: t } : w)));
  };

  const saveTemplate = async () => {
    if (!selected) return;
    setSaving(true);
    setErr("");
    try {
      await updateWorkerTemplate(selected.id, selected.template);
    } catch (e: any) {
      setErr(e?.message ?? "Save template failed");
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async (workerId: string) => {
    if (!confirm("Delete this worker?")) return;
    setSaving(true);
    setErr("");
    try {
      await deleteWorker(workerId);
      const next = workers.filter((w) => w.id !== workerId);
      setWorkers(next);
      setSelectedId(next[0]?.id ?? "");
    } catch (e: any) {
      setErr(e?.message ?? "Delete failed");
    } finally {
      setSaving(false);
    }
  };

  const addAbsence = async () => {
    if (!selected) return;
    if (!absDate) return;

    setSaving(true);
    setErr("");
    try {
      await addWorkerAbsence(selected.id, absDate, absReason);
      setAbsDate("");
      setAbsReason("");
      await refresh(); // reload to get new absence id
    } catch (e: any) {
      setErr(e?.message ?? "Add absence failed");
    } finally {
      setSaving(false);
    }
  };

  const removeAbsence = async (absenceId: string) => {
    if (!selected) return;
    setSaving(true);
    setErr("");
    try {
      await removeWorkerAbsence(absenceId);
      await refresh();
    } catch (e: any) {
      setErr(e?.message ?? "Remove absence failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold">Workers</h1>
          <p className="text-sm text-slate-300">
            Add workers • Weekly schedule template • Absences
          </p>
        </div>
        <button
          onClick={refresh}
          className="px-3 py-2 rounded-lg border border-slate-800 bg-slate-900/40 hover:bg-slate-800/40"
        >
          Refresh
        </button>
      </div>

      {err ? (
        <div className="mt-3 text-sm border border-red-500/30 bg-red-500/10 text-red-200 px-3 py-2 rounded-lg">
          {err}
        </div>
      ) : null}

      <div className="mt-4 grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Left: list */}
        <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-3">
          <div className="font-semibold mb-2">Workers List</div>

          <div className="flex gap-2">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="New worker name"
              className="w-full px-3 py-2 rounded-lg border border-slate-800 bg-slate-950/40 outline-none"
            />
            <button
              onClick={onCreate}
              disabled={saving || !newName.trim()}
              className={`px-3 py-2 rounded-lg border ${
                newName.trim()
                  ? "border-sky-500/30 bg-sky-500/10 text-sky-200 hover:bg-sky-500/20"
                  : "border-slate-800 bg-slate-900/30 text-slate-500"
              }`}
            >
              Add
            </button>
          </div>

          <div className="mt-3 space-y-2">
            {loading ? (
              <div className="text-sm text-slate-400">Loading…</div>
            ) : workers.length === 0 ? (
              <div className="text-sm text-slate-400">No workers yet</div>
            ) : (
              workers.map((w) => (
                <button
                  key={w.id}
                  onClick={() => setSelectedId(w.id)}
                  className={`w-full text-left px-3 py-2 rounded-lg border ${
                    w.id === selectedId
                      ? "border-sky-500/30 bg-sky-500/10"
                      : "border-slate-800 bg-slate-950/20 hover:bg-slate-900/30"
                  }`}
                >
                  <div className="font-medium">{w.name}</div>
                  <div className="text-xs text-slate-400">
                    Absences: {w.absences?.length ?? 0}
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Right: editor */}
        <div className="lg:col-span-2 rounded-xl border border-slate-800 bg-slate-900/40 p-3">
          {!selected ? (
            <div className="text-sm text-slate-400">Select a worker…</div>
          ) : (
            <>
              <div className="flex items-start justify-between gap-3">
                <div className="w-full">
                  <div className="text-sm font-semibold mb-1">Worker name</div>
                  <input
                    value={selected.name}
                    onChange={(e) =>
                      setWorkers((prev) =>
                        prev.map((x) =>
                          x.id === selected.id ? { ...x, name: e.target.value } : x
                        )
                      )
                    }
                    onBlur={() => onRename(selected.id, selected.name)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-800 bg-slate-950/40 outline-none"
                  />
                  <div className="text-xs text-slate-400 mt-1">
                    (Auto-save on blur)
                  </div>
                </div>

                <button
                  onClick={() => onDelete(selected.id)}
                  disabled={saving}
                  className="px-3 py-2 rounded-lg border border-red-500/30 bg-red-500/10 text-red-200 hover:bg-red-500/20"
                >
                  Delete
                </button>
              </div>

              {/* Weekly template */}
              <div className="mt-4">
                <div className="flex items-center justify-between">
                  <div className="font-semibold">Weekly Template</div>
                  <button
                    onClick={saveTemplate}
                    disabled={saving}
                    className="px-3 py-2 rounded-lg border border-sky-500/30 bg-sky-500/10 text-sky-200 hover:bg-sky-500/20"
                  >
                    Save Template
                  </button>
                </div>

                <div className="mt-2 overflow-x-auto">
                  <table className="w-full text-sm border border-slate-800 rounded-lg overflow-hidden">
                    <thead className="bg-slate-950/40">
                      <tr>
                        <th className="text-left p-2 border-b border-slate-800">Day</th>
                        <th className="text-left p-2 border-b border-slate-800">Working?</th>
                        <th className="text-left p-2 border-b border-slate-800">Hours</th>
                      </tr>
                    </thead>
                    <tbody>
                      {DAYS.map((d) => {
                        const on = !!selected.template.days[d.key];
                        const hrs = Number(selected.template.hours[d.key] ?? 0);
                        return (
                          <tr key={d.key} className="border-b border-slate-800">
                            <td className="p-2">{d.label}</td>
                            <td className="p-2">
                              <label className="inline-flex items-center gap-2">
                                <input
                                  type="checkbox"
                                  checked={on}
                                  onChange={(e) => setTemplateField(d.key, { on: e.target.checked })}
                                />
                                <span className="text-slate-300">{on ? "ON" : "OFF"}</span>
                              </label>
                            </td>
                            <td className="p-2">
                              <input
                                type="number"
                                min={0}
                                max={24}
                                step={0.5}
                                value={hrs}
                                onChange={(e) =>
                                  setTemplateField(d.key, { hours: Number(e.target.value) })
                                }
                                disabled={!on}
                                className="w-28 px-2 py-1 rounded border border-slate-800 bg-slate-950/40 outline-none disabled:opacity-40"
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="text-xs text-slate-400 mt-2">
                  Tip: Turn day OFF if worker doesn’t work that day.
                </div>
              </div>

              {/* Absences */}
              <div className="mt-6">
                <div className="font-semibold mb-2">Absences</div>

                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="date"
                    value={absDate}
                    onChange={(e) => setAbsDate(e.target.value)}
                    className="px-3 py-2 rounded-lg border border-slate-800 bg-slate-950/40 outline-none"
                  />
                  <input
                    value={absReason}
                    onChange={(e) => setAbsReason(e.target.value)}
                    placeholder="Reason (optional)"
                    className="flex-1 px-3 py-2 rounded-lg border border-slate-800 bg-slate-950/40 outline-none"
                  />
                  <button
                    onClick={addAbsence}
                    disabled={saving || !absDate}
                    className="px-3 py-2 rounded-lg border border-sky-500/30 bg-sky-500/10 text-sky-200 hover:bg-sky-500/20 disabled:opacity-50"
                  >
                    Add absence
                  </button>
                </div>

                <div className="mt-3 space-y-2">
                  {(selected.absences ?? []).length === 0 ? (
                    <div className="text-sm text-slate-400">No absences</div>
                  ) : (
                    [...(selected.absences ?? [])]
                      .sort((a, b) => (a.date || "").localeCompare(b.date || ""))
                      .map((a) => (
                        <div
                          key={a.id}
                          className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg border border-slate-800 bg-slate-950/20"
                        >
                          <div className="min-w-0">
                            <div className="text-sm font-medium">{a.date}</div>
                            {a.reason ? (
                              <div className="text-xs text-slate-400 truncate">{a.reason}</div>
                            ) : null}
                          </div>
                          <button
                            onClick={() => removeAbsence(a.id)}
                            disabled={saving}
                            className="px-3 py-1.5 rounded-lg border border-red-500/30 bg-red-500/10 text-red-200 hover:bg-red-500/20"
                          >
                            Remove
                          </button>
                        </div>
                      ))
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
