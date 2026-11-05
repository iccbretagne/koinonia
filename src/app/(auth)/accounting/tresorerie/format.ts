export const euro = (n: number) => n.toLocaleString("fr-FR", { style: "currency", currency: "EUR" });

export const frDate = (iso: string) =>
  new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString("fr-FR", { timeZone: "UTC" });

const MONTHS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];

/** « Octobre 2026 » pour « 2026-10 ». */
export function monthTitle(month: string): string {
  const name = MONTHS.at(Number(month.slice(5, 7)) - 1) ?? "";
  return `${name.charAt(0).toUpperCase()}${name.slice(1)} ${month.slice(0, 4)}`;
}

/** Date locale au format AAAA-MM-JJ. */
export function isoToday(d = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** « 12,50 » ou « 12.5 » → 12.5 ; NaN si illisible. */
export const toNumber = (v: string) => Number(v.replace(/\s/g, "").replace(",", "."));

export class ApiFailure extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

/** Appel JSON de l'API ; lève `ApiFailure` avec le message de l'API. */
export async function api<T = unknown>(url: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const { json, ...rest } = init ?? {};
  const res = await fetch(url, {
    ...rest,
    ...(json === undefined ? {} : { body: JSON.stringify(json), headers: { "Content-Type": "application/json" } }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const details = Array.isArray(body.details) ? ` ${body.details.map((d: { message: string }) => d.message).join(" ")}` : "";
    throw new ApiFailure(`${body.error ?? "Erreur"}${details}`, res.status);
  }
  return body as T;
}

export const errorText = (e: unknown) => (e instanceof Error ? e.message : "Erreur réseau");
