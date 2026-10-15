/**
 * Proxy mot Nano Podcast API för inloggade användare: artikel om avsnittet och
 * frågor om avsnittet. Identiteten är Clerk-sessionens token — klienten kan
 * aldrig välja användare. Plan, kvoter och rate limits avgörs i podd-API:t
 * (nano-podcast), så de dubbleras inte här.
 *
 *   POST { action: "article" }          → hämta, eller starta generering (pollas tills ready)
 *   POST { action: "ask", question }    → fråga om avsnittet
 */
import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { callAsUser } from "@/lib/podcast/nano-api";
import { parseBody, z } from "@/lib/validation";

const Id = z.string().uuid();
const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("article") }),
  z.object({
    action: z.literal("ask"),
    question: z.string().trim().min(3).max(1000),
    conversationId: z.string().uuid().optional(),
  }),
]);

async function token(): Promise<string | null> {
  const { userId, getToken } = await auth();
  return userId ? await getToken() : null;
}

const errorCode = (body: unknown) =>
  (body as { error?: { code?: string } } | null)?.error?.code;

const unauthorized = () =>
  NextResponse.json({ error: { code: "UNAUTHENTICATED" } }, { status: 401 });

export async function POST(
  req: Request,
  { params }: { params: Promise<{ episodeId: string }> },
) {
  const { episodeId } = await params;
  if (!Id.safeParse(episodeId).success)
    return NextResponse.json(null, { status: 404 });
  const t = await token();
  if (!t) return unauthorized();
  const parsed = await parseBody(req, Body);
  if (!parsed.ok) return parsed.response;
  const b = parsed.data;
  if (b.action === "ask") {
    const r = await callAsUser(t, `/v1/episodes/${episodeId}/questions`, {
      method: "POST",
      body: {
        question: b.question,
        ...(b.conversationId ? { conversationId: b.conversationId } : {}),
      },
    });
    return NextResponse.json(r.body, { status: r.status });
  }
  const r = await callAsUser(t, `/v1/episodes/${episodeId}/summaries`, {
    method: "POST",
    body: { type: "article", language: "sv" },
  });
  // Saknas transkript beställs det (publicerat = gratis, annars dras användarens
  // transkriberingskvot). Beställningen är idempotent i API:t, så klientens
  // pollning dubbeldebiterar inte.
  if (r.status === 409 && errorCode(r.body) === "TRANSCRIPT_NOT_READY") {
    const tr = await callAsUser(
      t,
      `/v1/episodes/${episodeId}/transcript-requests`,
      { method: "POST" },
    );
    if (tr.status !== 202)
      return NextResponse.json(tr.body, { status: tr.status });
    return NextResponse.json({ status: "transcribing" }, { status: 202 });
  }
  return NextResponse.json(r.body, { status: r.status });
}
