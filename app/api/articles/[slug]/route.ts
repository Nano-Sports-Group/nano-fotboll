import { NextResponse } from "next/server";
import {
  canAccess,
  requiredPlanFor,
} from "@/lib/access-rules";
import {
  getArticleDiscussionCount,
  getPublicArticleBySlug,
} from "@/lib/articles/public-article";
import { canPublishBody, resolveRightsStatus } from "@/lib/provenance";
import { getUserPlan } from "@/lib/user-plan";
import { jsonContract } from "@/lib/api-contract";
import { ArticleDetailResponseSchema } from "@/lib/api-schemas";
import { formatArticleBodyHtml } from "@/lib/articles/article-body";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const article = await getPublicArticleBySlug(slug);
  if (!article) {
    return NextResponse.json(
      { error: "Artikel hittades inte", code: "not_found" },
      { status: 404 },
    );
  }

  const [plan, discussionCount] = await Promise.all([
    getUserPlan(),
    getArticleDiscussionCount(article.id),
  ]);
  const unlocked = canAccess("aiSummaries", plan);
  const rights = article.rightsStatus ?? resolveRightsStatus(article);
  const publishable = canPublishBody(rights);

  return jsonContract(ArticleDetailResponseSchema, {
    article: {
      id: article.id,
      slug: article.slug,
      title: article.title,
      sourceName: article.sourceName,
      // Egna texter har ingen källa att öppna: articles.url är där en adress till den egna sajten
      // (`<värd>/nyheter`, `/lag/<id>`), och apparna visade den som "Öppna hos källan".
      sourceUrl: publishable ? null : article.sourceUrl,
      publishedAt: article.publishedAt,
      updatedAt: article.updatedAt,
      imageUrl: article.imageUrl,
      kind: publishable ? "athopia" : "external",
      summary: unlocked ? article.summary : null,
      summaryPreview: article.summary
        ? `${article.summary.slice(0, 160)}${article.summary.length > 160 ? "…" : ""}`
        : null,
      content:
        publishable && unlocked && article.content
          ? formatArticleBodyHtml(article.content, article.title)
          : null,
      hasProtectedContent: publishable && Boolean(article.content),
      discussionCount,
    },
    access: {
      feature: "aiSummaries",
      unlocked,
      requiredPlan: requiredPlanFor("aiSummaries"),
      upgradePath: "/prenumerera",
    },
  });
}
