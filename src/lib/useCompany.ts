"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export function useCompany() {
  const supabase = createClient();

  const [company, setCompany] = useState<{
    id: string;
    name: string;
  } | null>(null);

  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const run = async () => {
      setLoading(true);

      const { data: session } = await supabase.auth.getSession();
      const user = session.session?.user;
      if (!user) {
        setLoading(false);
        return;
      }

      // 1) get membership
      const { data: membership } = await supabase
        .from("memberships")
        .select("company_id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (!membership) {
        setLoading(false);
        return;
      }

      // 2) get company
      const { data: company } = await supabase
        .from("companies")
        .select("id, name")
        .eq("id", membership.company_id)
        .single();

      setCompany(company ?? null);
      setLoading(false);
    };

    run();
  }, []);

  return { company, loading };
}
