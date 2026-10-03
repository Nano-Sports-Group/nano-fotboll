import Link from "next/link";
import type { GolfStory } from "@/lib/golf/stories";

/** Renderas bara när det finns texter — en tom lista visas aldrig. */
export function StoryList({ stories }: { stories: GolfStory[] }) {
  if (stories.length === 0) return null;
  return (
    <ul className="divide-y divide-border rounded-2xl border border-border bg-card">
      {stories.map((story) => (
        <li key={story.slug}>
          <Link href={`/artikel/${story.slug}`} className="block px-5 py-4 transition-colors hover:bg-foreground/[0.03]">
            <p className="font-semibold text-foreground text-balance">{story.title}</p>
            {story.summary && <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{story.summary}</p>}
          </Link>
        </li>
      ))}
    </ul>
  );
}
