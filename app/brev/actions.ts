"use server";

import { redirect } from "next/navigation";
import { confirmNewsletterByToken, unsubscribeNewsletterByToken } from "@/lib/newsletter/service";

export async function confirmNewsletterAction(formData: FormData) {
  const outcome = await confirmNewsletterByToken(String(formData.get("token") ?? ""));
  redirect(`/brev/bekrafta?done=${outcome}`);
}

export async function unsubscribeNewsletterAction(formData: FormData) {
  const outcome = await unsubscribeNewsletterByToken(String(formData.get("token") ?? ""));
  redirect(`/brev/avsluta?done=${outcome}`);
}
