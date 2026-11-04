import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAuth } from "@/lib/auth";
import { qrPath } from "@/lib/qr";
import QrSvg from "@/components/ticketing/QrSvg";
import { canDo, getEventAccess, getEventDetail, listLabels, type LabelSet } from "@/modules/ticketing";
import MarkPrinted from "./MarkPrinted";

/** Formats de planche A4 courants : 3 × 7 (63,5 × 38,1 mm) et 2 × 7 (99,1 × 38,1 mm). */
const FORMATS = {
  "3x7": { label: "3 × 7 (63,5 × 38,1 mm)", cols: 3, width: "63.5mm" },
  "2x7": { label: "2 × 7 (99,1 × 38,1 mm)", cols: 2, width: "99.1mm" },
} as const;
const SETS: { value: LabelSet; label: string }[] = [
  { value: "all", label: "Toutes" },
  { value: "changed", label: "Nouvelles et modifiées" },
];

/** Étiquettes de préparation nominative à imprimer (spec 074, lot 3). */
export default async function LabelsPage({
  params,
  searchParams,
}: {
  readonly params: Promise<{ id: string }>;
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const q = await searchParams;
  const session = await requireAuth();
  const access = await getEventAccess(session, id).catch(() => null);
  if (!access) notFound();
  if (!canDo(access, "catering")) return <p className="p-4 text-ink-muted">Réservé à la restauration et à l&apos;organisation.</p>;
  const one = (k: string) => (typeof q[k] === "string" ? (q[k] as string) : undefined);
  const format = FORMATS[one("format") === "2x7" ? "2x7" : "3x7"];
  const variantId = one("plat");
  let set: LabelSet = one("set") === "changed" ? "changed" : "all";
  if (variantId) set = "variant";
  const withQr = one("qr") === "1";
  const [event, labels] = await Promise.all([getEventDetail(id), listLabels(id, set, { variantId })]);
  const variants = event.options.filter((o) => o.namedPrep).flatMap((o) => o.variants.map((v) => ({ id: v.id, label: `${o.label} — ${v.label}` })));
  const href = (patch: Record<string, string | undefined>) => {
    const next = new URLSearchParams();
    const merged = { set: one("set"), plat: variantId, format: one("format"), qr: one("qr"), ...patch };
    for (const [k, v] of Object.entries(merged)) if (v) next.set(k, v);
    return `/billetterie/${id}/etiquettes?${next.toString()}`;
  };
  const chip = (active: boolean) => `rounded-chip border px-3 py-1 text-[13px] ${active ? "border-brand bg-brand-soft text-ink" : "border-line text-ink-muted"}`;

  return (
    <div className="space-y-4">
      <div className="space-y-3 print:hidden">
        <Link href={`/billetterie/${id}/restauration`} className="text-[13px] text-brand-text underline">
          ← Restauration
        </Link>
        <h1 className="text-xl font-bold text-ink">Étiquettes — {event.title}</h1>
        <div className="flex flex-wrap gap-2">
          {SETS.map((s) => (
            <Link key={s.value} href={href({ set: s.value, plat: undefined })} className={chip(!variantId && set === s.value)}>
              {s.label}
            </Link>
          ))}
          {variants.map((v) => (
            <Link key={v.id} href={href({ plat: v.id, set: undefined })} className={chip(variantId === v.id)}>
              {v.label}
            </Link>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          {Object.entries(FORMATS).map(([key, f]) => (
            <Link key={key} href={href({ format: key })} className={chip(format === f)}>
              {f.label}
            </Link>
          ))}
          <Link href={href({ qr: withQr ? undefined : "1" })} className={chip(withQr)}>
            Code d&apos;étiquette {withQr ? "affiché" : "masqué"}
          </Link>
        </div>
        <p className="text-[13px] text-ink-muted">
          {labels.length} étiquette{labels.length > 1 ? "s" : ""}. Imprimez à 100 % (sans mise à l&apos;échelle).
        </p>
        <MarkPrinted eventId={id} itemIds={labels.map((l) => l.itemId)} />
      </div>
      <div className="grid gap-0" style={{ gridTemplateColumns: `repeat(${format.cols}, ${format.width})` }}>
        {labels.map((l) => (
          <div key={l.itemId} className="flex h-[38.1mm] items-center gap-2 overflow-hidden border border-dashed border-line p-[2mm] print:border-0">
            {withQr && <QrSvg qr={qrPath(l.code)} label={`Code de ${l.name}`} className="size-[24mm] shrink-0" />}
            <div className="min-w-0 text-[9pt] leading-tight text-ink">
              <p className="truncate text-[11pt] font-bold">{l.name}</p>
              <p className="truncate">
                {l.dish}
                {l.quantity > 1 ? ` × ${l.quantity}` : ""}
              </p>
              {(l.allergies || l.allergens) && <p className="truncate">⚠ {[l.allergies, l.allergens].filter(Boolean).join(" · ")}</p>}
              <p>
                {l.reference}
                {l.toPay ? " · À RÉGLER" : ""}
                {l.stale ? " · refaite" : ""}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
