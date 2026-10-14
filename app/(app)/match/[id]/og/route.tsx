import { ImageResponse } from "next/og";
import { resolveMatchParam } from "@/lib/match/resolve";
import { createServerClient, isSupabaseConfigured } from "@/lib/supabase";
import { vertical, SPORT, SPORT_ACCENT } from "@/lib/vertical";

/**
 * Delningsbild per match (WhatsApp/Messenger/X), refereras från resolveShareMetadata.
 * Route handler, inte opengraph-image.tsx: filkonventionen ignoreras när sidans
 * generateMetadata sätter openGraph.images, och dess URL bär en hash.
 * Resultat om det finns, annars avsparkstid i Stockholm. Saknad data = döljs, aldrig 0–0.
 */
export const revalidate = 60;
const size = { width: 1200, height: 630 };

/** Ett ord som "Brommapojkarna" kan inte radbrytas — krymp i stället. */
const nameSize = (name: string): number => (name.length > 12 ? 40 : name.length > 8 ? 48 : 56);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const resolved = isSupabaseConfigured() ? await resolveMatchParam(id) : null;
  const { data } = resolved
    ? await createServerClient()
        .from("fixtures")
        .select("home_team_name,away_team_name,home_score,away_score,kickoff_at,competition")
        .eq("sport", SPORT)
        .eq("sportmonks_id", resolved.id)
        .maybeSingle()
    : { data: null };

  const home = data?.home_team_name ? String(data.home_team_name) : null;
  const away = data?.away_team_name ? String(data.away_team_name) : null;
  const hs = num(data?.home_score);
  const as = num(data?.away_score);
  const kickoff = data?.kickoff_at ? new Date(data.kickoff_at as string) : null;
  // ponytail: 00:00 UTC = Sportmonks "tid ej fastställd" — ingen svensk liga sparkar 02:00.
  const timeKnown = kickoff != null && (kickoff.getUTCHours() !== 0 || kickoff.getUTCMinutes() !== 0);
  const center =
    hs != null && as != null
      ? `${hs}–${as}`
      : timeKnown
        ? kickoff.toLocaleTimeString("sv-SE", {
            timeZone: "Europe/Stockholm",
            hour: "2-digit",
            minute: "2-digit",
          })
        : "–";
  const when = kickoff
    ? kickoff.toLocaleDateString("sv-SE", {
        timeZone: "Europe/Stockholm",
        weekday: "long",
        day: "numeric",
        month: "long",
      })
    : null;
  const top = [data?.competition ? String(data.competition) : vertical.leagueName, when].filter(Boolean).join(" · ");

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #09090b 0%, #18181b 60%, #0e2a20 100%)",
          color: "white",
          fontFamily: "sans-serif",
          padding: 60,
        }}
      >
        <div style={{ fontSize: 30, color: SPORT_ACCENT.light, display: "flex" }}>{top}</div>
        {home && away ? (
          <div style={{ display: "flex", alignItems: "center", width: "100%", marginTop: 40 }}>
            <div style={{ flex: 1, fontSize: nameSize(home), fontWeight: 800, textAlign: "right", display: "flex", justifyContent: "flex-end" }}>
              {home}
            </div>
            <div style={{ fontSize: 110, fontWeight: 800, margin: "0 36px", display: "flex" }}>{center}</div>
            <div style={{ flex: 1, fontSize: nameSize(away), fontWeight: 800, display: "flex" }}>{away}</div>
          </div>
        ) : null}
        <div style={{ fontSize: 34, fontWeight: 800, color: "#a1a1aa", marginTop: 56, display: "flex" }}>
          {vertical.wordmark}
        </div>
      </div>
    ),
    size,
  );
}
