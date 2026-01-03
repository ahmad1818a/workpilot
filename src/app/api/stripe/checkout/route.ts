export const runtime = "nodejs";

import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function POST(req: Request) {
  try {
    const { plan } = await req.json(); // "monthly" | "yearly"

    const price =
      plan === "yearly"
        ? process.env.STRIPE_PRICE_YEARLY!
        : process.env.STRIPE_PRICE_MONTHLY!;

    // ✅ Fix TS typing for cookies()
    const cookieStore = cookies() as any;
    const getAllCookies = () =>
      (cookieStore.getAll?.() ?? []).map((c: any) => ({
        name: c.name,
        value: c.value,
      }));

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return getAllCookies();
          },
          setAll() {
            // ✅ Route Handlers: لا نحتاج set cookies هنا
          },
        },
      }
    );

    const { data: userRes, error: userErr } = await supabase.auth.getUser();
    if (userErr) return NextResponse.json({ error: userErr.message }, { status: 401 });

    const user = userRes.user;
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: membership, error: mErr } = await supabase
      .from("memberships")
      .select("company_id, role")
      .eq("user_id", user.id)
      .maybeSingle();

    if (mErr) return NextResponse.json({ error: mErr.message }, { status: 400 });
    if (!membership?.company_id) {
      return NextResponse.json({ error: "No company for this user" }, { status: 400 });
    }

    if (membership.role && !["owner", "admin"].includes(membership.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      payment_method_types: ["card"],
      line_items: [{ price, quantity: 1 }],

      // ✅ Trial 10 days
      subscription_data: { trial_period_days: 10 },

      // ✅ Discount first 3 months ($2 coupon)
      discounts: [{ coupon: process.env.STRIPE_COUPON_3MO_2DOLLAR! }],

      success_url: `${appUrl}/dashboard/settings?paid=1`,
      cancel_url: `${appUrl}/dashboard/settings?canceled=1`,

      client_reference_id: membership.company_id,
      metadata: {
        company_id: membership.company_id,
        plan,
        user_id: user.id,
      },
    });

    return NextResponse.json({ url: session.url });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Checkout error" }, { status: 500 });
  }
}
