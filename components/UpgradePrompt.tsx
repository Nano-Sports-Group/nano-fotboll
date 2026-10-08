import { requiredPlanFor, type AccessFeature } from "@/lib/access-rules";
import { ProductEventTracker } from "@/components/analytics/ProductEventTracker";
import { TrackedLink } from "@/components/analytics/TrackedLink";
import { TRIAL_DAYS, proPriceLabel, listMonthlyKr } from "@/lib/pricing";

const FEATURE_LABELS: Record<AccessFeature, string> = {
  basicFilter:        "grundfilter",
  advancedFilter:     "avancerade filter",
  articles:           "Artiklar",
  aiSummaries:        "AI-sammanfattningar",
  smartRanking:       "smart ranking",
  crossSourceCluster: "cross-source clustering",
  eliteBrief:         "daglig AI-brief för ditt lag",
  pushAlerts:         "push-notiser",
  unlimitedFeed:      "obegränsat flöde",
  aiChat:             "matchchatten",
  globalAiChat:       "Nano Fotboll AI",
  podcastClips:       "podcastkuratering",
  podcastAiChat:      "poddsammanfattning och frågor",
  briefAudio:         "lyssna på brief",
  forumSummary:       "forum-läget senaste timmarna",
  transferSignals:    "ryktesradar (Rykte/Bekräftad)",
};

export function UpgradePrompt({
  feature,
  teamName,
  founderPublic = false,
}: {
  feature: AccessFeature;
  /** Lag-kontext gör CTA:n personlig: "Missa inget om AIK" istället för generisk copy. */
  teamName?: string;
  /**
   * Får Founder nämnas? Kommer från potten via en server parent.
   *
   * Default `false` med flit: komponenten renderas från klientkomponenter som
   * inte kan läsa potten. Utan Founder-raden visas ordinarie 89 kr — alltid
   * sant. Med fel default hade vi lovat 69 kr långt efter att potten tagit
   * slut, vilket är ett prislöfte vi inte får bryta.
   */
  founderPublic?: boolean;
}) {
  const label = FEATURE_LABELS[feature] ?? feature;
  const requiredPlan = requiredPlanFor(feature);
  const founder = founderPublic;
  const price = proPriceLabel(founder);

  // Tokens, inte zinc-skalan: komponenten var hardkodad for morkt tema
  // (text-white + text-zinc-400/500) och matte 1.03:1 i ljust lage — pa en
  // betalvagg. Yta = bg-card, black = foreground/muted-foreground, bada
  // temamedvetna.
  return (
    <div className="rounded-xl border border-border bg-card px-5 py-6 text-center">
      <ProductEventTracker
        event="paywall_view"
        props={{ feature, surface: "upgrade_prompt" }}
        once={`paywall_view::${feature}`}
        onceScope="session"
      />
      {teamName && (
        <p className="text-sm font-semibold text-foreground mb-1">Missa inget om {teamName}</p>
      )}
      <p className="text-sm text-muted-foreground">
        <span className="font-medium text-foreground">{label}</span> — så du är först utan att scrolla.
        Kräver {requiredPlan === "elite" ? "Elite" : "PRO eller Elite"}.
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        {founder
          ? `Founder ${price} för alltid (ordinarie ${listMonthlyKr("pro")} kr) · ${TRIAL_DAYS} dagar gratis`
          : `${price} · ${TRIAL_DAYS} dagar gratis`}
      </p>
      <TrackedLink
        href="/prenumerera"
        event="paywall_cta_click"
        props={{ feature, surface: "upgrade_prompt", required_plan: requiredPlan }}
        className="mt-3 inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg bg-pitch px-4 py-2 text-sm font-medium text-white hover:opacity-90 transition-opacity"
      >
        {founder ? `Bli founder — ${price}` : `Prova ${TRIAL_DAYS} dagar`}
      </TrackedLink>
    </div>
  );
}
