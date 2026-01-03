"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

const THEME = {
  pageBg: "bg-slate-950",
  pageText: "text-slate-100",
  subtle: "text-slate-300",
  cardBg: "bg-slate-900/60",
  border: "border-slate-800",
  blueText: "text-sky-300",
  blueBg: "bg-sky-500/15",
  blueBorder: "border-sky-500/25",
  dangerText: "text-red-300",
  dangerBg: "bg-red-500/10",
  dangerBorder: "border-red-500/25",
};

type Backup = {
  version: number;
  createdAt: string;
  keys: Record<string, any>;
};

const BACKUP_KEYS = [
  "zrschedule_jobs_v3",
  "zrschedule_workers_v1",
  "zr_workers_v2",
  "zrschedule_step_templates_v1",
];

function downloadText(filename: string, text: string) {
  const blob = new Blob([text], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

type CompanyInfo = {
  companyId: string;
  companyName: string;
  role: "owner" | "admin" | "member";
};

export default function SettingsPage() {
  const supabase = createClient();
  const fileRef = useRef<HTMLInputElement | null>(null);

  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  // Billing
  const [billingMsg, setBillingMsg] = useState("");
  const [billingErr, setBillingErr] = useState("");
  const [loadingPlan, setLoadingPlan] = useState<"monthly" | "yearly" | null>(null);

  // Company
  const [company, setCompany] = useState<CompanyInfo | null>(null);
  const [companyLoading, setCompanyLoading] = useState(true);
  const [companyErr, setCompanyErr] = useState("");
  const [companyMsg, setCompanyMsg] = useState("");
  const [companyNameDraft, setCompanyNameDraft] = useState("");
  const [savingCompany, setSavingCompany] = useState(false);

  // Invite
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteMsg, setInviteMsg] = useState("");
  const [inviteErr, setInviteErr] = useState("");
  const [inviting, setInviting] = useState(false);

  const presentKeys = useMemo(() => {
    if (typeof window === "undefined") return [];
    return BACKUP_KEYS.filter((k) => localStorage.getItem(k) != null);
  }, []);

  // ---------------- Load Company ----------------
  useEffect(() => {
    const run = async () => {
      setCompanyLoading(true);
      setCompanyErr("");
      try {
        const { data: s } = await supabase.auth.getSession();
        const user = s.session?.user;
        if (!user) {
          setCompany(null);
          return;
        }

        const { data: m, error: mErr } = await supabase
          .from("memberships")
          .select("company_id, role")
          .eq("user_id", user.id)
          .maybeSingle();

        if (mErr) throw mErr;
        if (!m?.company_id) {
          setCompany(null);
          return;
        }

        const { data: c, error: cErr } = await supabase
          .from("companies")
          .select("id, name")
          .eq("id", m.company_id)
          .single();

        if (cErr) throw cErr;

        setCompany({
          companyId: c.id,
          companyName: c.name,
          role: m.role || "member",
        });
        setCompanyNameDraft(c.name);
      } catch (e: any) {
        setCompanyErr(e?.message || "Failed to load company");
      } finally {
        setCompanyLoading(false);
      }
    };

    run();
  }, [supabase]);

  const canEditCompany = company?.role === "owner" || company?.role === "admin";

  const saveCompanyName = async () => {
    if (!company) return;
    const name = companyNameDraft.trim();
    if (!name) {
      setCompanyErr("Company name cannot be empty.");
      return;
    }

    setSavingCompany(true);
    setCompanyErr("");
    setCompanyMsg("");

    try {
      const { error } = await supabase
        .from("companies")
        .update({ name })
        .eq("id", company.companyId);

      if (error) throw error;

      setCompany({ ...company, companyName: name });
      setCompanyMsg("✅ Company name updated.");
    } catch (e: any) {
      setCompanyErr(e?.message || "Update failed");
    } finally {
      setSavingCompany(false);
    }
  };

  // ---------------- Invite via RPC ----------------
  const inviteUser = async () => {
    setInviteErr("");
    setInviteMsg("");

    const email = inviteEmail.trim().toLowerCase();
    if (!email) {
      setInviteErr("Email is required.");
      return;
    }

    setInviting(true);
    try {
      const { error } = await supabase.rpc("add_member_by_email", {
        p_email: email,
      });
      if (error) throw error;

      setInviteMsg("✅ User added to company.");
      setInviteEmail("");
    } catch (e: any) {
      setInviteErr(e?.message || "Invite failed");
    } finally {
      setInviting(false);
    }
  };

  // ---------------- Billing ----------------
  const startCheckout = async (plan: "monthly" | "yearly") => {
    setBillingErr("");
    setBillingMsg("");
    setLoadingPlan(plan);
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Checkout failed");
      window.location.href = data.url;
    } catch (e: any) {
      setBillingErr(e?.message || "Error");
    } finally {
      setLoadingPlan(null);
    }
  };

  // ---------------- Backup ----------------
  const exportBackup = () => {
    setErr("");
    setMsg("");
    try {
      const keys: Record<string, any> = {};
      for (const k of BACKUP_KEYS) {
        const raw = localStorage.getItem(k);
        if (raw) keys[k] = JSON.parse(raw);
      }
      const backup: Backup = {
        version: 1,
        createdAt: new Date().toISOString(),
        keys,
      };
      downloadText(
        `ZRSchedule_Backup_${backup.createdAt.slice(0, 10)}.json`,
        JSON.stringify(backup, null, 2)
      );
      setMsg("✅ Backup exported");
    } catch (e: any) {
      setErr(e?.message || "Export failed");
    }
  };

  const importBackup = async (file: File) => {
    setErr("");
    setMsg("");
    try {
      const text = await file.text();
      const data = JSON.parse(text) as Backup;
      for (const [k, v] of Object.entries(data.keys)) {
        localStorage.setItem(k, JSON.stringify(v));
      }
      setMsg("✅ Backup imported. Refresh page.");
    } catch (e: any) {
      setErr(e?.message || "Import failed");
    }
  };

  const clearAll = () => {
    if (!confirm("Delete all local data?")) return;
    BACKUP_KEYS.forEach((k) => localStorage.removeItem(k));
    setMsg("✅ Local data cleared");
  };

  return (
    <div className={`min-h-screen p-4 ${THEME.pageBg} ${THEME.pageText}`}>
      <div className="mx-auto max-w-3xl space-y-4">

        {/* COMPANY */}
        <div className={`rounded-2xl border ${THEME.border} ${THEME.cardBg} p-4`}>
          <h2 className="text-xl font-bold">Company</h2>

          {companyLoading ? (
            <div className={THEME.subtle}>Loading...</div>
          ) : company ? (
            <>
              <div className="mt-2 text-sm">Role: {company.role}</div>
              <div className="mt-3 flex gap-2">
                <input
                  value={companyNameDraft}
                  onChange={(e) => setCompanyNameDraft(e.target.value)}
                  disabled={!canEditCompany || savingCompany}
                  className="flex-1 rounded-lg border bg-slate-950/60 p-3"
                />
                <button
                  onClick={saveCompanyName}
                  disabled={!canEditCompany || savingCompany}
                  className="rounded-lg border px-4 py-2"
                >
                  {savingCompany ? "Saving..." : "Save"}
                </button>
              </div>
              {companyMsg && <div className="text-sky-300 mt-2">{companyMsg}</div>}
              {companyErr && <div className="text-red-300 mt-2">{companyErr}</div>}
            </>
          ) : (
            <div className="text-red-300">No company linked</div>
          )}
        </div>

        {/* TEAM */}
        <div className={`rounded-2xl border ${THEME.border} ${THEME.cardBg} p-4`}>
          <h2 className="text-xl font-bold">Team • Invite</h2>
          <div className="mt-3 flex gap-2">
            <input
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="user@email.com"
              className="flex-1 rounded-lg border bg-slate-950/60 p-3"
            />
            <button
              onClick={inviteUser}
              disabled={!canEditCompany || inviting}
              className="rounded-lg border px-4 py-2"
            >
              {inviting ? "Adding..." : "Add"}
            </button>
          </div>
          {inviteMsg && <div className="text-sky-300 mt-2">{inviteMsg}</div>}
          {inviteErr && <div className="text-red-300 mt-2">{inviteErr}</div>}
        </div>

        {/* BILLING */}
        <div className={`rounded-2xl border ${THEME.border} ${THEME.cardBg} p-4`}>
          <h2 className="text-xl font-bold">Billing</h2>
          <div className="mt-3 flex gap-2">
            <button onClick={() => startCheckout("monthly")}>Monthly</button>
            <button onClick={() => startCheckout("yearly")}>Yearly</button>
          </div>
          {billingErr && <div className="text-red-300 mt-2">{billingErr}</div>}
        </div>

        {/* BACKUP */}
        <div className={`rounded-2xl border ${THEME.border} ${THEME.cardBg} p-4`}>
          <h2 className="text-xl font-bold">Backup</h2>
          <div className="mt-3 flex gap-2">
            <button onClick={exportBackup}>Export</button>
            <button onClick={() => fileRef.current?.click()}>Import</button>
            <button onClick={clearAll}>Clear</button>
            <input
              ref={fileRef}
              type="file"
              hidden
              onChange={(e) => e.target.files && importBackup(e.target.files[0])}
            />
          </div>
          {msg && <div className="text-sky-300 mt-2">{msg}</div>}
          {err && <div className="text-red-300 mt-2">{err}</div>}
        </div>
      </div>
    </div>
  );
}
