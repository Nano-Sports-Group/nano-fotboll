/**
 * app/artikel/[slug]/page.tsx — Artikeldetaljsida (owned/licensed only)
 * Link-only redirects to /nyhet/[slug] (LAUNCH-01 provenance).
 *
 * Inga tredjepartsbilder. Typografi, luft och korta stycken bär sidan
 * (mobil/tablet/desktop).
 */

import type { Metadata } from "next";
import { ShareButton } from "@/components/ui/ShareButton";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { MessageSquare } from "lucide-react";
import type { Article } from "@/lib/types";
import { ArticleScrollTracker } from "@/components/gamification/ArticleScrollTracker";
import {
  articlePublicPath,
  canPublishBody,
  resolveRightsStatus,
  sanitizeArticleForPublic,
} from "@/lib/provenance";
import {
  getArticleDiscussionCount,
  getPublicArticleBySlug,
} from "@/lib/articles/public-article";
import { getSiteUrl } from "@/lib/site-url";
import { AppBreadcrumbs } from "@/components/ui/AppBreadcrumbs";
import { jsonLd } from "@/lib/json-ld";
import { ArticleBody } from "@/components/news/ArticleBody";
import { calculateReadTime, formatDateRelative } from "@/lib/utils";
import { getWebsiteSettings } from "@/lib/website-settings.server";
import { resolveShareMetadata, toNextMetadata } from "@/lib/website-settings";

export const revalidate = 3600;

async function getRelatedArticles(articleId: string): Promise<Article[]> {
  try {
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_BASE_URL ?? getSiteUrl()}/api/related?id=${articleId}`,
      { next: { revalidate: 3600 } },
    );
    if (!res.ok) return [];
    const rows = (await res.json()) as Article[];
    return rows.map((a) => sanitizeArticleForPublic(a));
  } catch {
    return [];
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const article = await getPublicArticleBySlug(slug);

  if (!article) return { title: "Artikel hittades inte" };

  const rights = article.rightsStatus ?? resolveRightsStatus(article);
  if (!canPublishBody(rights)) {
    return {
      title: article.title,
      robots: { index: false, follow: true },
      alternates: { canonical: `${getSiteUrl()}/nyhet/${slug}` },
    };
  }

  const settings = await getWebsiteSettings();
  const share = resolveShareMetadata(settings, {
    kind: "article",
    title: article.title,
    summary: article.summary ?? null,
    path: `/artikel/${slug}`,
  });
  const meta = toNextMetadata(settings, share);
  return {
    ...meta,
    openGraph: {
      ...meta.openGraph,
      type: "article",
      publishedTime: article.publishedAt,
    },
  };
}

function ArticleJsonLd({ article }: { article: Article }) {
  const data = {
    "@context": "https://schema.org",
    "@type": "NewsArticle",
    headline: article.title,
    description: article.summary,
    datePublished: article.publishedAt,
    ...(article.updatedAt ? { dateModified: article.updatedAt } : {}),
    author: {
      "@type": "Organization",
      name: "Nano Fotboll",
    },
    publisher: {
      "@type": "Organization",
      name: "Nano Fotboll",
      url: getSiteUrl(),
    },
    url: `${getSiteUrl()}/artikel/${article.slug}`,
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: jsonLd(data) }}
    />
  );
}

function byline(article: Article): string {
  if (article.isAthopiaGenerated) return "Nano Fotboll";
  if (article.sourceName === "Nano Fotboll AI") return "Nano Fotboll";
  return article.sourceName;
}

export default async function ArtikelPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const article = await getPublicArticleBySlug(slug);
  if (!article) notFound();

  const rights = article.rightsStatus ?? resolveRightsStatus(article);
  if (!canPublishBody(rights)) {
    redirect(`/nyhet/${slug}`);
  }

  const [relatedArticles, discussionCount] = await Promise.all([
    getRelatedArticles(article.id),
    getArticleDiscussionCount(article.id),
  ]);

  const teamEntity = article.entities?.find((e) => e.type === "team" && e.slug);
  const forumHref = teamEntity
    ? `/forum/${teamEntity.slug}?artikel=${article.id}`
    : "/forum";
  const readTime = calculateReadTime(article.content ?? article.summary);
  const source = byline(article);

  return (
    <>
      <ArticleJsonLd article={article} />
      <ArticleScrollTracker articleType="match_report" />

      <article className="mx-auto w-full max-w-[40rem] px-5 sm:px-6 pt-6 sm:pt-10 pb-28">
        <div className="mb-6">
          <AppBreadcrumbs
            items={[
              { label: "Flöde", href: "/nyheter" },
              ...(teamEntity
                ? [{ label: teamEntity.name, href: `/lag/${teamEntity.slug}` }]
                : []),
              { label: article.title },
            ]}
          />
        </div>

        <h1 className="font-heading font-bold text-[1.75rem] leading-[1.22] tracking-display text-foreground text-balance sm:text-4xl sm:leading-[1.15] lg:text-[2.5rem]">
          {article.title}
        </h1>

        <div className="mt-4 mb-8 flex items-center justify-between gap-3">
          <p className="text-[13px] leading-5 tracking-ui text-muted-foreground">
            <span className="font-medium text-foreground">{source}</span>
            <span aria-hidden="true"> · </span>
            <time dateTime={article.publishedAt}>
              {formatDateRelative(article.publishedAt)}
            </time>
            <span aria-hidden="true"> · </span>
            <span>{readTime}</span>
          </p>
          <ShareButton
            title={article.title}
            url={`${getSiteUrl()}/artikel/${article.slug}`}
            variant="icon"
          />
        </div>

        {article.content ? <ArticleBody content={article.content} title={article.title} /> : null}

        {relatedArticles.length > 0 && (
          <aside className="mt-12 space-y-3" aria-label="Läs också">
            {relatedArticles.slice(0, 3).map((related) => (
              <Link
                key={related.id}
                href={articlePublicPath(related)}
                className="block border-l-2 border-pitch pl-4 py-2 hover:border-pitch-ink transition-colors"
              >
                <p className="text-[11px] font-semibold uppercase tracking-eyebrow text-pitch-ink">
                  Läs också
                </p>
                <p className="mt-1 text-[15px] leading-snug text-muted-foreground italic text-balance">
                  {related.title}
                </p>
              </Link>
            ))}
          </aside>
        )}

        <section className="mt-12 pt-8 border-t border-border">
          <Link
            href={forumHref}
            className="flex items-center gap-3 min-h-11 text-foreground hover:text-pitch-ink transition-colors"
          >
            <MessageSquare className="size-[1em] text-pitch-ink" />
            <span className="text-sm font-medium">
              {discussionCount > 0
                ? `Diskussion · ${discussionCount}`
                : "Starta en diskussion"}
            </span>
          </Link>
        </section>

        <p className="mt-10">
          <Link
            href="/nyheter"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            ← Tillbaka till nyheterna
          </Link>
        </p>
      </article>
    </>
  );
}
