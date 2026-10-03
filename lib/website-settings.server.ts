import { unstable_cache } from "next/cache";
import { createServerClient, isSupabaseConfigured } from "@/lib/supabase";
import {
  DEFAULT_WEBSITE_SETTINGS,
  GOLF_DEFAULT_WEBSITE_SETTINGS,
  HOCKEY_DEFAULT_WEBSITE_SETTINGS,
  WEBSITE_CONFIG_KEY,
  parseWebsiteSettings,
  type WebsiteSettings,
} from "@/lib/website-settings";
import { VERTICAL } from "@/lib/vertical";

async function loadWebsiteSettings(): Promise<WebsiteSettings> {
  const fallback =
    VERTICAL === "hockey" ? HOCKEY_DEFAULT_WEBSITE_SETTINGS : VERTICAL === "golf" ? GOLF_DEFAULT_WEBSITE_SETTINGS : DEFAULT_WEBSITE_SETTINGS;
  const key = VERTICAL === "football" ? WEBSITE_CONFIG_KEY : `website.${VERTICAL}`;
  if (!isSupabaseConfigured()) return fallback;
  try {
    const db = createServerClient();
    const { data, error } = await db
      .from("system_config")
      .select("value")
      .eq("key", key)
      .maybeSingle();
    if (error || data == null) return fallback;
    return parseWebsiteSettings((data as { value: unknown }).value, fallback);
  } catch {
    return fallback;
  }
}

/** 60 s cache — admin-ändringar syns på sajten inom en minut, utan att varje request slår DB. */
export const getWebsiteSettings = unstable_cache(loadWebsiteSettings, ["website-settings", VERTICAL], {
  revalidate: 60,
});
