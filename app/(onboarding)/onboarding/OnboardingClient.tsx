"use client";

/**
 * Onboarding — 3 steg (LAUNCH-06):
 * 1) Välj lag → 2) Se riktig värdepreview → 3) Notiser (valfritt)
 * Upgrade flyttas till efter demonstrerat värde (/prenumerera).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { ArrowLeft, ArrowRight, Bell, Check, Loader2, RotateCw } from "lucide-react";
import { useFavoriteTeam } from "@/hooks/useFavoriteTeam";
import { usePushPermission, useServiceWorker } from "@/hooks/usePwa";
import { createClient } from "@/lib/supabase-browser";
import { trackEvent } from "@/lib/track";
import { getSiteHost } from "@/lib/site-url";

interface Team {
  id: string;
  name: string;
  slug: string | null;
  metadata: Record<string, unknown> | null;
}

type Preview = {
  team: { name: string; slug: string };
  position: number | null;
  form: ("W" | "D" | "L")[];
  nextMatch: { home: string; away: string; kickoffAt: string } | null;
  news: { id: string; title: string }[];
};

const TOTAL_STEPS = 3;
const LOAD_TIMEOUT_MS = 8000;

const STEP_TITLES = ["Välj ditt lag", "Din startsida", "Notiser"];

const slideVariants = {
  enter: (dir: number) => ({ x: dir > 0 ? 40 : -40, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (dir: number) => ({ x: dir > 0 ? -40 : 40, opacity: 0 }),
};

function Progress({ step, total }: { step: number; total: number }) {
  return (
    <div className="flex-1 flex gap-1.5">
      {Array.from({ length: total }, (_, i) => (
        <div
          key={i}
          aria-hidden
          className={`h-1 flex-1 rounded-full transition-colors ${
            i <= step ? "bg-pitch" : "bg-border"
          }`}
        />
      ))}
      {/* Staplarna är dekor för seende. Skärmläsare fick tidigare ingen
          lägesangivelse alls eftersom hela raden var aria-hidden. */}
      <p className="sr-only" aria-live="polite">
        Steg {step + 1} av {total}: {STEP_TITLES[step]}
      </p>
    </div>
  );
}

function formatKickoff(iso: string): string {
  return new Date(iso).toLocaleString("sv-SE", {
    timeZone: "Europe/Stockholm",
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Form som W/O/F-prickar. Visas bara när riktig form finns. */
function FormDots({ form }: { form: ("W" | "D" | "L")[] }) {
  const label = { W: "Vinst", D: "Oavgjort", L: "Förlust" } as const;
  return (
    <div className="mt-2 flex items-center gap-1">
      {form.slice(-5).map((r, i) => (
        <span
          key={i}
          title={label[r]}
          aria-label={label[r]}
          className={`h-2 w-2 rounded-full ${
            r === "W" ? "bg-success" : r === "L" ? "bg-destructive" : "bg-muted-foreground/40"
          }`}
        />
      ))}
    </div>
  );
}

/**
 * `presetTeam` kommer från waitlist-speglingen i `user.created`. Finns det ett
 * lag startar wizarden på steg 2 — lagsteget är redan besvarat.
 */
export function OnboardingClient({ presetTeam = null }: { presetTeam?: string | null } = {}) {
  const router = useRouter();
  const { setFavoriteTeam, markOnboardingDone } = useFavoriteTeam();
  // Service workern måste vara registrerad innan pushManager.subscribe kan köra.
  useServiceWorker();
  const { status: pushStatus, isSubscribed, requestPermission } = usePushPermission();

  const [step, setStep] = useState(presetTeam ? 1 : 0);
  const [dir, setDir] = useState(1);
  const [teams, setTeams] = useState<Team[]>([]);
  const [selectedTeam, setSelectedTeam] = useState<string | null>(presetTeam);
  const [loadFailed, setLoadFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewFailed, setPreviewFailed] = useState(false);
  const [pushPending, setPushPending] = useState(false);
  const [pushFailed, setPushFailed] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const firstRender = useRef(true);

  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- startar en hämtning; laddnings-/felflaggan sätts synkront innan fetch (synk mot externt system).
      setLoadFailed(true);
      return;
    }
    let cancelled = false;
    timeoutRef.current = setTimeout(() => {
      if (!cancelled) setLoadFailed(true);
    }, LOAD_TIMEOUT_MS);
    const db = createClient();
    void db
      .from("entities")
      .select("id, name, slug, metadata")
      .eq("type", "team")
      .order("name")
      .then(({ data, error }) => {
        if (cancelled) return;
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
          timeoutRef.current = null;
        }
        if (error || !data || data.length === 0) {
          setLoadFailed(true);
          return;
        }
        const filtered = (data as Team[]).filter(
          (t) => (t.metadata?.["league"] as string | undefined) === "Allsvenskan",
        );
        setTeams(filtered.length > 0 ? filtered : (data as Team[]));
        // Svaret kan komma efter timeouten. Utan den här raden visades
        // "Kunde inte ladda lagen" ovanpå en fullt laddad laglista.
        setLoadFailed(false);
      });
    return () => {
      cancelled = true;
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [reloadKey]);

  // Fokus följer med till det nya steget. Knappen man klickade avmonteras, så
  // utan detta hamnade fokus på <body> och skärmläsaren tappade sammanhanget.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    headingRef.current?.focus();
  }, [step]);

  const teamObj = teams.find((t) => (t.slug ?? t.id) === selectedTeam);

  const goTo = (next: number) => {
    setDir(next > step ? 1 : -1);
    setStep(next);
  };

  const loadPreview = useCallback(async (slug: string) => {
    setPreviewFailed(false);
    setPreviewLoading(true);
    try {
      const res = await fetch(`/api/team/${encodeURIComponent(slug)}/hub`);
      if (!res.ok) throw new Error(String(res.status));
      setPreview((await res.json()) as Preview);
    } catch {
      // Tyst fel gav tidigare texten "Preview laddas när laget är sparat" —
      // vilseledande, för laget ÄR sparat. Nu ett ärligt fel med omförsök.
      setPreviewFailed(true);
    } finally {
      setPreviewLoading(false);
    }
  }, []);

  async function chooseTeam(slug: string, team: Team) {
    // Aktiveringssteget. ICP:n pekar ut "favoritlag valt + push på inom 24 h" som
    // produktens viktigaste mätpunkt, men eventet fanns bara som namn i
    // FUNNEL_EVENTS och skickades ingenstans — aktiveringsgraden gick inte att mäta.
    trackEvent("onboarding_team_selected", { team_slug: slug, team_id: team.id });

    setSelectedTeam(slug);
    setSaving(true);
    goTo(1);
    try {
      await setFavoriteTeam(slug, team.id);
    } catch {
      // Lagvalet ligger redan i localStorage; server-synk kan komma ikapp.
    } finally {
      setSaving(false);
    }
    await loadPreview(slug);
  }

  async function enableNotifications() {
    setPushPending(true);
    setPushFailed(false);
    try {
      // Använder samma väg som resten av appen. Onboarding hade en egen
      // variant som bara frågade om lov och sedan POSTade utan body — den
      // registrerade aldrig någon prenumeration, så "Aktiverade" var en lögn
      // och användaren fick aldrig en enda notis.
      const ok = await requestPermission(teamObj ? [teamObj.id] : []);
      if (!ok) setPushFailed(true);
    } finally {
      setPushPending(false);
    }
  }

  async function finish() {
    // Skickas före router.push. trackEvent använder keepalive, så eventet
    // överlever navigeringen — utan det tappas just det mest värdefulla steget.
    trackEvent("onboarding_complete", {
      team_slug: selectedTeam ?? null,
      skipped_team: selectedTeam ? false : true,
      push_status: pushStatus ?? "unknown",
    });

    setSaving(true);
    try {
      if (!selectedTeam) markOnboardingDone();
      router.push(selectedTeam ? "/mitt-lag" : "/nyheter");
    } finally {
      setSaving(false);
    }
  }

  const pushDenied = pushStatus === "denied";
  const pushUnsupported = pushStatus === "unsupported";
  // Serverns VAPID-nyckel saknas — inget användaren kan göra åt, och inte
  // samma sak som ett nekande. Utan egen text blev de två omöjliga att skilja.
  const pushUnconfigured = pushStatus === "unconfigured";

  const heading = (text: string) => (
    <h1
      ref={headingRef}
      tabIndex={-1}
      className="font-heading text-3xl text-foreground mt-2 mb-2 text-balance focus:outline-none"
    >
      {text}
    </h1>
  );

  return (
    <div id="main" tabIndex={-1} className="fixed inset-0 z-50 flex flex-col bg-background focus:outline-none">
      <div className="flex items-center gap-3 px-5 pt-[max(env(safe-area-inset-top),1.5rem)] pb-4 shrink-0">
        {step > 0 && (
          <button
            type="button"
            onClick={() => goTo(step - 1)}
            aria-label="Tillbaka till föregående steg"
            className="min-h-[44px] flex items-center text-muted-foreground hover:text-foreground transition-colors touch-manipulation shrink-0"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
          </button>
        )}
        <Progress step={step} total={TOTAL_STEPS} />
        {/* Även första steget har en väg ut. Tidigare gick det bara att komma
            vidare genom att välja ett lag. */}
        <button
          type="button"
          onClick={() => void finish()}
          disabled={saving}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors touch-manipulation min-h-[44px] flex items-center shrink-0 disabled:opacity-50"
        >
          Hoppa över
        </button>
      </div>

      <div className="flex-1 overflow-hidden relative">
        <AnimatePresence custom={dir} mode="wait">
          {step === 0 && (
            <motion.div
              key="step-0"
              custom={dir}
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.28 }}
              className="absolute inset-0 flex flex-col px-5 pb-8 overflow-y-auto"
            >
              {heading("Välj ditt lag")}
              <p className="text-sm text-muted-foreground mb-6">
                Du får brief, matchdag och forum för just dem.
              </p>
              {loadFailed ? (
                <div>
                  <p className="text-sm text-destructive-ink">Kunde inte ladda lagen.</p>
                  <button
                    type="button"
                    onClick={() => {
                      setLoadFailed(false);
                      setReloadKey((k) => k + 1);
                    }}
                    className="mt-3 inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-border bg-card px-4 text-sm font-medium text-foreground hover:border-pitch/40 transition-colors touch-manipulation"
                  >
                    <RotateCw className="h-4 w-4" aria-hidden /> Försök igen
                  </button>
                </div>
              ) : teams.length === 0 ? (
                <div className="grid grid-cols-2 gap-2" aria-label="Laddar lag" aria-busy>
                  {Array.from({ length: 16 }, (_, i) => (
                    <div key={i} className="h-[52px] rounded-xl bg-muted skeleton-wave" />
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  {teams.map((t) => {
                    const slug = t.slug ?? t.id;
                    const active = selectedTeam === slug;
                    return (
                      <button
                        key={t.id}
                        type="button"
                        disabled={saving}
                        onClick={() => void chooseTeam(slug, t)}
                        className={`min-h-[52px] rounded-xl border px-3 py-3 text-left text-sm font-medium touch-manipulation transition-colors disabled:opacity-60 ${
                          active
                            ? "border-pitch bg-pitch/10 text-foreground"
                            : "border-border bg-card text-foreground hover:border-pitch/40"
                        }`}
                      >
                        {t.name}
                      </button>
                    );
                  })}
                </div>
              )}
            </motion.div>
          )}

          {step === 1 && (
            <motion.div
              key="step-1"
              custom={dir}
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.28 }}
              className="absolute inset-0 flex flex-col px-5 pb-8 overflow-y-auto"
            >
              {heading(`Så här ser ${preview?.team.name ?? teamObj?.name ?? "ditt lag"} ut`)}
              <p className="text-sm text-muted-foreground mb-6">
                Riktig data — ingen demo. Det här är din startsida.
              </p>

              {previewLoading && !preview ? (
                <div className="space-y-4" aria-label="Hämtar laget" aria-busy>
                  <div className="h-[76px] rounded-2xl bg-muted skeleton-wave" />
                  <div className="h-[92px] rounded-2xl bg-muted skeleton-wave" />
                  <div className="h-[112px] rounded-2xl bg-muted skeleton-wave" />
                </div>
              ) : null}

              {preview ? (
                <div className="space-y-4">
                  {preview.position != null ? (
                    <div className="rounded-2xl border border-border bg-card px-4 py-3">
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">Tabell</p>
                      <p className="text-2xl font-semibold font-mono tabular-nums mt-1">
                        {preview.position}
                        <span className="text-sm font-normal text-muted-foreground"> / 16</span>
                      </p>
                      {preview.form?.length > 0 ? <FormDots form={preview.form} /> : null}
                    </div>
                  ) : null}
                  {preview.nextMatch ? (
                    <div className="rounded-2xl border border-border bg-card px-4 py-3">
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">Nästa match</p>
                      <p className="font-semibold mt-1">
                        {preview.nextMatch.home} – {preview.nextMatch.away}
                      </p>
                      <p className="text-sm text-muted-foreground font-mono tabular-nums mt-0.5">
                        {formatKickoff(preview.nextMatch.kickoffAt)}
                      </p>
                    </div>
                  ) : null}
                  <div className="rounded-2xl border border-border bg-card px-4 py-3">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Nyheter</p>
                    {preview.news.length === 0 ? (
                      <p className="text-sm text-muted-foreground">Inga nyheter just nu.</p>
                    ) : (
                      <ul className="space-y-2">
                        {preview.news.slice(0, 3).map((n) => (
                          <li key={n.id} className="text-sm font-medium line-clamp-2">
                            {n.title}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              ) : previewFailed ? (
                <div className="rounded-2xl border border-border bg-card px-4 py-4">
                  <p className="text-sm text-foreground">
                    Ditt lag är sparat, men förhandsvisningen kunde inte hämtas.
                  </p>
                  <button
                    type="button"
                    onClick={() => selectedTeam && void loadPreview(selectedTeam)}
                    className="mt-3 inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-border px-4 text-sm font-medium text-foreground hover:border-pitch/40 transition-colors touch-manipulation"
                  >
                    <RotateCw className="h-4 w-4" aria-hidden /> Försök igen
                  </button>
                </div>
              ) : null}

              <button
                type="button"
                onClick={() => goTo(2)}
                className="mt-auto w-full min-h-[54px] rounded-2xl pitch-gradient text-white font-semibold flex items-center justify-center gap-2 touch-manipulation"
              >
                Fortsätt <ArrowRight className="w-4 h-4" aria-hidden />
              </button>
            </motion.div>
          )}

          {step === 2 && (
            <motion.div
              key="step-2"
              custom={dir}
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.28 }}
              className="absolute inset-0 flex flex-col px-5 pb-8 overflow-y-auto"
            >
              {heading("Notiser")}
              <p className="text-sm text-muted-foreground mb-8">
                Valfritt. Få push när ditt lag har breaking news eller matchdag.
              </p>

              <div className="rounded-2xl border border-border bg-card px-5 py-5 flex items-start gap-3">
                <Bell className="h-5 w-5 text-pitch-ink shrink-0 mt-0.5" aria-hidden />
                <div>
                  <p className="text-sm font-semibold">Push-notiser</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Du kan alltid stänga av dem senare under Konto.
                  </p>
                  {isSubscribed ? (
                    <p className="mt-3 text-xs text-success inline-flex items-center gap-1">
                      <Check className="h-3.5 w-3.5" aria-hidden /> Aktiverade
                    </p>
                  ) : null}
                  {/* Alla utfall får besked. Tidigare stod knappen kvar utan ett
                      ord när webbläsaren nekade, och det såg ut som en bugg. */}
                  {!isSubscribed && pushUnsupported ? (
                    <p className="mt-3 text-xs text-muted-foreground">
                      Din webbläsare stöder inte push. Du hittar allt i appen ändå.
                    </p>
                  ) : null}
                  {!isSubscribed && pushDenied ? (
                    <p className="mt-3 text-xs text-muted-foreground">
                      Notiser är blockerade för {getSiteHost()}. Slå på dem i webbläsarens
                      inställningar om du ändrar dig.
                    </p>
                  ) : null}
                  {!isSubscribed && pushUnconfigured ? (
                    <p className="mt-3 text-xs text-muted-foreground">
                      Notiser är inte påslagna på Nano Fotbolls sida än. Det ligger på oss —
                      du behöver inte göra något.
                    </p>
                  ) : null}
                  {!isSubscribed && pushFailed && !pushDenied && !pushUnsupported && !pushUnconfigured ? (
                    <p className="mt-3 text-xs text-muted-foreground">
                      Notiserna kunde inte aktiveras just nu. Du kan slå på dem under Konto.
                    </p>
                  ) : null}
                </div>
              </div>

              <div className="mt-auto space-y-2">
                {!isSubscribed && !pushDenied && !pushUnsupported && !pushUnconfigured ? (
                  <button
                    type="button"
                    disabled={pushPending}
                    onClick={() => void enableNotifications()}
                    className="w-full min-h-[54px] rounded-2xl border border-pitch/40 text-pitch-ink font-semibold flex items-center justify-center gap-2 touch-manipulation disabled:opacity-60"
                  >
                    {pushPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
                    {pushFailed ? "Försök igen" : "Tillåt notiser"}
                  </button>
                ) : null}
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void finish()}
                  className="w-full min-h-[54px] rounded-2xl pitch-gradient text-white font-semibold flex items-center justify-center gap-2 touch-manipulation disabled:opacity-60"
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
                  {selectedTeam ? "Öppna Mitt lag" : "Öppna flödet"}
                </button>
                <p className="text-center text-xs text-muted-foreground pt-1">
                  PRO kommer efteråt — när du sett värdet.{" "}
                  <button
                    type="button"
                    className="text-pitch-ink hover:underline"
                    onClick={() => router.push("/prenumerera")}
                  >
                    Se priser
                  </button>
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
