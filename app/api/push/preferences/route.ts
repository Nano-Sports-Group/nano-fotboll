import { SPORT } from "@/lib/vertical";
import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { enforceRateLimit } from "@/lib/ratelimit";
import { createServerClient, isSupabaseConfigured } from "@/lib/supabase";
import { parseBody, z } from "@/lib/validation";
import { NOTIFICATION_TYPES, isNotificationTypeId, resolveNotificationPrefs } from "@/lib/notification-types";

export const dynamic = "force-dynamic";

// Notistyper per sport. Identiteten kommer ur sessionen; valen skrivs med service_role till den
// egna profilraden. Svaret bär rubrik och beskrivning så att webb, iOS och Android ritar samma lista.

async function storedPrefs(userId: string): Promise<Record<string, unknown>> {
  const { data } = await createServerClient()
    .from("profiles")
    .select("notification_prefs")
    .eq("clerk_user_id", userId)
    .maybeSingle();
  const prefs = data?.notification_prefs;
  return prefs && typeof prefs === "object" ? (prefs as Record<string, unknown>) : {};
}

function respond(stored: Record<string, unknown>) {
  const enabled = new Map(resolveNotificationPrefs(stored, SPORT).map((p) => [p.id, p.enabled]));
  return NextResponse.json({
    types: NOTIFICATION_TYPES.map((t) => ({
      id: t.id,
      title: t.title,
      description: t.description,
      enabled: enabled.get(t.id) ?? t.defaultOn,
    })),
  });
}

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isSupabaseConfigured()) return NextResponse.json({ error: "DB ej konfigurerad" }, { status: 503 });
  return respond(await storedPrefs(userId));
}

const PatchSchema = z.object({
  type: z.string().refine(isNotificationTypeId, "Okänd notistyp"),
  enabled: z.boolean(),
});

export async function PATCH(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isSupabaseConfigured()) return NextResponse.json({ error: "DB ej konfigurerad" }, { status: 503 });

  const blocked = await enforceRateLimit("write", req, userId);
  if (blocked) return blocked;

  const parsed = await parseBody(req, PatchSchema);
  if (!parsed.ok) return parsed.response;

  // ponytail: läs-ändra-skriv utan lås. Två reglage inom samma millisekund kan skriva över varandra;
  // byt till en jsonb_set-RPC om det någonsin märks.
  const stored = await storedPrefs(userId);
  const forSport = stored[SPORT] && typeof stored[SPORT] === "object" ? (stored[SPORT] as Record<string, unknown>) : {};
  const next = { ...stored, [SPORT]: { ...forSport, [parsed.data.type]: parsed.data.enabled } };

  const { error } = await createServerClient()
    .from("profiles")
    .upsert({ clerk_user_id: userId, notification_prefs: next }, { onConflict: "clerk_user_id" });
  if (error) {
    console.error("[push/preferences PATCH]", error);
    return NextResponse.json({ error: "Kunde inte spara valet" }, { status: 500 });
  }
  return respond(next);
}
