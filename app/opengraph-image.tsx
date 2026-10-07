import { vertical, SPORT_ACCENT } from "@/lib/vertical";
import { ImageResponse } from "next/og";

/**
 * Statisk OG-fallback för alla sidor utan egen bild — tidigare delades
 * länkar helt utan bild (audit T9). Genereras vid build.
 */
const LINE =
  vertical.id === "golf" ? "Svensk golf, varje dag" : `${vertical.id === "hockey" ? "SHL:s" : "Allsvenskans"} digitala hemmaplan`;
const SURFACES = vertical.id === "golf" ? "Flöde · Spelare · Tourer · Forum" : "Tabell · Matcher · Statistik · Forum";

export const alt = `${vertical.productName} — ${LINE}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OgImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #09090b 0%, #18181b 60%, #0e2a20 100%)",
          color: "white",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ fontSize: 96, fontWeight: 800, letterSpacing: -2, display: "flex" }}>
          {vertical.wordmark}
        </div>
        <div style={{ fontSize: 34, color: SPORT_ACCENT.light, marginTop: 12, display: "flex" }}>
          {LINE}
        </div>
        <div style={{ fontSize: 22, color: "#a1a1aa", marginTop: 28, display: "flex" }}>
          {SURFACES}
        </div>
      </div>
    ),
    size,
  );
}
