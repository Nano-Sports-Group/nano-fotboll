/**
 * Apple Podcasts show-länk — collection-ID cachas på rss_sources.apple_podcast_show_id
 * (slås upp mot iTunes Search API vid ingest, se nano-os/packages/rss/src/podcast-apple.ts).
 *
 * Show-nivå, inte avsnitt: Apple ger ingen stabil per-avsnitt-deeplänk utan en separat
 * datum/titel-matchning inom showen — medvetet uteslutet i v1
 * (nano-components/patterns/podcast/README.md §3d). Samma avvägning som Spotifys
 * show-embed-fallback i spotify.ts när ett avsnitt saknar sitt eget episode-ID.
 */

export function applePodcastShowUrl(appleShowId: string | null | undefined): string | null {
  if (!appleShowId) return null;
  return `https://podcasts.apple.com/podcast/id${appleShowId}`;
}
