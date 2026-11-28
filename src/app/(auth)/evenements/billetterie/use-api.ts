"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui";

/** Appel JSON avec retour (toast) et rafraîchissement des données serveur. */
export function useApi() {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  async function call<T = unknown>(url: string, method: string, body?: unknown, success?: string): Promise<T | null> {
    setBusy(true);
    try {
      const res = await fetch(url, {
        method,
        headers: body === undefined ? undefined : { "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const detail = Array.isArray(data.details) && data.details[0] ? ` (${data.details[0].field} : ${data.details[0].message})` : "";
        toast.error(`${data.error ?? "L'opération n'a pas abouti."}${detail}`);
        return null;
      }
      if (success) toast.success(success);
      router.refresh();
      return data as T;
    } finally {
      setBusy(false);
    }
  }
  return { call, busy };
}
