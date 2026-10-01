import { SPORT } from "@/lib/vertical";
import { auth } from "@clerk/nextjs/server";
import { createServerClient, isSupabaseConfigured } from "@/lib/supabase";
import { getPrimaryTeam } from "@/lib/team/getPrimaryTeam";
import { interestsToNewsTags } from "@/lib/feed/content-preferences";
import { parseNationalInterest, type NationalInterest } from "@/lib/national-interest";

export interface UserFeedPreferences {
  contentTypes: string[];
  newsTags: string[] | null;
  favoriteTeamSlug: string | null;
  favoriteTeamName: string | null;
  nationalInterest: NationalInterest;
}

const EMPTY: UserFeedPreferences = {
  contentTypes: [],
  newsTags: null,
  favoriteTeamSlug: null,
  favoriteTeamName: null,
  nationalInterest: "some",
};

/** Läser user_feed_config + favoritlag för personaliserade defaults. */
export async function getUserFeedPreferences(): Promise<UserFeedPreferences> {
  const { userId } = await auth();
  if (!userId || !isSupabaseConfigured()) return EMPTY;

  const [primaryTeam, configResult] = await Promise.all([
    getPrimaryTeam(),
    createServerClient()
      .from("user_feed_config")
      .select("content_types, national_interest")
      .eq("clerk_user_id", userId)
      .eq("sport", SPORT)
      .maybeSingle(),
  ]);

  const contentTypes = (configResult.data?.content_types as string[] | null) ?? [];

  return {
    contentTypes,
    newsTags: interestsToNewsTags(contentTypes),
    favoriteTeamSlug: primaryTeam?.slug ?? null,
    favoriteTeamName: primaryTeam?.name ?? null,
    nationalInterest: parseNationalInterest(configResult.data?.national_interest),
  };
}
