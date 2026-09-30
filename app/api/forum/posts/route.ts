import { SPORT, vertical, VERTICAL } from "@/lib/vertical";
import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@clerk/nextjs/server";
import { createServerClient, isSupabaseConfigured } from "@/lib/supabase";
import { enforceRateLimit } from "@/lib/ratelimit";
import { parseBody, z } from "@/lib/validation";
import { sanitizeText } from "@/lib/sanitize";
import { jsonContract } from "@/lib/api-contract";
import { ForumPostsResponseSchema } from "@/lib/api-schemas";
import { favoriteFromMeta } from "@/lib/favorite-meta";

const ForumPostSchema = z.object({
  content: z.string().trim().min(1, "content krävs").max(500, "Max 500 tecken"),
  parent_id: z.string().uuid().optional(),
  root_id: z.string().uuid().optional(),
  quoted_post_id: z.string().uuid().optional(),
  team_slug: z.string().max(100).optional(),
  sport: z.enum(["football", "hockey", "golf"]).default(SPORT),
  label: z.enum(["transfer", "taktik", "match", "rykte", "diskussion"]).nullable().optional(),
  article_id: z.string().uuid().nullable().optional(),
});

const MAX_FORUM_DEPTH = 2;

export async function GET(req: NextRequest) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ posts: [] });
  }
  try {
    const { searchParams } = new URL(req.url);
    const teamSlug = searchParams.get("teamSlug");
    const sport = searchParams.get("sport") ?? SPORT;
    const sort = searchParams.get("sort") ?? "hot";
    const rootId = searchParams.get("rootId");
    const postId = searchParams.get("postId");
    const articleId = searchParams.get("articleId");
    const uuidPattern =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (
      (rootId && !uuidPattern.test(rootId)) ||
      (postId && !uuidPattern.test(postId)) ||
      (articleId && !uuidPattern.test(articleId))
    ) {
      return NextResponse.json({ error: "Ogiltigt inläggs-id" }, { status: 400 });
    }

    const supabase = createServerClient();
    let q = supabase
      .from("forum_posts")
      .select("*")
      .eq("sport", sport)
      .eq("status", "published");

    if (postId) {
      q = q.eq("id", postId);
    } else if (rootId) {
      q = q.eq("root_id", rootId);
    } else {
      q = q.is("parent_id", null);
      if (teamSlug) q = q.eq("team_slug", teamSlug);
      if (articleId) q = q.eq("article_id", articleId);
    }

    if (sort === "hot") {
      q = q.order("hot_score", { ascending: false });
    } else {
      q = q.order("created_at", { ascending: false });
    }

    const { data, error } = await q.limit(50);
    if (error) throw error;
    return jsonContract(ForumPostsResponseSchema, { posts: data ?? [] });
  } catch (err) {
    console.error("[forum/posts GET]", err);
    return NextResponse.json({ posts: [] }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await currentUser();
    if (!user) return NextResponse.json({ message: "Ej inloggad" }, { status: 401 });

    if (!isSupabaseConfigured()) return NextResponse.json({ message: "DB ej konfigurerad" }, { status: 503 });

    // Rate limit per inloggad användare (skydd mot spam/missbruk vid skala)
    const blocked = await enforceRateLimit("write", req, user.id);
    if (blocked) return blocked;

    const parsed = await parseBody(req, ForumPostSchema);
    if (!parsed.ok) return parsed.response;
    const { parent_id, root_id, quoted_post_id, team_slug, sport, label, article_id } = parsed.data;
    const content = sanitizeText(parsed.data.content);
    if (!content) {
      return NextResponse.json({ message: "content krävs" }, { status: 400 });
    }

    const supabase = createServerClient();

    if (team_slug) {
      const { data: team } = await supabase
        .from("entities")
        .select("slug")
        .eq("type", "team")
        .eq("slug", team_slug)
        .eq("sport", SPORT).in("metadata->>league", [...vertical.leagueEntities])
        .maybeSingle();
      if (!team) {
        return NextResponse.json({ message: "Ogiltigt lag" }, { status: 400 });
      }
    }

    // Snapshot av profiles.role vid postningstillfället — driver krönikör-
    // badgen på avataren, samma denormaliseringsmönster som author_team.
    const { data: authorProfile } = await supabase
      .from("profiles")
      .select("role")
      .eq("clerk_user_id", user.id)
      .maybeSingle();

    let depth = 0;
    let resolvedRootId = root_id ?? null;
    if (parent_id) {
      const { data: parentPost } = await supabase
        .from("forum_posts")
        .select("depth, sport, root_id, id, status")
        .eq("id", parent_id)
        .maybeSingle();

      if (!parentPost || parentPost.status !== "published") {
        return NextResponse.json({ message: "Svarar på ett ogiltigt inlägg" }, { status: 400 });
      }
      if (parentPost.sport !== sport) {
        return NextResponse.json({ message: "Sport matchar inte tråden" }, { status: 400 });
      }
      if ((parentPost.depth ?? 0) >= MAX_FORUM_DEPTH) {
        return NextResponse.json(
          { message: "Maximalt svar-djup nått" },
          { status: 400 },
        );
      }

      depth = (parentPost.depth ?? 0) + 1;
      resolvedRootId = parentPost.root_id ?? parentPost.id;
      if (root_id && root_id !== resolvedRootId) {
        return NextResponse.json({ message: "Ogiltig tråd-referens" }, { status: 400 });
      }
    }

    if (quoted_post_id) {
      const { data: quotedPost } = await supabase
        .from("forum_posts")
        .select("id, status, sport")
        .eq("id", quoted_post_id)
        .maybeSingle();
      if (!quotedPost || quotedPost.status !== "published" || quotedPost.sport !== sport) {
        return NextResponse.json({ message: "Ogiltigt citerat inlägg" }, { status: 400 });
      }
    }

    const { data: post, error } = await supabase
      .from("forum_posts")
      .insert({
        content: content.trim(),
        parent_id: parent_id ?? null,
        root_id: resolvedRootId,
        quoted_post_id: quoted_post_id ?? null,
        team_slug: team_slug ?? null,
        sport,
        // ponytail: spreadas villkorligt så inserts fungerar även innan migrationen är applicerad
        ...(article_id ? { article_id } : {}),
        depth,
        label: label ?? null,
        author_id: user.id,
        author_name: user.fullName ?? user.username ?? "Anonym",
        author_avatar: user.imageUrl ?? null,
        // Supporteridentitet: "Nickname (DIF)" + lagfärgad avatarring i forumet
        author_team: favoriteFromMeta(user.unsafeMetadata as Record<string, unknown>, VERTICAL) ?? null,
        author_role: authorProfile?.role ?? null,
      })
      .select()
      .single();

    if (error) throw error;

    if (parent_id) {
      await supabase.rpc("increment_reply_count", { row_id: parent_id });

      // Notify parent post author (skip if replying to own post)
      const { data: parentPost } = await supabase
        .from("forum_posts")
        .select("author_id")
        .eq("id", parent_id)
        .maybeSingle();
      const parentAuthorId = (parentPost as { author_id: string | null } | null)?.author_id;
      if (parentAuthorId && parentAuthorId !== user.id) {
        try {
          await supabase.from("notifications").insert({
            user_id: parentAuthorId,
            type: "reply",
            actor_id: user.id,
            actor_name: user.fullName ?? user.username ?? "Anonym",
            post_id: (post as { id: string }).id,
          });
        } catch {}
      }
    }

    return NextResponse.json(post, { status: 201 });
  } catch (err) {
    console.error("[forum/posts POST]", err);
    return NextResponse.json({ message: "Serverfel" }, { status: 500 });
  }
}
