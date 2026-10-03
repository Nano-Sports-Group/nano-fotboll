"use client";
import { Following } from "@/components/golf/Following";
import { SPORT, VERTICAL } from "@/lib/vertical";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useUser, useSignIn } from "@clerk/nextjs";
import { createClient } from "@supabase/supabase-js";
import { AnimatePresence, motion } from "motion/react";
import { Camera, Check, Loader2, Lock, Mail, KeyRound, ArrowRight, Sparkles } from "lucide-react";
import { type PublicProfile } from "@/components/profile/ProfileCard";
import { BrandBadge, AvatarWriterBadge } from "@/components/brand/BrandBadge";
import { ListGroup } from "@/components/ui/ListGroup";
import { ListRow } from "@/components/ui/ListRow";
import { useFavoriteTeam } from "@/hooks/useFavoriteTeam";
import { getTeamColors } from "@/lib/team-colors";
import { NewsletterPreferencesSettings } from "@/components/newsletter/NewsletterPreferencesSettings";

function WelcomePopup({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
    >
      <motion.div
        initial={{ y: 40, opacity: 0, scale: 0.96 }}
        animate={{ y: 0, opacity: 1, scale: 1 }}
        exit={{ y: 40, opacity: 0, scale: 0.96 }}
        transition={{ duration: 0.38, ease: [0.23, 1, 0.32, 1] }}
        className="w-full max-w-sm rounded-3xl border border-pitch/30 bg-background/95 backdrop-blur p-6 text-center shadow-2xl"
      >
        <div className="w-14 h-14 rounded-2xl bg-pitch/15 border border-pitch/30 flex items-center justify-center mx-auto mb-4">
          <Sparkles className="w-7 h-7 text-pitch-ink" />
        </div>
        <h2 className="font-semibold text-2xl text-foreground mb-2 text-balance">Välkommen ombord!</h2>
        <p className="text-sm text-muted-foreground mb-6 leading-relaxed">
          Din profil är skapad. Nu är det dags att se ditt personliga fotbollsflöde.
        </p>
        <button
          onClick={() => { onClose(); router.push("/feed"); }}
          className="w-full min-h-[50px] rounded-2xl pitch-gradient text-white font-semibold text-sm flex items-center justify-center gap-2 touch-manipulation"
        >
          Ta mig till mitt feed <ArrowRight className="w-4 h-4" />
        </button>
        <button
          onClick={onClose}
          className="mt-3 w-full min-h-[44px] text-sm text-muted-foreground hover:text-foreground transition-colors touch-manipulation"
        >
          Stanna här på profilen
        </button>
      </motion.div>
    </motion.div>
  );
}

interface Team { id: string; name: string; slug: string | null }

export function ProfilePageClient({
  initialProfile,
  email,
  firstName: initialFirst,
  lastName: initialLast,
  favouriteTeamId,
}: {
  initialProfile: PublicProfile;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  favouriteTeamId: string | null;
}) {
  const { user } = useUser();
  const { signIn } = useSignIn();
  const { setFavoriteTeam } = useFavoriteTeam();
  const searchParams = useSearchParams();
  const [showWelcome, setShowWelcome] = useState(searchParams.get("welcome") === "1");

  const [profile, setProfile] = useState<PublicProfile>(initialProfile);
  const [firstName, setFirstName] = useState(initialFirst ?? "");
  const [lastName, setLastName] = useState(initialLast ?? "");
  const [nickname, setNickname] = useState(initialProfile.nickname ?? "");
  const [bio, setBio] = useState(initialProfile.bio ?? "");

  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resetSent, setResetSent] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Lag-lista (Allsvenskan) för lagbyte. Matchas på slug (samma format som
  // Clerk-metadata/team-colors/forum author_team) — inte entities.id.
  const [teams, setTeams] = useState<Team[]>([]);
  const [teamSlug, setTeamSlug] = useState(favouriteTeamId ?? "");

  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
    if (!url || !key) return;
    const db = createClient(url, key);
    void db
      .from("entities")
      .select("id,name,slug,metadata")
      .eq("sport", SPORT)
      .eq("type", "team")
      .order("name")
      .then(({ data }) => {
        const rows = (data ?? []) as (Team & { metadata: Record<string, unknown> | null })[];
        const alls = rows.filter((t) => t.metadata?.["league"] === "Allsvenskan");
        setTeams(alls.length > 0 ? alls : rows);
      });
  }, []);

  async function saveProfile() {
    setSaving(true);
    setError(null);
    setSavedAt(false);
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ firstName, lastName, nickname, bio }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error ?? "Kunde inte spara");
        return;
      }
      setProfile((p) => ({
        ...p,
        nickname: nickname || null,
        bio: bio || null,
        display_name: [firstName, lastName].filter(Boolean).join(" ") || null,
      }));
      setSavedAt(true);
      setTimeout(() => setSavedAt(false), 2500);
    } finally {
      setSaving(false);
    }
  }

  async function onAvatarPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    setError(null);
    try {
      const res = await user.setProfileImage({ file });
      const newUrl = res.publicUrl ?? user.imageUrl;
      setProfile((p) => ({ ...p, avatar_url: newUrl }));
      await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ avatar_url: newUrl }),
      });
    } catch {
      setError("Kunde inte ladda upp bilden");
    }
  }

  async function changeTeam(newSlug: string) {
    setTeamSlug(newSlug);
    const team = teams.find((t) => (t.slug ?? t.id) === newSlug);
    if (!team) return;
    await setFavoriteTeam(team.slug ?? team.id);
    await fetch("/api/feed/config", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ followed_team_ids: [team.id] }),
    }).catch(() => {});
  }

  async function sendReset() {
    if (!signIn || !email) return;
    try {
      const params = {
        strategy: "reset_password_email_code",
        identifier: email,
      } as unknown as Parameters<typeof signIn.create>[0];
      await signIn.create(params);
      setResetSent(true);
    } catch {
      setError("Kunde inte skicka återställningsmail");
    }
  }

  const newsletterTeamSlug =
    (teams.find((team) => team.id === teamSlug)?.slug ?? teamSlug) || null;

  return (
    <>
      <AnimatePresence>
        {showWelcome && <WelcomePopup onClose={() => setShowWelcome(false)} />}
      </AnimatePresence>
    <div className="max-w-xl mx-auto px-4 sm:px-6 py-10 space-y-8">
      <h1 className="font-bold text-4xl text-foreground text-balance">MIN PROFIL</h1>

      {/* Profilkort med kamera-overlay direkt på avataren */}
      <ProfileCardEditable profile={profile} onPickFile={() => fileRef.current?.click()} />
      <input ref={fileRef} type="file" accept="image/*" hidden onChange={onAvatarPick} />

      {/* Redigera offentlig profil */}
      <section className="space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground text-balance">
          Offentlig profil
        </h2>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Förnamn" value={firstName} onChange={setFirstName} placeholder="Förnamn" />
          <Field label="Efternamn" value={lastName} onChange={setLastName} placeholder="Efternamn" />
        </div>

        <div>
          <Field
            label="Nickname (unikt)"
            value={nickname}
            onChange={(v) => setNickname(v.replace(/\s/g, ""))}
            placeholder="t.ex. hammarby_hampus"
            prefix="@"
          />
          <p className="mt-1 text-xs text-muted-foreground">3–20 tecken: bokstäver, siffror, _</p>
        </div>

        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1.5">Bio</label>
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value.slice(0, 280))}
            rows={3}
            placeholder="Berätta lite om dig..."
            className="w-full rounded-xl border border-border bg-card px-3 py-2.5 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
          />
          <p className="mt-1 text-right text-xs text-muted-foreground">{bio.length}/280</p>
        </div>

        {error && <p className="text-sm text-red-400">{error}</p>}

        <button
          onClick={saveProfile}
          disabled={saving}
          className="w-full min-h-11 rounded-xl bg-pitch text-white text-sm font-semibold flex items-center justify-center gap-2 transition-colors disabled:opacity-60"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : savedAt ? <Check className="h-4 w-4" /> : null}
          {saving ? "Sparar..." : savedAt ? "Sparat" : "Spara ändringar"}
        </button>
      </section>

      {/* Golf: det man följer är spelare och tourer, inte ett lag. */}
      {VERTICAL === "golf" && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground text-balance">
            Du följer
          </h2>
          <Following manage />
        </section>
      )}

      {/* Byt favoritlag */}
      <section className={VERTICAL === "golf" ? "hidden" : "space-y-3"}>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground text-balance">
          Mitt lag
        </h2>
        <select
          value={teamSlug}
          onChange={(e) => changeTeam(e.target.value)}
          className="w-full rounded-xl border border-border bg-card px-3 py-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <option value="">Välj lag...</option>
          {teams.map((t) => (
            <option key={t.id} value={t.slug ?? t.id}>{t.name}</option>
          ))}
        </select>
      </section>

      <section className={VERTICAL === "golf" ? "hidden" : "space-y-3"}>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground text-balance">
          Nano Fotboll Lagbrief
        </h2>
        <div className="rounded-2xl border border-border bg-card p-4">
          <p className="mb-4 text-sm leading-relaxed text-muted-foreground">
            Det viktigaste om ditt lag i inkorgen, i den takt du väljer.
          </p>
          <NewsletterPreferencesSettings profileTeamSlug={newsletterTeamSlug} />
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground text-balance">
          Nyhetsintressen
        </h2>
        <Link
          href="/profil/intressen"
          className="flex min-h-11 items-center justify-between rounded-xl border border-border bg-card px-4 py-3 text-sm text-foreground hover:border-pitch/40 transition-colors"
        >
          <span>Välj transfers, skador, matcher m.m.</span>
          <ArrowRight className="h-4 w-4 text-muted-foreground" />
        </Link>
      </section>

      {/* Hemlig kontoinfo — ALDRIG offentlig */}
      <section className="space-y-3">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold uppercase tracking-wider text-muted-foreground text-balance">
          <Lock className="h-3.5 w-3.5" /> Privat kontoinfo
        </h2>
        <p className="text-xs text-muted-foreground">Detta visas aldrig för andra användare.</p>

        <ListGroup>
          <ListRow leading={<Mail />} title="E-post" trailing={<span className="text-foreground text-sm">{email ?? "–"}</span>} />
          <ListRow
            leading={<BrandBadge kind="verified" size={18} className="mt-0.5" />}
            title="Verifierad"
            trailing={
              <span className={profile.verified ? "text-[#1D9BF0] text-sm" : "text-muted-foreground text-sm"}>
                {profile.verified ? "Ja" : "Nej"}
              </span>
            }
          />
        </ListGroup>

        <button
          onClick={sendReset}
          disabled={resetSent}
          className="w-full min-h-11 rounded-xl border border-border text-sm font-medium text-foreground flex items-center justify-center gap-2 hover:bg-muted transition-colors disabled:opacity-60"
        >
          <KeyRound className="h-4 w-4" />
          {resetSent ? "Återställningsmail skickat" : "Återställ lösenord"}
        </button>
      </section>

      {/* Hantera konto */}
      <AccountManagement />
    </div>
    </>
  );
}

function Field({
  label, value, onChange, placeholder, prefix,
}: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; prefix?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-muted-foreground mb-1.5">{label}</label>
      <div className="flex items-center rounded-xl border border-border bg-card px-3 focus-within:ring-2 focus-within:ring-ring">
        {prefix && <span className="text-muted-foreground text-sm">{prefix}</span>}
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full bg-transparent py-2.5 text-sm text-foreground outline-none"
        />
      </div>
    </div>
  );
}

// ── Profilkort med kamera direkt på avataren ──────────────────────────────────
function ProfileCardEditable({ profile, onPickFile }: { profile: PublicProfile; onPickFile: () => void }) {
  const FALLBACK_GRADIENT = "linear-gradient(135deg, #4DA3FF 0%, #0B2A6B 100%)";
  const name = profile.nickname ?? profile.display_name ?? "Anonym";
  const isColumnist = profile.role === "columnist" || profile.role === "admin";
  const isAdmin = profile.role === "admin";
  function initials(n: string) { return n.split(" ").filter(Boolean).map((w) => w[0]?.toUpperCase() ?? "").join("").slice(0, 2); }
  function teamGradient(angle: number): string | null {
    if (!profile.favourite_team_id) return null;
    const c = getTeamColors(profile.favourite_team_id);
    const stops = c.gradientStops ?? [c.primary, c.secondary];
    return `linear-gradient(${angle}deg, ${stops.join(", ")})`;
  }

  return (
    <div className="overflow-hidden rounded-3xl border border-border bg-card shadow-sm">
      <div className="relative h-28" style={{ background: teamGradient(90) ?? FALLBACK_GRADIENT }} aria-hidden />
      <div className="flex flex-col items-center px-6 pb-7 -mt-12">
        {/* Avatar med kamera-overlay + lagfärgad ring */}
        <div className="relative">
          <div className="rounded-full p-[3px]" style={teamGradient(135) ? { background: teamGradient(135)! } : undefined}>
            <button
              onClick={onPickFile}
              className="group relative rounded-full ring-4 ring-card bg-card focus-visible:outline-none focus-visible:ring-pitch"
              aria-label="Byt profilbild"
            >
              {profile.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={profile.avatar_url} alt={name} className="h-24 w-24 rounded-full object-cover" />
              ) : (
                <div className="flex h-24 w-24 items-center justify-center rounded-full bg-muted text-2xl font-semibold text-muted-foreground">
                  {initials(name)}
                </div>
              )}
              {/* Overlay */}
              <span className="absolute inset-0 rounded-full bg-black/40 opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity flex items-center justify-center">
                <Camera className="w-6 h-6 text-white" />
              </span>
            </button>
          </div>
          {isColumnist && <AvatarWriterBadge className="ring-card" />}
        </div>

        <div className="mt-4 flex items-center gap-1.5">
          <h2 className="text-xl font-semibold text-foreground text-balance">{name}</h2>
          {profile.verified && <BrandBadge kind="verified" size="md" />}
          {isAdmin && <BrandBadge kind="star" size="md" />}
        </div>
        {isColumnist && (
          <span className="mt-0.5 text-xs font-semibold uppercase tracking-wide text-pitch-ink">Journalist</span>
        )}
        <p className="mt-1 text-xs text-muted-foreground">
          Tryck på bilden för att byta
        </p>
        {profile.bio && (
          <p className="mt-4 max-w-sm text-center text-sm leading-relaxed text-foreground/80">{profile.bio}</p>
        )}
      </div>
    </div>
  );
}

// ── Hantera konto ─────────────────────────────────────────────────────────────
function AccountManagement() {
  const { user } = useUser();
  const router = useRouter();
  const [portalLoading, setPortalLoading] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function openPortal() {
    setPortalLoading(true);
    try {
      const res = await fetch("/api/billing/portal", { method: "POST" });
      const { url } = (await res.json()) as { url?: string };
      if (url) window.location.href = url;
    } catch {}
    setPortalLoading(false);
  }

  async function deleteAccount() {
    if (!user) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      const response = await fetch("/api/profile", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmation: "RADERA" }),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error ?? "Kontot kunde inte raderas.");
      }
      router.push("/");
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : "Kontot kunde inte raderas.");
      setDeleting(false);
    }
  }

  return (
    <section className="space-y-3 pb-10">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground text-balance">
        Hantera konto
      </h2>

      <button
        onClick={openPortal}
        disabled={portalLoading}
        className="w-full min-h-11 rounded-xl border border-border text-sm font-medium text-foreground flex items-center justify-center gap-2 hover:bg-muted transition-colors disabled:opacity-60"
      >
        {portalLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        Hantera prenumeration (Stripe)
      </button>

      {!deleteConfirm ? (
        <button
          onClick={() => setDeleteConfirm(true)}
          className="w-full min-h-11 rounded-xl border border-red-900/40 text-sm font-medium text-red-400 flex items-center justify-center gap-2 hover:bg-red-950/20 transition-colors"
        >
          Avsluta mitt konto
        </button>
      ) : (
        <div className="rounded-xl border border-red-900/40 bg-red-950/10 p-4 space-y-3">
          <p className="text-sm text-red-300 text-center">
            Är du säker? Privat data raderas permanent och delade foruminlägg anonymiseras.
          </p>
          {deleteError && (
            <p role="alert" className="text-xs text-red-300 text-center">
              {deleteError}
            </p>
          )}
          <div className="flex gap-2">
            <button
              onClick={() => setDeleteConfirm(false)}
              className="flex-1 min-h-10 rounded-xl border border-border text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Avbryt
            </button>
            <button
              onClick={deleteAccount}
              disabled={deleting}
              className="flex-1 min-h-10 rounded-xl bg-red-600 text-sm font-semibold text-white flex items-center justify-center gap-2 hover:bg-red-500 transition-colors disabled:opacity-60"
            >
              {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Ja, radera konto
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
