"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Alert, Button, EmptyState, Input, buttonClasses, useToast } from "@/components/ui";
import { FILE_INPUT } from "../_components/file-input-classes";

interface Asset {
  readonly id: string;
  readonly name: string;
  readonly alt: string;
  readonly width: number;
  readonly height: number;
}

interface Row {
  readonly file: File;
  readonly preview: string;
  alt: string;
  name: string;
  state: "ready" | "sending" | "done" | "error";
  error?: string;
}

/** Dépôt de plusieurs images : un envoi par fichier sur la route de l'éditeur (mêmes contrôles). */
export default function SiteImagesUploader({ eventId, assets }: { readonly eventId: string; readonly assets: readonly Asset[] }) {
  const router = useRouter();
  const toast = useToast();
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);

  const patch = (i: number, p: Partial<Row>) => setRows((r) => r.map((x, j) => (j === i ? { ...x, ...p } : x)));

  function add(files: FileList | null) {
    if (!files) return;
    const added = [...files].map((file): Row => ({ file, preview: URL.createObjectURL(file), alt: "", name: file.name, state: "ready" }));
    setRows((r) => [...r, ...added]);
  }

  async function send() {
    setBusy(true);
    let sent = 0;
    for (const [i, row] of rows.entries()) {
      if (row.state === "done" || !row.alt.trim()) continue;
      patch(i, { state: "sending", error: undefined });
      const body = new FormData();
      body.set("file", row.file);
      body.set("alt", row.alt.trim());
      body.set("name", row.name.trim());
      try {
        // Envoi volontairement séquentiel : une image à la fois (8 Mo chacune), état ligne par ligne.
        const res = await fetch(`/api/ticketing/events/${eventId}/site/assets`, { method: "POST", body }); // NOSONAR
        const data = await res.json().catch(() => ({})); // NOSONAR
        if (!res.ok) throw new Error(data.error ?? "Dépôt refusé");
        patch(i, { state: "done" });
        sent++;
      } catch (e) {
        patch(i, { state: "error", error: e instanceof Error ? e.message : "Dépôt refusé" });
      }
    }
    setBusy(false);
    if (sent) {
      toast.success(`${sent} image${sent > 1 ? "s" : ""} ajoutée${sent > 1 ? "s" : ""}`);
      router.refresh();
    }
  }

  const pending = rows.filter((r) => r.state !== "done");

  return (
    <div className="flex flex-col gap-6">
      <Link href={`/billetterie/${eventId}?vue=site`} className={`${buttonClasses("ghost", "sm")} min-h-11 self-start sm:min-h-9`}>
        <ArrowLeft aria-hidden="true" className="size-4" strokeWidth={1.75} />
        Retour à l&apos;éditeur du site
      </Link>

      <section className="space-y-3 rounded-card border border-line bg-surface p-4">
        <h2 className="font-semibold text-ink">Déposer des images</h2>
        <input
          type="file"
          multiple
          accept="image/jpeg,image/png,image/webp,image/svg+xml"
          aria-label="Choisir des images (JPEG, PNG, WebP ou SVG, 8 Mo au plus chacune)"
          onChange={(e) => {
            add(e.target.files);
            e.target.value = "";
          }}
          className={FILE_INPUT}
        />
        {rows.map((row, i) => (
          <div key={`${row.file.name}-${i}`} className="flex flex-wrap items-start gap-3 border-t border-line pt-3">
            {/* eslint-disable-next-line @next/next/no-img-element -- aperçu local du fichier choisi */}
            <img src={row.preview} alt="" className="h-16 w-auto rounded-chip border border-line" />
            <div className="min-w-48 flex-1">
              <Input label="Texte alternatif (obligatoire)" value={row.alt} maxLength={200} disabled={row.state === "done"} onChange={(e) => patch(i, { alt: e.target.value })} />
            </div>
            <div className="min-w-40">
              <Input label="Nom (facultatif)" value={row.name} maxLength={120} disabled={row.state === "done"} onChange={(e) => patch(i, { name: e.target.value })} />
            </div>
            <output className="block w-full text-sm text-ink-muted">{rowStatus(row)}</output>
          </div>
        ))}
        {rows.some((r) => r.state === "error") && <Alert tone="danger">Certaines images sont refusées ; les autres sont envoyées.</Alert>}
        <Button type="button" disabled={busy || !pending.some((r) => r.alt.trim())} onClick={send}>
          {busy ? "Envoi en cours…" : "Envoyer les images"}
        </Button>
      </section>

      <section className="space-y-3">
        <h2 className="font-semibold text-ink">Images du site ({assets.length})</h2>
        {assets.length === 0 ? (
          <EmptyState title="Aucune image" description="Les images déposées apparaissent ici avec leur identifiant." />
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {assets.map((a) => (
              <li key={a.id} className="flex gap-3 rounded-card border border-line bg-surface p-3">
                {/* eslint-disable-next-line @next/next/no-img-element -- miniature servie par l'API de l'équipe */}
                <img src={`/api/ticketing/events/${eventId}/site/assets/${a.id}?w=640`} alt={a.alt} className="h-16 w-24 rounded-chip border border-line object-cover" />
                <div className="min-w-0 text-sm">
                  <p className="truncate font-medium text-ink">{a.name || "Sans nom"}</p>
                  <p className="text-ink-muted">{a.width}×{a.height}</p>
                  <code className="break-all text-xs text-ink-muted">{a.id}</code>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/** Libellé d'état d'une ligne de dépôt. */
function rowStatus(row: { state: string; error?: string; alt: string }): string {
  if (row.state === "done") return "Envoyée";
  if (row.state === "sending") return "Envoi en cours…";
  if (row.state === "error") return `Refusée : ${row.error}`;
  return row.alt.trim() ? "Prête" : "Texte alternatif manquant : envoi impossible";
}
