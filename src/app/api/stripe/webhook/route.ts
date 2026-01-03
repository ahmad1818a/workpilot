export const runtime = "nodejs";

import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function mapStripeStatus(s: string) {
  if (s === "active" || s === "trialing") return s;
  if (s === "past_due") return "past_due";
  if (s === "canceled" || s === "unpaid" || s === "incomplete_expired") return "canceled";
  return "inactive";
}

function toIsoOrNull(unixSeconds: any) {
  if (typeof unixSeconds === "number" && unixSeconds > 0) {
    return new Date(unixSeconds * 1000).toISOString();
  }
  return null;
}

export async function POST(req: Request) {
  const sig = req.headers.get("stripe-signature");
  if (!sig) return NextResponse.json({ error: "Missing stripe-signature" }, { status: 400 });

  const body = await req.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }

  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;

      const company_id =
        (session.metadata?.company_id as string) ||
        (session.client_reference_id as string);

      const plan = (session.metadata?.plan as string) || "monthly";
      const customer = (session.customer as string) || null;
      const subscriptionId = (session.subscription as string) || null;

      if (!company_id || !subscriptionId) {
        return NextResponse.json({ error: "Missing company_id/subscription" }, { status: 400 });
      }

      const sub = await stripe.subscriptions.retrieve(subscriptionId);

      await supabaseAdmin.from("subscriptions").upsert({
        company_id,
        stripe_customer_id: customer,
        stripe_subscription_id: subscriptionId,
        status: mapStripeStatus(String(sub.status)),
        plan,
        current_period_end: toIsoOrNull((sub as any).current_period_end),
      });

      return NextResponse.json({ received: true });
    }

    if (
      event.type === "customer.subscription.updated" ||
      event.type === "customer.subscription.deleted"
    ) {
      const sub = event.data.object as Stripe.Subscription;

      const { data: row } = await supabaseAdmin
        .from("subscriptions")
        .select("company_id")
        .eq("stripe_subscription_id", sub.id)
        .maybeSingle();

      if (!row?.company_id) return NextResponse.json({ received: true });

      await supabaseAdmin
        .from("subscriptions")
        .update({
          status: mapStripeStatus(String(sub.status)),
          current_period_end: toIsoOrNull((sub as any).current_period_end),
        })
        .eq("company_id", row.company_id);

      return NextResponse.json({ received: true });
    }

    return NextResponse.json({ received: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Webhook handler error" }, { status: 500 });
  }
}
