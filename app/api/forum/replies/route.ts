import { forumAuthorName } from "@/lib/forum/author-name";
import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@clerk/nextjs/server";
import { createServerClient, isSupabaseConfigured } from "@/lib/supabase";
import { enforceRateLimit } from "@/lib/ratelimit";
import { parseBody, z } from "@/lib/validation";
import { sanitizeText } from "@/lib/sanitize";

const ReplySchema = z.object({
  thread_id: z.string().uuid("Ogiltigt thread_id"),
  content: z.string().trim().min(1, "content krävs").max(5000, "Svar får max vara 5000 tecken"),
  author_name: z.string().max(100).optional(),
});

export async function POST(req: NextRequest) {
  try {
    const user = await currentUser();
    if (!user) {
      return NextResponse.json({ message: "Ej inloggad" }, { status: 401 });
    }

    if (!isSupabaseConfigured()) {
      return NextResponse.json({ message: "DB ej konfigurerad" }, { status: 503 });
    }

    const blocked = await enforceRateLimit("write", req, user.id);
    if (blocked) return blocked;

    const parsed = await parseBody(req, ReplySchema);
    if (!parsed.ok) return parsed.response;
    // author_name i bodyn ignoreras: namnet kommer från sessionen (lib/forum/author-name).
    const { thread_id } = parsed.data;
    // author_id härleds ALLTID från sessionen — aldrig från klient-body (IDOR-skydd)
    const author_id = user.id;
    const content = sanitizeText(parsed.data.content);
    if (!content) {
      return NextResponse.json({ message: "content krävs" }, { status: 400 });
    }

    const supabase = createServerClient();

    // Kontrollera att tråden finns och ej är låst
    const { data: thread, error: threadErr } = await supabase
      .from("forum_threads")
      .select("id, locked")
      .eq("id", thread_id)
      .single();

    if (threadErr || !thread) {
      return NextResponse.json({ message: "Tråden hittades inte" }, { status: 404 });
    }
    if ((thread as { locked: boolean }).locked) {
      return NextResponse.json({ message: "Tråden är låst" }, { status: 403 });
    }

    const { data, error } = await supabase
      .from("forum_replies")
      .insert({
        thread_id,
        content: content.trim(),
        author_id,
        author_name: await forumAuthorName(user.id, user.firstName),
      })
      .select("id")
      .single();

    if (error) {
      console.error("[forum/replies] insert error:", error);
      return NextResponse.json({ message: "Databasfel" }, { status: 500 });
    }

    return NextResponse.json({ id: (data as { id: string }).id }, { status: 201 });
  } catch (err) {
    console.error("[forum/replies] unexpected error:", err);
    return NextResponse.json({ message: "Serverfel" }, { status: 500 });
  }
}
