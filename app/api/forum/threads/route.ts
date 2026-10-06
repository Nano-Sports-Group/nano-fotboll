import { forumAuthorName } from "@/lib/forum/author-name";
import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@clerk/nextjs/server";
import { createServerClient, isSupabaseConfigured } from "@/lib/supabase";
import { enforceRateLimit } from "@/lib/ratelimit";

export async function POST(req: NextRequest) {
  try {
    const user = await currentUser();
    if (!user) {
      return NextResponse.json({ message: "Ej inloggad" }, { status: 401 });
    }

    const blocked = await enforceRateLimit("write", req, user.id);
    if (blocked) return blocked;

    if (!isSupabaseConfigured()) {
      return NextResponse.json({ message: "DB ej konfigurerad" }, { status: 503 });
    }

    const body = await req.json() as {
      team_id?: string;
      title?: string;
      content?: string;
      author_id?: string;
      author_name?: string;
    };

    // author_name i bodyn ignoreras: namnet kommer från sessionen (lib/forum/author-name).
    const { team_id, title, content, author_id } = body;

    if (!team_id || !title?.trim() || !content?.trim()) {
      return NextResponse.json({ message: "Saknade fält: team_id, title, content" }, { status: 400 });
    }
    if (author_id !== user.id) {
      return NextResponse.json({ message: "Ogiltig author_id" }, { status: 403 });
    }
    if (title.trim().length < 3 || title.trim().length > 200) {
      return NextResponse.json({ message: "Rubrik måste vara 3–200 tecken" }, { status: 400 });
    }
    if (content.trim().length < 10 || content.trim().length > 10000) {
      return NextResponse.json({ message: "Innehåll måste vara 10–10000 tecken" }, { status: 400 });
    }

    const supabase = createServerClient();
    const { data, error } = await supabase
      .from("forum_threads")
      .insert({
        team_id,
        title: title.trim(),
        content: content.trim(),
        author_id,
        author_name: await forumAuthorName(user.id, user.firstName),
      })
      .select("id")
      .single();

    if (error) {
      console.error("[forum/threads] insert error:", error);
      return NextResponse.json({ message: "Databasfel" }, { status: 500 });
    }

    return NextResponse.json({ id: (data as { id: string }).id }, { status: 201 });
  } catch (err) {
    console.error("[forum/threads] unexpected error:", err);
    return NextResponse.json({ message: "Serverfel" }, { status: 500 });
  }
}
