import Image from "next/image";

/**
 * "Hämta i App Store" enligt Apples riktlinjer
 * (developer.apple.com/app-store/marketing/guidelines):
 * - visas BARA när appen finns att ladda ner: länken sätts per Vercel-projekt i
 *   NEXT_PUBLIC_APP_STORE_URL (nano-fotboll = fotbollsappen, nano-hockey = hockeyappen).
 *   Utan länk renderas inget — ett märke får aldrig peka mot en app som inte finns.
 * - Apples oförändrade svenska artwork (public/badges), svart variant, ingen animation.
 * - Höjd 48 px (minimum 40 px) och fritt utrymme en fjärdedel av höjden (12 px).
 */
export const APP_STORE_URL = process.env.NEXT_PUBLIC_APP_STORE_URL?.trim() || null;

export function AppStoreBadge({ className = "" }: { className?: string }) {
  if (!APP_STORE_URL) return null;
  return (
    <a
      href={APP_STORE_URL}
      className={`inline-flex rounded-[10px] p-3 outline-none focus-visible:ring-2 focus-visible:ring-pitch focus-visible:ring-offset-2 focus-visible:ring-offset-black ${className}`}
    >
      <Image
        src="/badges/app-store-sv-black.svg"
        alt="Hämta i App Store"
        width={144}
        height={48}
        unoptimized
        className="h-12 w-auto"
      />
    </a>
  );
}
