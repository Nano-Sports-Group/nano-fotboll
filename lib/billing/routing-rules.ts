import "server-only";

import { unstable_cache } from "next/cache";
import { billingDb } from "./db";
import type { RoutingRule } from "./routing";

async function readRules(): Promise<RoutingRule[]> {
  const { data, error } = await billingDb()
    .from("payment_routing_rules")
    .select("priority, platform, country, storefront, min_app_version, product_type, program, flow, enabled")
    .eq("enabled", true);
  // Fail-closed: kan vi inte läsa reglerna erbjuder vi inget flöde (not_available) — aldrig ett gissat.
  if (error) throw new Error(`payment_routing_rules: ${error.message}`);
  return (data ?? []) as RoutingRule[];
}

/** 60 s, som founder-potten: en ändrad regel syns inom en minut utan att varje besök slår databasen. */
export const loadRoutingRules = unstable_cache(readRules, ["billing-routing-rules-v1"], {
  revalidate: 60,
  tags: ["billing-routing"],
});
