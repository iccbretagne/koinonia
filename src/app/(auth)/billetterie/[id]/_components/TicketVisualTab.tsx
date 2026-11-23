"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { Alert, Button, Checkbox, Input, Select, useToast } from "@/components/ui";
import { defaultTicketVisual, TICKET_FIELDS, TICKET_FONTS, ticketVisualSchema, type TicketVisual, type TicketText } from "@/modules/ticketing/schemas";
import { useApi } from "../../use-api";

type Image = { id: string; name: string; width: number; height: number };
const labels = { participant: "Nom, référence et catégorie", date: "Date et heure", location: "Lieu", address: "Adresse" };
export default function TicketVisualTab({ eventId, initial, images: initialImages, canEdit }: {
  readonly eventId: string;
  readonly initial: { draft: TicketVisual | null; published: TicketVisual | null };
  readonly images: Image[];
  readonly canEdit: boolean;
}) {
  const [doc, setDoc] = useState(initial.draft ?? initial.published);
  const [images, setImages] = useState(initialImages);
  const [published, setPublished] = useState(!!initial.published);
  const [saved, setSaved] = useState(JSON.stringify(initial.draft ?? initial.published));
  const [preview, setPreview] = useState<string | null>(null);
  const [previewed, setPreviewed] = useState("");
  const [previewError, setPreviewError] = useState("");
  const [uploading, setUploading] = useState(false);
  const { call, busy } = useApi();
  const toast = useToast();
  const base = `/api/ticketing/events/${eventId}/ticket-visual`;
  const parsed = ticketVisualSchema.safeParse(doc);
  const valid = parsed.success;
  const dirty = JSON.stringify(doc) !== saved;

  useEffect(() => {
    if (!canEdit || !dirty) return;
    const guard = (e: BeforeUnloadEvent) => e.preventDefault();
    globalThis.addEventListener("beforeunload", guard);
    return () => globalThis.removeEventListener("beforeunload", guard);
  }, [canEdit, dirty]);

  useEffect(() => {
    if (!doc || !valid) return;
    const controller = new AbortController();
    let url: string | null = null;
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`${base}/preview`, canEdit ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(doc), signal: controller.signal } : { signal: controller.signal });
        if (!res.ok) { const err = await res.json(); setPreviewError(err.error ?? "Aperçu indisponible"); return; }
        url = URL.createObjectURL(await res.blob());
        if (controller.signal.aborted) { URL.revokeObjectURL(url); return; }
        setPreview(url);
        setPreviewed(JSON.stringify(doc));
        setPreviewError("");
      } catch (error) {
        if (!controller.signal.aborted) setPreviewError(error instanceof Error ? error.message : "Aperçu indisponible");
      }
    }, 500);
    return () => { clearTimeout(timer); controller.abort(); if (url) URL.revokeObjectURL(url); };
  }, [doc, valid, base, canEdit]);

  const field = (key: (typeof TICKET_FIELDS)[number], patch: Partial<TicketText>) => setDoc((d) => d && ({ ...d, [key]: { ...d[key], ...patch } }));
  async function upload(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    try {
      const form = new FormData(); form.set("file", file);
      const res = await fetch(`${base}/images`, { method: "POST", body: form });
      const result = await res.json();
      if (!res.ok) { toast.error(result.error ?? "Image refusée"); return; }
      setImages((list) => [...list, result]);
      if (!doc && result.height > result.width && result.width >= 600) setDoc(defaultTicketVisual(result.id));
      toast.success("Image ajoutée");
    } catch { toast.error("Le dépôt n'a pas abouti."); }
    finally { setUploading(false); }
  }
  async function save(publish: boolean) {
    if (!doc) return;
    const result = await call(`${base}`, "PUT", { document: doc, publish }, publish ? "Visuel publié sur tous les billets" : "Brouillon enregistré");
    if (result) { setSaved(JSON.stringify(doc)); if (publish) setPublished(true); }
  }
  const imageOptions = images.map((i) => ({ value: i.id, label: `${i.name || i.id} (${i.width} × ${i.height})` }));
  return (
    <div className="space-y-5">
      <Alert tone="info" title={published ? "Un visuel est publié sur les billets." : "Les billets gardent leur présentation standard."}>
        Le brouillon ne change les billets qu&apos;après publication. Le retrait rétablit la présentation standard, sans nouvel email.
      </Alert>
      <div className="grid items-start gap-6 lg:grid-cols-2">
        <div className="space-y-4">
          {canEdit && <div className="space-y-3 rounded-card border border-line bg-surface p-4">
            <Input type="file" label="Déposer un fond ou une image de vignette" accept="image/png,image/jpeg,image/webp,image/svg+xml" disabled={uploading || busy} onChange={(e) => { void upload(e.target.files?.[0]); e.target.value = ""; }} hint="8 Mo au plus. Fond portrait, 600 px de large au moins, sans QR ni nom. Recadré au format 2:3." />
            <p className="text-sm text-ink-muted">Identifiants utilisables par votre assistant IA :</p>
            {images.map((i) => <div key={i.id} className="flex items-center justify-between gap-2 text-sm text-ink-muted"><span className="break-all">{i.name} · {i.id}</span><Button size="sm" variant="ghost" disabled={busy} onClick={async () => { if (await call(`${base}/images/${i.id}`, "DELETE", undefined, "Image supprimée")) setImages((list) => list.filter((a) => a.id !== i.id)); }}>Supprimer</Button></div>)}
            {!doc && images.some((i) => i.height > i.width && i.width >= 600) && <Button onClick={() => setDoc(defaultTicketVisual(images.find((i) => i.height > i.width && i.width >= 600)!.id))}>Créer le brouillon</Button>}
          </div>}
          {doc && canEdit && <>
            <Select label="Image de fond" options={imageOptions.filter((o) => images.some((i) => i.id === o.value && i.height > i.width && i.width >= 600))} value={doc.backgroundId} onChange={(e) => setDoc({ ...doc, backgroundId: e.target.value })} />
            <p className="text-sm text-ink-muted">Positions et dimensions en pixels sur un billet de 1000 × 1500. L&apos;aperçu utilise un nom long fictif.</p>
            <fieldset className="space-y-3 rounded-card border border-line p-4"><legend className="font-semibold text-ink">QR code obligatoire</legend>
              <div className="grid grid-cols-3 gap-2">{(["x", "y", "size"] as const).map((key) => <Input key={key} label={{ x: "X", y: "Y", size: "Taille" }[key]} type="number" min={key === "size" ? 180 : 0} max={key === "size" ? 600 : key === "x" ? 820 : 1320} value={doc.qr[key]} onChange={(e) => setDoc({ ...doc, qr: { ...doc.qr, [key]: Number(e.target.value) } })} />)}</div>
              <p className="text-sm text-ink-muted">Fond blanc et marge de sécurité automatiques. Le QR passe au-dessus des autres vignettes.</p>
              {doc.qr.size < 240 && <Alert tone="warning" title="QR proche de la taille minimale">Préférez 240 px ou plus pour une lecture facile sur téléphone et papier.</Alert>}
            </fieldset>
            {TICKET_FIELDS.map((key) => <fieldset key={key} className="space-y-3 rounded-card border border-line p-4"><legend className="font-semibold text-ink">{labels[key]}</legend>
              <label className="flex items-center gap-2 text-ink"><Checkbox checked={doc[key].visible} onChange={(e) => field(key, { visible: e.target.checked })} /> Afficher</label>
              <div className="grid grid-cols-2 gap-2">{(["x", "y", "width", "height"] as const).map((coord) => <Input key={coord} label={{ x: "X", y: "Y", width: "Largeur", height: "Hauteur" }[coord]} type="number" min={coord === "x" || coord === "y" ? 0 : 40} value={doc[key][coord]} onChange={(e) => field(key, { [coord]: Number(e.target.value) })} />)}</div>
              {key !== "participant" && <Select label="Rendu" options={[{ value: "text", label: "Texte de l'événement" }, { value: "image", label: "Image fixe" }]} value={doc[key].mode} onChange={(e) => field(key, { mode: e.target.value as "text" | "image" })} />}
              {doc[key].mode === "image" ? <Select label="Image de la vignette" placeholder="Choisir une image" options={imageOptions} value={doc[key].imageId ?? ""} onChange={(e) => field(key, { imageId: e.target.value || null })} /> : <>
                <Select label="Police" options={TICKET_FONTS.map((font) => ({ value: font, label: { "sans-serif": "Sans empattement", serif: "Avec empattement", monospace: "Chasse fixe" }[font] }))} value={doc[key].font} onChange={(e) => field(key, { font: e.target.value as TicketText["font"] })} />
                <Input label="Taille du texte" type="number" min={14} max={100} value={doc[key].fontSize} onChange={(e) => field(key, { fontSize: Number(e.target.value) })} />
                <Input label="Couleur du texte" type="color" value={doc[key].color} onChange={(e) => field(key, { color: e.target.value })} />
                {(["background", "border"] as const).map((style) => <div key={style} className="space-y-2"><label className="flex items-center gap-2 text-ink"><Checkbox checked={doc[key][style] !== null} onChange={(e) => field(key, { [style]: e.target.checked ? "#ffffff" : null })} />{style === "background" ? "Fond" : "Bordure"}</label>{doc[key][style] !== null && <Input type="color" label={style === "background" ? "Couleur du fond" : "Couleur de bordure"} value={doc[key][style]!} onChange={(e) => field(key, { [style]: e.target.value })} />}</div>)}
              </>}
            </fieldset>)}
            <Alert tone="info" title="Date, lieu et adresse">Le texte suit les paramètres de l&apos;événement. Une image fixe doit être remplacée manuellement si ces informations changent.</Alert>
          </>}
        </div>
        <div className="space-y-3 lg:sticky lg:top-6">
          <h2 className="font-semibold text-ink">Aperçu fictif — non valable à l&apos;entrée</h2>
          {!doc && <p className="text-ink-muted">Aucun brouillon. Déposez un fond pour commencer.</p>}
          {!valid && doc && <Alert tone="warning" title="Réglages à corriger">{parsed.error.issues.map((i) => `${i.path.join(".")} : ${i.message}`).join(" ; ")}</Alert>}
          {previewError && <Alert tone="danger" title="Aperçu indisponible">{previewError}</Alert>}
          {preview && valid && !previewError && <Image unoptimized src={preview} alt="Billet fictif avec nom long, référence et QR de démonstration" width={1000} height={1500} className="h-auto w-full rounded-card border border-line" />}
        </div>
      </div>
      {canEdit && <div data-k-bottom-bar className="sticky bottom-20 flex flex-wrap gap-2 rounded-card border border-line bg-surface p-3 md:bottom-4">
        <Button variant="secondary" disabled={busy || !valid || !doc} onClick={() => save(false)}>Enregistrer le brouillon{dirty ? " *" : ""}</Button>
        <Button disabled={busy || !valid || !doc || !!previewError || !preview || previewed !== JSON.stringify(doc)} onClick={() => save(true)}>Publier sur les billets</Button>
        {published && <Button variant="ghost" disabled={busy} onClick={async () => { if (await call(base, "DELETE", undefined, "Visuel retiré des billets")) setPublished(false); }}>Retirer le visuel publié</Button>}
      </div>}
    </div>
  );
}
