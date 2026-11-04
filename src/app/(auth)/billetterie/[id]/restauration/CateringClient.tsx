"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Camera, CameraOff, Printer, Trash2 } from "lucide-react";
import { Alert, Button, Checkbox, Input, Modal, SearchInput, Select, StatusChip } from "@/components/ui";
import { newOpId, sha256Hex } from "@/lib/offline/hash";
import { startScanner } from "@/lib/offline/scanner";
import type { CateringSnapshot } from "@/modules/ticketing";
import { formatEuros, parseScannedCode } from "@/modules/ticketing/schemas";
import { useApi } from "../../use-api";
import NetworkBar from "../_offline/NetworkBar";
import { useFieldSync } from "../_offline/use-field-sync";

type Item = CateringSnapshot["items"][number];
type View = "distribution" | "menu" | "stock";
interface Menu {
  id: string;
  label: string;
  namedPrep: boolean;
  variants: { id: string; label: string; description: string | null; allergens: string | null; stock: number | null; prepared: number | null; closed: boolean; used: number }[];
}

/** Fiche d'une personne ou d'une réservation : éléments à retirer, paiement, remise. */
function Sheet({
  title,
  items,
  onDeliver,
  onClose,
}: {
  readonly title: string;
  readonly items: Item[];
  readonly onDeliver: (item: Item, method: "CASH" | "CHEQUE" | null) => Promise<void>;
  readonly onClose: () => void;
}) {
  return (
    <Modal open onClose={onClose} title={title} mobileLayout="sheet">
      {items.length === 0 ? (
        <p className="text-ink-muted">Rien à retirer.</p>
      ) : (
        <ul className="space-y-3">
          {items.map((i) => {
            const done = i.deliveredQty >= i.quantity;
            return (
              <li key={i.id} className="space-y-2 rounded-card border border-line p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold text-ink">
                    {i.label}
                    {i.quantity > 1 ? ` × ${i.quantity}` : ""}
                  </span>
                  {done ? <StatusChip tone="success">Remis</StatusChip> : i.paid ? <StatusChip tone="success">Payé</StatusChip> : <StatusChip tone="warning">À régler {formatEuros(i.amountDue)}</StatusChip>}
                </div>
                <p className="text-[13px] text-ink-muted">
                  {i.holder}
                  {i.allergens ? ` · allergènes : ${i.allergens}` : ""}
                  {i.labelStale ? " · étiquette à refaire" : ""}
                </p>
                {!done &&
                  (i.paid ? (
                    <Button type="button" onClick={() => onDeliver(i, null)}>
                      Remis
                    </Button>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      <Button type="button" onClick={() => onDeliver(i, "CASH")}>
                        Encaissé espèces et remis
                      </Button>
                      <Button type="button" variant="secondary" onClick={() => onDeliver(i, "CHEQUE")}>
                        Chèque et remis
                      </Button>
                    </div>
                  ))}
              </li>
            );
          })}
        </ul>
      )}
    </Modal>
  );
}

function MenuEditor({ eventId, menus }: { readonly eventId: string; readonly menus: Menu[] }) {
  const { call, busy } = useApi();
  const [drafts, setDrafts] = useState<Record<string, Menu["variants"][number]>>({});
  const [adding, setAdding] = useState<Record<string, string>>({});
  if (menus.length === 0) return <p className="text-ink-muted">Aucune option à choix « à retirer sur place ». L&apos;organisateur la crée dans les paramètres.</p>;
  const num = (v: string) => (v === "" ? null : Number(v));
  return (
    <div className="space-y-6">
      <p className="text-[13px] text-ink-muted">Vous composez les plats ; le prix, la date limite de paiement et le remboursement restent à l&apos;organisateur.</p>
      {menus.map((m) => (
        <section key={m.id} className="space-y-3">
          <h2 className="text-lg font-bold text-ink">{m.label}</h2>
          {m.variants.map((v) => {
            const d = drafts[v.id] ?? v;
            const set = (patch: Partial<Menu["variants"][number]>) => setDrafts((all) => ({ ...all, [v.id]: { ...d, ...patch } }));
            return (
              <div key={v.id} className="space-y-2 rounded-card border border-line bg-surface p-3">
                <div className="grid gap-2 sm:grid-cols-2">
                  <Input label="Plat" value={d.label} onChange={(e) => set({ label: e.target.value })} />
                  <Input label="Allergènes" value={d.allergens ?? ""} onChange={(e) => set({ allergens: e.target.value || null })} />
                  <Input label="Description" value={d.description ?? ""} onChange={(e) => set({ description: e.target.value || null })} />
                  <div className="grid grid-cols-2 gap-2">
                    <Input label={`Stock (réservés ${v.used})`} type="number" min={0} value={d.stock ?? ""} onChange={(e) => set({ stock: num(e.target.value) })} />
                    <Input label="Préparés" type="number" min={0} value={d.prepared ?? ""} onChange={(e) => set({ prepared: num(e.target.value) })} />
                  </div>
                </div>
                <label className="flex min-h-11 items-center gap-3">
                  <Checkbox checked={d.closed} onChange={(e) => set({ closed: e.target.checked })} />
                  <span className="text-[15px] text-ink">Fermé aux nouvelles commandes</span>
                </label>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    disabled={busy || !drafts[v.id]}
                    onClick={async () => {
                      const ok = await call(`/api/ticketing/events/${eventId}/variants/${v.id}`, "PATCH", {
                        label: d.label,
                        description: d.description,
                        allergens: d.allergens,
                        stock: d.stock,
                        prepared: d.prepared,
                        closed: d.closed,
                      }, "Plat enregistré");
                      if (ok) setDrafts(({ [v.id]: _, ...rest }) => rest);
                    }}
                  >
                    Enregistrer
                  </Button>
                  {v.used === 0 && (
                    <Button type="button" size="sm" variant="ghost" aria-label={`Supprimer ${v.label}`} onClick={() => call(`/api/ticketing/events/${eventId}/variants/${v.id}`, "DELETE", undefined, "Plat supprimé")}>
                      <Trash2 className="size-4" aria-hidden="true" />
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-48 flex-1">
              <Input label="Nouveau plat" value={adding[m.id] ?? ""} onChange={(e) => setAdding({ ...adding, [m.id]: e.target.value })} />
            </div>
            <Button
              type="button"
              variant="secondary"
              disabled={busy || !adding[m.id]?.trim()}
              onClick={async () => {
                if (await call(`/api/ticketing/events/${eventId}/options/${m.id}/variants`, "POST", { label: adding[m.id].trim() }, "Plat ajouté")) setAdding({ ...adding, [m.id]: "" });
              }}
            >
              Ajouter
            </Button>
          </div>
        </section>
      ))}
    </div>
  );
}

/** Restauration : distribution (hors ligne), vente sur place, menu, stock. */
export default function CateringClient({ eventId, menus, hasLabels }: { readonly eventId: string; readonly menus: Menu[]; readonly hasLabels: boolean }) {
  const { snapshot, setSnapshot, status, enqueue } = useFieldSync<CateringSnapshot>(eventId, "catering");
  const [view, setView] = useState<View>("distribution");
  const [sheet, setSheet] = useState<{ title: string; ids: string[] } | null>(null);
  const [message, setMessage] = useState<{ tone: "danger" | "success"; text: string } | null>(null);
  const [search, setSearch] = useState("");
  const [camera, setCamera] = useState(false);
  const [sale, setSale] = useState<{ key: string; quantity: string; method: string } | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const index = useMemo(() => {
    const items = snapshot?.items ?? [];
    return {
      byParticipantHash: new Map((snapshot?.participants ?? []).map((p) => [p.ticketHash, p])),
      byBookingHash: new Map((snapshot?.bookings ?? []).map((b) => [b.scanHash, b])),
      byLabelHash: new Map(items.filter((i) => i.labelHash).map((i) => [i.labelHash!, i])),
      items,
    };
  }, [snapshot]);
  const sheetItems = sheet ? index.items.filter((i) => sheet.ids.includes(i.id)) : [];

  async function onCode(raw: string) {
    setMessage(null);
    const parsed = parseScannedCode(raw);
    if (!parsed) return setMessage({ tone: "danger", text: "Code inconnu." });
    if (parsed.scope === "badge") return setMessage({ tone: "danger", text: "Badge d'équipe : pas de repas associé." });
    const hash = await sha256Hex(parsed.token);
    if (parsed.scope === "label") {
      const item = index.byLabelHash.get(hash);
      return item ? setSheet({ title: item.holder, ids: [item.id] }) : setMessage({ tone: "danger", text: "Étiquette inconnue, annulée ou libérée." });
    }
    if (parsed.scope === "ticket") {
      const p = index.byParticipantHash.get(hash);
      return p ? setSheet({ title: p.name, ids: index.items.filter((i) => i.participantId === p.id).map((i) => i.id) }) : setMessage({ tone: "danger", text: "Aucun repas pour ce billet." });
    }
    const booking = index.byBookingHash.get(hash);
    return booking ? setSheet({ title: `Réservation ${booking.reference}`, ids: index.items.filter((i) => i.bookingId === booking.id).map((i) => i.id) }) : setMessage({ tone: "danger", text: "Aucun repas pour cette réservation." });
  }
  const onCodeRef = useRef(onCode);
  useEffect(() => {
    onCodeRef.current = onCode;
  });
  useEffect(() => {
    if (!camera || !videoRef.current) return;
    let stop: (() => void) | null = null;
    startScanner(videoRef.current, (text) => void onCodeRef.current(text))
      .then((s) => {
        stop = s;
      })
      .catch(() => {
        setMessage({ tone: "danger", text: "Caméra indisponible : utilisez la recherche par nom." });
        setCamera(false);
      });
    return () => stop?.();
  }, [camera]);

  async function deliver(item: Item, method: "CASH" | "CHEQUE" | null) {
    setSnapshot((s) => (s ? { ...s, items: s.items.map((i) => (i.id === item.id ? { ...i, deliveredQty: i.quantity, paid: true, amountDue: 0 } : i)) } : s));
    await enqueue({ type: "delivery", id: newOpId(), itemId: item.id, delivered: item.quantity, method, scannedAt: new Date() });
  }

  const matches = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (q.length < 2) return [];
    const holders = new Map<string, string[]>();
    for (const i of index.items) {
      if (i.holder.toLowerCase().includes(q)) holders.set(i.holder, [...(holders.get(i.holder) ?? []), i.id]);
    }
    return [...holders].slice(0, 12);
  }, [search, index.items]);

  const saleOptions = (snapshot?.sale ?? []).flatMap((o) =>
    o.variants.length > 0 ? o.variants.map((v) => ({ key: `${o.id}:${v.id}`, label: `${o.label} — ${v.label}`, price: o.price })) : [{ key: `${o.id}:`, label: o.label, price: o.price }]
  );

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <div className="flex items-center justify-between gap-2">
        <Link href={`/billetterie/${eventId}`} className="text-[13px] text-brand-text underline">
          ← {snapshot?.event.title ?? "Événement"}
        </Link>
        {hasLabels && (
          <Link href={`/billetterie/${eventId}/etiquettes`} className="inline-flex items-center gap-1 text-[13px] font-semibold text-brand-text underline">
            <Printer className="size-4" aria-hidden="true" /> Étiquettes
          </Link>
        )}
      </div>
      <fieldset className="grid grid-cols-3 gap-2">
        <legend className="sr-only">Vue</legend>
        {(["distribution", "menu", "stock"] as const).map((v) => (
          <Button key={v} type="button" size="sm" variant={view === v ? "primary" : "secondary"} aria-pressed={view === v} onClick={() => setView(v)}>
            {{ distribution: "Distribution", menu: "Menu", stock: "Stock" }[v]}
          </Button>
        ))}
      </fieldset>
      <NetworkBar status={status} />

      {view === "distribution" && (
        <div className="space-y-4">
          {!snapshot && <p className="text-ink-muted">Chargement de l&apos;instantané… Une première connexion est nécessaire.</p>}
          {message && <Alert tone={message.tone}>{message.text}</Alert>}
          {camera && <video ref={videoRef} className="aspect-square w-full rounded-card bg-surface-sunken object-cover" muted />}
          <Button type="button" className="w-full" variant={camera ? "secondary" : "primary"} onClick={() => setCamera((c) => !c)}>
            {camera ? <CameraOff className="size-4" aria-hidden="true" /> : <Camera className="size-4" aria-hidden="true" />}
            {camera ? "Arrêter la caméra" : "Scanner un billet ou une étiquette"}
          </Button>
          <SearchInput value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Chercher un nom…" aria-label="Chercher une personne" />
          {matches.length > 0 && (
            <ul className="divide-y divide-line rounded-card border border-line bg-surface">
              {matches.map(([holder, ids]) => (
                <li key={holder}>
                  <button type="button" className="w-full px-4 py-3 text-left text-ink" onClick={() => setSheet({ title: holder, ids })}>
                    {holder}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {saleOptions.length > 0 && (
            <Button type="button" variant="secondary" className="w-full" onClick={() => setSale({ key: saleOptions[0].key, quantity: "1", method: "CASH" })}>
              Vente sur place
            </Button>
          )}
        </div>
      )}

      {view === "menu" && <MenuEditor eventId={eventId} menus={menus} />}

      {view === "stock" && snapshot && (
        <ul className="divide-y divide-line rounded-card border border-line bg-surface">
          {snapshot.stock.map((s) => (
            <li key={`${s.optionId}:${s.variantId ?? ""}`} className="px-4 py-3">
              <div className="flex justify-between gap-3">
                <span className="font-medium text-ink">
                  {s.label} {s.closed && <span className="text-ink-subtle">(fermé)</span>}
                </span>
                <span className="text-ink">{s.available === null ? "—" : `${s.available} dispo`}</span>
              </div>
              <p className="text-[13px] text-ink-muted">
                Réservés {s.reserved} · remis {s.delivered} · vendus sur place {s.sold}
                {s.prepared !== null ? ` · préparés ${s.prepared}` : ""}
                {s.stock !== null ? ` · stock ${s.stock}` : ""}
              </p>
            </li>
          ))}
        </ul>
      )}

      {sheet && <Sheet title={sheet.title} items={sheetItems} onDeliver={deliver} onClose={() => setSheet(null)} />}
      {sale && (
        <Modal open onClose={() => setSale(null)} title="Vente sur place" mobileLayout="sheet">
          <div className="space-y-3">
            <Select label="Plat" value={sale.key} options={saleOptions.map((o) => ({ value: o.key, label: `${o.label} — ${formatEuros(o.price)}` }))} onChange={(e) => setSale({ ...sale, key: e.target.value })} />
            <Input label="Quantité" type="number" min={1} max={50} value={sale.quantity} onChange={(e) => setSale({ ...sale, quantity: e.target.value })} />
            <Select
              label="Paiement"
              value={sale.method}
              options={[
                { value: "CASH", label: "Espèces" },
                { value: "CHEQUE", label: "Chèque" },
              ]}
              onChange={(e) => setSale({ ...sale, method: e.target.value })}
            />
            <Button
              type="button"
              disabled={!(Number(sale.quantity) >= 1)}
              onClick={async () => {
                const [optionId, variantId] = sale.key.split(":");
                const quantity = Number(sale.quantity);
                setSnapshot((s) =>
                  s
                    ? { ...s, stock: s.stock.map((x) => (x.optionId === optionId && (x.variantId ?? "") === variantId ? { ...x, sold: x.sold + quantity, available: x.available === null ? null : Math.max(0, x.available - quantity) } : x)) }
                    : s
                );
                await enqueue({ type: "onsiteSale", id: newOpId(), optionId, variantId: variantId || null, quantity, method: sale.method as "CASH" | "CHEQUE", scannedAt: new Date() });
                const price = saleOptions.find((o) => o.key === sale.key)?.price ?? 0;
                setMessage({ tone: "success", text: `Vente enregistrée : ${formatEuros(price * quantity)}` });
                setSale(null);
              }}
            >
              Enregistrer la vente
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
