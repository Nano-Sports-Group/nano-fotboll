import { SPORT } from "@/lib/vertical";
import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { jsonContract } from "@/lib/api-contract";
import { FeedConfigResponseSchema } from "@/lib/api-schemas";
import { enforceRateLimit } from "@/lib/ratelimit";

function getDb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env vars");
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const db = getDb();
    const { data, error } = await db
      .from("user_feed_config")
      .select("*")
      .eq("clerk_user_id", userId)
      .eq("sport", SPORT)
      .single();

    if (error && error.code !== "PGRST116") {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!data) {
      return NextResponse.json(null);
    }
    return jsonContract(FeedConfigResponseSchema, {
      content_types: Array.isArray(data.content_types)
        ? (data.content_types as string[])
        : null,
    });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const blocked = await enforceRateLimit("write", req, userId);
  if (blocked) return blocked;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Server-side allowlist — aldrig lita på klienten för premium-fält
  const allowed = ["followed_team_ids", "followed_leagues", "content_types"] as const;
  const update: Record<string, unknown> = { clerk_user_id: userId };
  for (const k of allowed) {
    if (k in body) update[k] = body[k];
  }
  // En rad per användare och sport — sporten kommer från deployen, aldrig från bodyn.
  update.sport = SPORT;

  try {
    const db = getDb();
    const { error } = await db
      .from("user_feed_config")
      .upsert(update, { onConflict: "clerk_user_id,sport" });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
