/**
 * lib/billing/routing.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Vilket köpflöde en klient får visa. Servern avgör ur `payment_routing_rules`; klienten visar
 * bara det den får tillbaka. Ren funktion — laddningen av reglerna bor i routing-rules.ts.
 *
 * Ordning: lägre `priority` först; vid lika, den mest specifika regeln (flest ifyllda fält).
 * Ett fält som är `null` eller `'*'` matchar allt.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export interface RoutingRule {
  priority: number;
  platform: string | null;
  country: string | null;
  storefront: string | null;
  min_app_version: string | null;
  product_type: string | null;
  program: string | null;
  flow: string;
  enabled: boolean;
}

export interface PurchaseContext {
  platform: string;
  country?: string | null;
  appVersion?: string | null;
  storefront?: string | null;
  productType?: string | null;
}

export interface PurchaseOption {
  flow: string;
  program?: string;
}

const wildcard = (v: string | null | undefined) => v == null || v === "" || v === "*";

function fieldMatches(ruleValue: string | null, actual: string | null | undefined): boolean {
  if (wildcard(ruleValue)) return true;
  return !!actual && actual.toLowerCase() === ruleValue!.toLowerCase();
}

/** Jämför punktade versioner segment för segment, numeriskt ("1.10.0" > "1.9.2"). */
export function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map((s) => Number.parseInt(s, 10) || 0);
  const pb = b.split(".").map((s) => Number.parseInt(s, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff < 0 ? -1 : 1;
  }
  return 0;
}

function specificity(rule: RoutingRule): number {
  return [rule.platform, rule.country, rule.storefront, rule.min_app_version, rule.product_type].filter((v) => !wildcard(v)).length;
}

export function resolvePurchaseOptions(rules: RoutingRule[], ctx: PurchaseContext): PurchaseOption[] {
  const matching = rules
    .filter((rule) => {
      if (!rule.enabled) return false;
      if (!fieldMatches(rule.platform, ctx.platform)) return false;
      if (!fieldMatches(rule.country, ctx.country)) return false;
      if (!fieldMatches(rule.storefront, ctx.storefront)) return false;
      if (!fieldMatches(rule.product_type, ctx.productType)) return false;
      // En regel med minsta version kräver att klienten säger vilken version den kör.
      if (!wildcard(rule.min_app_version) && (!ctx.appVersion || compareVersions(ctx.appVersion, rule.min_app_version!) < 0)) {
        return false;
      }
      return true;
    })
    .sort((a, b) => a.priority - b.priority || specificity(b) - specificity(a));

  const seen = new Set<string>();
  const options: PurchaseOption[] = [];
  for (const rule of matching) {
    if (seen.has(rule.flow)) continue;
    seen.add(rule.flow);
    options.push(rule.program ? { flow: rule.flow, program: rule.program } : { flow: rule.flow });
  }
  return options.length > 0 ? options : [{ flow: "not_available" }];
}
