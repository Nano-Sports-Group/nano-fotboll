/**
 * app/kronika/[slug]/page.tsx — publik läsvy för en publicerad krönika.
 * content_html renderas direkt (dangerouslySetInnerHTML): säkert eftersom
 * texten enbart kan komma från vår Tiptap-editor, vars ProseMirror-schema
 * bara känner till en fast uppsättning noder/marks (h1-3, p, listor, citat,
 * bold/italic) — okänd HTML (script, attribut) faller bort redan vid inklistring
 * i editorn, aldrig sparad. Inte fritextfält från allmänheten.
 */
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BrandBadge } from "@/components/brand/BrandBadge";
import { createServerClient } from "@/lib/supabase";
import { getSiteUrl } from "@/lib/site-url";

export const revalidate = 300;

interface ColumnRow {
  id: string;
  title: string;
  excerpt: string | null;
  content_html: string;
  author_clerk_user_id: string;
  published_at: string | null;
  team_entity_id: string | null;
}

async function getColumn(slug: string): Promise<ColumnRow | null> {
  const db = createServerClient();
  const { data } = await db
    .from("columns")
    .select("id, title, excerpt, content_html, author_clerk_user_id, published_at, team_entity_id")
    .eq("slug", slug)
    .eq("status", "published")
    .maybeSingle();
  return (data as ColumnRow | null) ?? null;
}

interface AuthorRow {
  nickname: string | null;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  verified: boolean;
}

async function getAuthor(clerkUserId: string): Promise<AuthorRow | null> {
  const db = createServerClient();
  const { data } = await db
    .from("profiles")
    .select("nickname, display_name, avatar_url, bio, verified")
    .eq("clerk_user_id", clerkUserId)
    .maybeSingle();
  return (data as AuthorRow | null) ?? null;
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const column = await getColumn(slug);
  if (!column) return { title: "Krönikan hittades inte" };
  return {
    title: `${column.title} — Nano Fotboll Krönika`,
    description: column.excerpt ?? undefined,
    alternates: { canonical: `${getSiteUrl()}/kronika/${slug}` },
    openGraph: { type: "article", title: column.title, description: column.excerpt ?? undefined },
  };
}

export default async function KronikaPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const column = await getColumn(slug);
  if (!column) notFound();
  const author = await getAuthor(column.author_clerk_user_id);
  const authorName = author?.nickname ?? author?.display_name ?? "Krönikör";

  return (
    <article className="mx-auto max-w-2xl px-4 sm:px-6 py-12">
      <p className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-pitch-ink">
        <BrandBadge kind="writer" size={14} /> Krönika
      </p>
      <h1 className="text-3xl sm:text-4xl font-bold leading-tight text-foreground text-balance">{column.title}</h1>

      <div className="mt-5 flex items-center gap-3">
        <span className="relative flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-card text-sm font-semibold text-muted-foreground ring-1 ring-border">
          {author?.avatar_url ? (
            <Image src={author.avatar_url} alt="" fill className="object-cover" sizes="36px" />
          ) : (
            authorName[0]?.toUpperCase()
          )}
        </span>
        <div className="text-sm">
          <span className="inline-flex items-center gap-1.5 font-semibold text-foreground">
            {authorName}
            <BrandBadge kind="writer" size={16} />
            {author?.verified && <BrandBadge kind="verified" size={16} />}
          </span>
          {column.published_at && (
            <span className="ml-2 text-muted-foreground">
              {new Date(column.published_at).toLocaleDateString("sv-SE", { timeZone: "Europe/Stockholm", day: "numeric", month: "long", year: "numeric" })}
            </span>
          )}
        </div>
      </div>

      <div
        className={[
          "mt-8 text-[16px] leading-relaxed text-foreground",
          "[&_h1]:mt-8 [&_h1]:mb-3 [&_h1]:text-2xl [&_h1]:font-bold",
          "[&_h2]:mt-7 [&_h2]:mb-2.5 [&_h2]:text-xl [&_h2]:font-bold",
          "[&_h3]:mt-6 [&_h3]:mb-2 [&_h3]:text-lg [&_h3]:font-semibold",
          "[&_p]:my-4 [&_ul]:my-4 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:my-4 [&_ol]:list-decimal [&_ol]:pl-6 [&_li]:my-1",
          "[&_blockquote]:my-5 [&_blockquote]:border-l-2 [&_blockquote]:border-pitch [&_blockquote]:pl-4 [&_blockquote]:text-muted-foreground [&_blockquote]:italic",
          "[&_hr]:my-8 [&_hr]:border-border",
        ].join(" ")}
        dangerouslySetInnerHTML={{ __html: column.content_html }}
      />

      {author?.bio && (
        <div className="mt-12 rounded-2xl border border-border bg-card p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">Om {authorName}</p>
          <p className="text-sm text-foreground/80 leading-relaxed">{author.bio}</p>
        </div>
      )}

      <Link href="/nyheter" className="mt-8 inline-block text-sm text-muted-foreground hover:text-foreground">
        ← Fler nyheter på Nano Fotboll
      </Link>
    </article>
  );
}
