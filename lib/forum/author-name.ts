/**
 * lib/forum/author-name.ts — vilket namn som står bredvid ett inlägg.
 *
 * Forumnamnet (profiles.nickname) om användaren valt ett, annars förnamnet, annars "Supporter".
 * Aldrig hela namnet: den som loggar in med Google har inte bett om att få för- och efternamn
 * publicerat bredvid sina kommentarer. Och aldrig ett namn ur request-bodyn — identiteten kommer
 * från sessionen (CLAUDE.md §0), annars kan vem som helst skriva i någon annans namn.
 */

import "server-only";
import { createServerClient } from "@/lib/supabase";
import { forumDisplayName } from "@/lib/forum/display-name";

export async function forumAuthorName(userId: string, firstName: string | null | undefined): Promise<string> {
  const { data } = await createServerClient().from("profiles").select("nickname").eq("clerk_user_id", userId).maybeSingle();
  return forumDisplayName(data?.nickname as string | null | undefined, firstName);
}
