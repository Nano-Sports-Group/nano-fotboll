import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth, currentUser } from "@clerk/nextjs/server";
import { createServerClient, isSupabaseConfigured } from "@/lib/supabase";
import { ProfilePageClient } from "./ProfilePageClient";
import type { PublicProfile } from "@/components/profile/ProfileCard";
import { getFollowedTeams } from "@/lib/dashboard/queries";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Min profil",
  robots: { index: false, follow: false },
};

export default async function ProfilPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
  const user = await currentUser();

  let row: Record<string, unknown> | null = null;
  if (isSupabaseConfigured()) {
    const db = createServerClient();
    const res = await db.from("profiles").select("*").eq("clerk_user_id", userId).maybeSingle();
    row = res.data ?? null;
  }

  const followedTeams = await getFollowedTeams(userId);

  const createdAt =
    (row?.created_at as string | undefined) ??
    (user?.createdAt ? new Date(user.createdAt).toISOString() : new Date().toISOString());

  const profile: PublicProfile = {
    clerk_user_id: userId,
    nickname: (row?.nickname as string | null) ?? null,
    display_name:
      (row?.display_name as string | null) ??
      ([user?.firstName, user?.lastName].filter(Boolean).join(" ") || null),
    avatar_url: (row?.avatar_url as string | null) ?? user?.imageUrl ?? null,
    bio: (row?.bio as string | null) ?? null,
    verified: (row?.verified as boolean | undefined) ?? false,
    role: (row?.role as PublicProfile["role"] | undefined) ?? "reader",
    favourite_team_id: (row?.favourite_team_id as string | null) ?? null,
    created_at: createdAt,
  };

  return (
    <ProfilePageClient
      initialProfile={profile}
      email={user?.emailAddresses?.[0]?.emailAddress ?? null}
      firstName={user?.firstName ?? null}
      lastName={user?.lastName ?? null}
      favouriteTeamId={(row?.favourite_team_id as string | null) ?? null}
      followedTeams={followedTeams.map((t) => ({ id: t.id, name: t.name, slug: t.slug }))}
    />
  );
}
