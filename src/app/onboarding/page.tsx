"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function OnboardingPage() {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();

  const [companyName, setCompanyName] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");

  // لو عنده membership أصلاً، دخله الداشبورد
  useEffect(() => {
    const run = async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) return;

      const { data: membership } = await supabase
        .from("memberships")
        .select("company_id")
        .eq("user_id", data.user.id)
        .maybeSingle();

      if (membership?.company_id) router.push("/dashboard");
    };
    run();
  }, [router, supabase]);

  const createCompany = async () => {
    setMsg("");
    setLoading(true);
    try {
      if (!companyName.trim()) {
        setMsg("Enter company name.");
        return;
      }

      // RPC creates company + membership owner
      const { data, error } = await supabase.rpc("create_company_and_join", {
        p_name: companyName.trim(),
      });
      if (error) throw error;

      router.push("/dashboard");
    } catch (e: any) {
      setMsg(e?.message || "Failed to create company");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: 520, margin: "40px auto", padding: 16 }}>
      <h1 style={{ fontSize: 22, fontWeight: 800 }}>Create your company</h1>
      <p style={{ opacity: 0.8, marginTop: 6 }}>
        This will create a company and set you as the owner.
      </p>

      <div style={{ display: "grid", gap: 10, marginTop: 14 }}>
        <input
          placeholder="Company name (e.g., Modern Carpentry Design)"
          value={companyName}
          onChange={(e) => setCompanyName(e.target.value)}
          style={{ padding: 12, borderRadius: 10, border: "1px solid #ddd" }}
        />

        <button
          onClick={createCompany}
          disabled={loading}
          style={{
            padding: 12,
            borderRadius: 10,
            border: "none",
            background: "#111",
            color: "#fff",
            fontWeight: 700,
          }}
        >
          {loading ? "Creating..." : "Create company"}
        </button>

        {msg && (
          <div style={{ padding: 10, borderRadius: 10, background: "#f5f5f5", border: "1px solid #e5e5e5" }}>
            {msg}
          </div>
        )}
      </div>
    </div>
  );
}
