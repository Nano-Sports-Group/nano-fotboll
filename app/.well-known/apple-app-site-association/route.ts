import { NextResponse } from "next/server";
import { universalLinkPaths } from "@/lib/deep-links";

export const revalidate = 3600;

const UNIVERSAL_LINK_COMPONENTS = universalLinkPaths().map((path) => ({ "/": path }));

export function GET() {
  const teamId = process.env.APPLE_TEAM_ID;
  // En app för alla sporter (ADR-004): samma bundle-id på varje sports domän.
  // Sätt APPLE_BUNDLE_ID=se.nanosport.app när det nya id:t är valt; tills dess det gamla.
  const appId = `${teamId}.${process.env.APPLE_BUNDLE_ID || "se.athopia.app"}`;
  const details = teamId
    ? [
        {
          appIDs: [appId],
          components: UNIVERSAL_LINK_COMPONENTS,
        },
      ]
    : [];

  return NextResponse.json(
    {
      applinks: {
        apps: [],
        details,
      },
      webcredentials: {
        apps: teamId ? [appId] : [],
      },
    },
    {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=3600",
      },
    },
  );
}
