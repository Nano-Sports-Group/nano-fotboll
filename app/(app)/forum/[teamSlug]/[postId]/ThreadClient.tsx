"use client";

import { useState } from "react";
import { useUser } from "@clerk/nextjs";
import { toast } from "sonner";
import { MessageCircle } from "lucide-react";
import PostItem from "@/components/forum/PostItem";
import { AIInputWithLoading } from "@/components/ui/ai-input-with-loading";
import type { ForumPost } from "@/lib/types";

interface Props {
  root: ForumPost;
  replies: ForumPost[];
  teamSlug: string;
  sport: string;
}

export default function ThreadClient({
  root,
  replies: initialReplies,
  teamSlug,
  sport,
}: Props) {
  const { user } = useUser();
  const [replies, setReplies] = useState<ForumPost[]>(initialReplies);

  async function handleReply(data: {
    content: string;
    parentId?: string;
    rootId?: string;
    teamSlug: string;
    sport: string;
  }) {
    const res = await fetch("/api/forum/posts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content: data.content,
        parent_id: root.id,
        root_id: root.id,
        team_slug: data.teamSlug,
        sport: data.sport,
      }),
    });
    if (res.ok) {
      const newPost = (await res.json()) as ForumPost;
      setReplies((prev) => [...prev, newPost]);
    } else {
      toast.error("Det gick inte att skapa svaret. Försök igen.");
    }
  }

  return (
    <div>
      {/* Root post */}
      <div className="pb-4 border-b border-border/30">
        <PostItem post={root} depth={0} index={0} />
      </div>

      {/* Replies */}
      {replies.length > 0 && (
        <div className="mt-1 flex flex-col divide-y divide-border/20">
          {replies.map((reply, i) => (
            <div key={reply.id} className="py-3">
              <PostItem
                post={reply}
                depth={1}
                onReply={(newPost) =>
                  setReplies((prev) => [...prev, newPost])
                }
                index={i}
              />
            </div>
          ))}
        </div>
      )}

      {/* Empty replies state */}
      {replies.length === 0 && (
        <div className="py-10 text-center">
          <MessageCircle className="w-8 h-8 mx-auto mb-2 text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground">
            Inga svar än. Var första att svara!
          </p>
        </div>
      )}

      {/* GlassNav is hidden on thread pages so compose bar can use full bottom */}
      {user && (
        <div className="fixed bottom-0 inset-x-0 z-40 max-w-[600px] mx-auto border-t border-border/30 bg-background/95 backdrop-blur-xl px-4 pt-3 pb-[max(env(safe-area-inset-bottom),0.75rem)]">
          <AIInputWithLoading
            placeholder={`Svara ${root.author_name}…`}
            onSubmit={async (val) => {
              await handleReply({ content: val, teamSlug, sport });
            }}
          />
        </div>
      )}
    </div>
  );
}
