import { NextResponse } from "next/server";

export const revalidate = 3600;

/**
 * Android App Links: länkar till sajten öppnas i Nano Sport-appen (`nano-android`).
 * En app för alla sporter (ADR-004) — samma paket på varje sports domän.
 * Tom lista tills ANDROID_CERT_SHA256 är satt (signeringscertifikatets fingeravtryck,
 * kommaseparerat: uppladdningsnyckeln och Play App Signing-nyckeln ger var sitt).
 */
export function GET() {
  const prints = (process.env.ANDROID_CERT_SHA256 ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const body = prints.length
    ? [
        {
          relation: ["delegate_permission/common.handle_all_urls"],
          target: {
            namespace: "android_app",
            package_name: process.env.ANDROID_PACKAGE_NAME || "se.nanosport.app",
            sha256_cert_fingerprints: prints,
          },
        },
      ]
    : [];
  return NextResponse.json(body, { headers: { "Cache-Control": "public, max-age=3600" } });
}
