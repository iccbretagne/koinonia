"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { Alert, Button, Checkbox, Input, Select, Textarea, useToast } from "@/components/ui";
import { convertTicketVisual, defaultTicketVisualV2, TICKET_FONTS, TICKET_VARIABLES, ticketTextStyleSchema, ticketVisualSchema, type TicketElement, type TicketVisual, type TicketVisualV2 } from "@/modules/ticketing/schemas";
import { useApi } from "../../use-api";

type Asset = { id: string; name: string; width: number; height: number };
const options = (items: readonly string[]) => items.map((value) => ({ value, label: value }));
export default function TicketVisualV2Tab({ eventId, initial, initialDocument, images: initialImages, canEdit }: {
  readonly eventId: string; readonly initial: { draft: TicketVisual | null; published: TicketVisual | null };
  readonly initialDocument: TicketVisualV2 | null; readonly images: Asset[]; readonly canEdit: boolean;
}) {
  const [history, setHistory] = useState<TicketVisualV2[]>([initialDocument ?? defaultTicketVisualV2()]);
  const [cursor, setCursor] = useState(0);
  const doc = history[cursor];
  const [saved, setSaved] = useState(JSON.stringify(initial.draft ?? initial.published));
  const [images, setImages] = useState(initialImages);
  const [selected, setSelected] = useState(doc.elements[0]?.id);
  const [published, setPublished] = useState(!!initial.published);
  const [preview, setPreview] = useState("");
  const [previewed, setPreviewed] = useState("");
  const [error, setError] = useState("");
  const [profile, setProfile] = useState("3");
  const [category, setCategory] = useState("adult");
  const [zoom, setZoom] = useState("100");
  const [safety, setSafety] = useState(true);
  const [uploading, setUploading] = useState(false);
  const drag = useRef<{ x: number; y: number; width: number; element: TicketElement; doc: TicketVisualV2; resize: boolean } | null>(null);
  const { call, busy } = useApi();
  const toast = useToast();
  const base = `/api/ticketing/events/${eventId}/ticket-visual`;
  const parsed = ticketVisualSchema.safeParse(doc);
  const serialized = JSON.stringify(doc);
  const dirty = serialized !== saved;
  const element = doc.elements.find((e) => e.id === selected);
  function commit(next: TicketVisualV2) {
    setHistory((h) => [...h.slice(0, cursor + 1).slice(-49), next]);
    setCursor(Math.min(cursor + 1, 49));
  }
  function patch(value: Partial<TicketElement>) {
    if (!element) return;
    commit({ ...doc, elements: doc.elements.map((e) => e.id === element.id ? { ...e, ...value } as TicketElement : e) });
  }
  useEffect(() => {
    if (!dirty || !canEdit) return;
    const guard = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [dirty, canEdit]);
  useEffect(() => {
    if (!parsed.success) return;
    const controller = new AbortController();
    let url = "";
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`${base}/preview?profile=${profile}&category=${category}`, canEdit ? { method: "POST", headers: { "Content-Type": "application/json" }, body: serialized, signal: controller.signal } : { signal: controller.signal });
        if (!response.ok) { const body = await response.json(); throw new Error(body.error ?? "Aperçu indisponible"); }
        url = URL.createObjectURL(await response.blob());
        if (controller.signal.aborted) { URL.revokeObjectURL(url); return; }
        setPreview(url); setPreviewed(serialized); setError("");
      } catch (e) { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "Aperçu indisponible"); }
    }, 450);
    return () => { clearTimeout(timer); controller.abort(); if (url) URL.revokeObjectURL(url); };
  }, [serialized, parsed.success, base, canEdit, profile, category]);
  async function upload(file?: File) {
    if (!file) return;
    setUploading(true);
    try {
      const form = new FormData(); form.set("file", file);
      const res = await fetch(`${base}/images`, { method: "POST", body: form });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Image refusée");
      setImages((all) => [...all, body]); toast.success("Image ajoutée");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Dépôt impossible"); }
    finally { setUploading(false); }
  }
  async function save(publish: boolean) {
    if (publish && !window.confirm("Publier ce modèle sur tous les billets existants ?")) return;
    const result = await call(base, "PUT", { document: doc, publish }, publish ? "Visuel publié" : "Brouillon enregistré");
    if (result) { setSaved(serialized); if (publish) setPublished(true); }
  }
  function add(type: "text" | "image" | "shape") {
    if (type === "image" && !images.length) { toast.error("Déposez une image avant de l'ajouter."); return; }
    const common = { id: crypto.randomUUID(), name: type === "text" ? "Texte" : type === "image" ? "Image" : "Décor", x: 70, y: 50, width: 860, height: 160, locked: false };
    const e: TicketElement = type === "text" ? { ...common, type, content: "Texte", style: ticketTextStyleSchema.parse({ color: "#f1dda5" }) } : type === "image" ? { ...common, type, imageId: images[0].id } : { ...common, type, shape: "rectangle", color: "#464e32" };
    commit({ ...doc, elements: [...doc.elements, e] }); setSelected(e.id);
  }
  function order(direction: number) {
    const elements = [...doc.elements]; const index = elements.findIndex((e) => e.id === selected); const target = index + direction;
    if (target < 0 || target >= elements.length) return;
    [elements[index], elements[target]] = [elements[target], elements[index]]; commit({ ...doc, elements });
  }
  const imageOptions = images.map((i) => ({ value: i.id, label: i.name || i.id }));
  return <div className="space-y-4">
    <Alert tone="info" title={published ? "Un modèle est publié" : "Brouillon V2"}>L&apos;enregistrement ne change aucun billet publié. L&apos;aperçu est fictif ; le QR réel sera généré pour chaque participant.</Alert>
    <div className="grid items-start gap-6 xl:grid-cols-[360px_1fr]">
      <fieldset disabled={!canEdit || busy} className="min-w-0 space-y-4">
        <div className="flex flex-wrap gap-2"><Button variant="secondary" disabled={cursor === 0} onClick={() => setCursor(cursor - 1)}>Annuler</Button><Button variant="secondary" disabled={cursor === history.length - 1} onClick={() => setCursor(cursor + 1)}>Rétablir</Button></div>
        <Input label="Importer une image" type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" disabled={uploading} onChange={(e) => { void upload(e.target.files?.[0]); e.target.value = ""; }} />
        <Select label="Fond portrait (facultatif)" value={doc.backgroundId ?? ""} options={[{ value: "", label: "Couleur unie" }, ...imageOptions.filter((o) => images.some((i) => i.id === o.value && i.height > i.width && i.width >= 600))]} onChange={(e) => commit({ ...doc, backgroundId: e.target.value || null })} />
        <Input label="Couleur de fond" type="color" value={doc.backgroundColor} onChange={(e) => commit({ ...doc, backgroundColor: e.target.value })} />
        <div className="flex flex-wrap gap-2"><Button onClick={() => add("text")}>+ Texte</Button><Button onClick={() => add("image")}>+ Image</Button><Button onClick={() => add("shape")}>+ Décor</Button></div>
        <Select label="Éléments (du fond au premier plan, QR toujours protégé)" options={doc.elements.map((e) => ({ value: e.id, label: `${e.locked ? "🔒 " : ""}${e.name}` }))} value={selected} onChange={(e) => setSelected(e.target.value)} />
        {element && <div className="space-y-3 rounded-card border border-line p-3">
          <Input label="Nom de l'élément" value={element.name} onChange={(e) => patch({ name: e.target.value })} />
          <label className="flex gap-2"><Checkbox checked={element.locked} onChange={(e) => patch({ locked: e.target.checked })} />Verrouiller la position</label>
          <div className="grid grid-cols-2 gap-2">{(["x", "y", "width", "height"] as const).map((key) => <Input key={key} label={{ x: "X", y: "Y", width: "Largeur", height: "Hauteur" }[key]} type="number" disabled={element.locked} value={element[key]} onChange={(e) => { const value = Math.round(Number(e.target.value)); patch((element.type === "qrCode" || (element.type === "shape" && element.shape === "circle")) && (key === "width" || key === "height") ? { width: value, height: value } : { [key]: value }); }} />)}</div>
          <div className="flex flex-wrap gap-2"><Button size="sm" variant="secondary" disabled={element.locked} onClick={() => patch({ x: Math.round((1000 - element.width) / 2) })}>Centrer</Button><Button size="sm" variant="secondary" disabled={element.locked} onClick={() => patch({ x: 0, y: 0 })}>Réinitialiser</Button><Button size="sm" variant="secondary" onClick={() => order(-1)}>Reculer</Button><Button size="sm" variant="secondary" onClick={() => order(1)}>Avancer</Button></div>
          {element.type === "text" && <>
            <Textarea label="Texte et variables" rows={4} value={element.content} onChange={(e) => patch({ content: e.target.value })} />
            <Select label="Insérer une variable" value="" options={[{ value: "", label: "Choisir…" }, ...options(TICKET_VARIABLES)]} onChange={(e) => { if (e.target.value) patch({ content: `${element.content}{${e.target.value}}` }); }} />
            {(["fontFamily", "fontWeight", "textAlign", "verticalAlign", "autoFit"] as const).map((key) => <Select key={key} label={{ fontFamily: "Police", fontWeight: "Graisse", textAlign: "Alignement horizontal", verticalAlign: "Alignement vertical", autoFit: "Adaptation" }[key]} value={element.style[key]} options={options({ fontFamily: TICKET_FONTS, fontWeight: ["normal", "bold"], textAlign: ["left", "center", "right"], verticalAlign: ["top", "middle", "bottom"], autoFit: ["fixed", "shrink", "wrap"] }[key])} onChange={(e) => patch({ style: { ...element.style, [key]: e.target.value } })} />)}
            <div className="grid grid-cols-2 gap-2">{(["fontSize", "minFontSize", "lineHeight", "letterSpacing", "padding", "maxLines"] as const).map((key) => <Input key={key} label={{ fontSize: "Taille maximale", minFontSize: "Taille minimale", lineHeight: "Interligne", letterSpacing: "Espacement", padding: "Marge interne", maxLines: "Lignes maximales" }[key]} type="number" step={key === "lineHeight" ? 0.05 : 1} value={element.style[key]} onChange={(e) => patch({ style: { ...element.style, [key]: Number(e.target.value) } })} />)}</div>
            {(["background", "border"] as const).map((key) => <div key={key}><label className="flex gap-2"><Checkbox checked={element.style[key] !== null} onChange={(e) => patch({ style: { ...element.style, [key]: e.target.checked ? "#ffffff" : null } })} />{key === "background" ? "Fond du texte" : "Bordure du texte"}</label>{element.style[key] && <Input label={key === "background" ? "Couleur du panneau" : "Couleur de bordure"} type="color" value={element.style[key]} onChange={(e) => patch({ style: { ...element.style, [key]: e.target.value } })} />}</div>)}
            <Input label="Couleur du texte" type="color" value={element.style.color} onChange={(e) => patch({ style: { ...element.style, color: e.target.value } })} />
          </>}
          {element.type === "image" && <Select label="Image" options={imageOptions} value={element.imageId} onChange={(e) => patch({ imageId: e.target.value })} />}
          {element.type === "shape" && <><Select label="Forme" options={options(["rectangle", "circle", "line"])} value={element.shape} onChange={(e) => patch({ shape: e.target.value as "rectangle" | "circle" | "line", ...(e.target.value === "circle" ? { width: Math.min(element.width, element.height), height: Math.min(element.width, element.height) } : {}) })} /><Input label="Couleur" type="color" value={element.color} onChange={(e) => patch({ color: e.target.value })} /></>}
          {element.type === "qrCode" && <Alert tone={element.width < 240 ? "warning" : "info"} title="QR officiel protégé">Carré, fond blanc, marge de quatre modules. Préférez au moins 240 px.</Alert>}
          <div className="flex gap-2"><Button size="sm" variant="secondary" disabled={element.type === "qrCode"} onClick={() => { const copy = { ...element, id: crypto.randomUUID(), name: `${element.name} (copie)` }; commit({ ...doc, elements: [...doc.elements, copy] }); setSelected(copy.id); }}>Dupliquer</Button><Button size="sm" variant="ghost" disabled={element.type === "qrCode"} onClick={() => commit({ ...doc, elements: doc.elements.filter((e) => e.id !== selected) })}>Supprimer</Button></div>
        </div>}
        {initial.published && <Button variant="secondary" onClick={() => { if (initial.published) commit(initial.published.version === 2 ? initial.published : convertTicketVisual(initial.published)); }}>Restaurer le publié dans le brouillon</Button>}
      </fieldset>
      <div className="min-w-0 space-y-3 xl:sticky xl:top-4">
        <h2 className="font-semibold">Aperçu serveur — billet fictif</h2>
        <div className="grid grid-cols-2 gap-2"><Select label="Profil fictif" value={profile} options={[{ value: "0", label: "Jean Koné" }, { value: "1", label: "Marie-Claire Ouattara" }, { value: "2", label: "Jean-Baptiste Kouamé N'Guessan" }, { value: "3", label: "Nom très long" }]} onChange={(e) => setProfile(e.target.value)} /><Select label="Catégorie fictive" value={category} options={[{ value: "adult", label: "Adulte" }, { value: "child", label: "Enfant" }]} onChange={(e) => setCategory(e.target.value)} /></div>
        <Select label="Zoom" value={zoom} options={[{ value: "60", label: "60 %" }, { value: "100", label: "Adapter à la largeur" }, { value: "150", label: "150 %" }]} onChange={(e) => setZoom(e.target.value)} />
        <label className="flex gap-2"><Checkbox checked={safety} onChange={(e) => setSafety(e.target.checked)} />Afficher la zone de sécurité (30 px) et les repères centraux</label>
        {!parsed.success && <Alert tone="warning" title="Zones invalides">{parsed.error.issues.map((i) => i.message).join(" ; ")}</Alert>}
        {error && <Alert tone="danger" title="Rendu à corriger">{error}</Alert>}
        {previewed !== serialized && <p role="status" className="text-sm text-ink-muted">Aperçu en cours de mise à jour…</p>}
        <div className="overflow-auto">
          <div className="relative" style={{ width: `${zoom}%`, aspectRatio: "2 / 3" }}>
            {preview && <Image unoptimized src={preview} alt="Aperçu fictif du billet" width={1000} height={1500} className="absolute inset-0 h-full w-full" />}
            {safety && <><div className="pointer-events-none absolute border border-dashed border-ink mix-blend-difference" style={{ left: "3%", right: "3%", top: "2%", bottom: "2%" }} /><div className="pointer-events-none absolute inset-y-0 left-1/2 border-l border-dashed border-ink mix-blend-difference" /><div className="pointer-events-none absolute inset-x-0 top-1/2 border-t border-dashed border-ink mix-blend-difference" /></>}
            {canEdit && doc.elements.map((e) => <div key={e.id} role="button" tabIndex={0} aria-label={`Sélectionner ${e.name}`} onClick={() => setSelected(e.id)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setSelected(e.id); } }} className={`absolute ${e.id === selected ? "border-2 border-focus" : "hover:border hover:border-line"}`} style={{ left: `${e.x / 10}%`, top: `${e.y / 15}%`, width: `${e.width / 10}%`, height: `${e.height / 15}%`, cursor: e.locked ? "pointer" : "move", touchAction: "none", zIndex: e.type === "qrCode" ? 60 : undefined }}
              onPointerDown={(event) => {
                setSelected(e.id); if (e.locked) return;
                event.currentTarget.setPointerCapture(event.pointerId);
                drag.current = { x: event.clientX, y: event.clientY, width: event.currentTarget.parentElement!.getBoundingClientRect().width, element: e, doc, resize: (event.target as HTMLElement).dataset.resize === "true" };
              }}
              onPointerMove={(event) => {
                const d = drag.current; if (!d || d.element.id !== e.id) return;
                const dx = (event.clientX - d.x) * 1000 / d.width, dy = (event.clientY - d.y) * 1000 / d.width;
                const snap = (value: number, targets: number[]) => Math.round(targets.find((t) => Math.abs(t - value) < 10) ?? value);
                let change: Partial<TicketElement>;
                if (d.resize) {
                  const square = e.type === "qrCode" || (e.type === "shape" && e.shape === "circle");
                  const width = Math.round(Math.max(e.type === "qrCode" ? 180 : 40, Math.min(square ? Math.min(e.type === "qrCode" ? 600 : 1000, 1000 - d.element.x, 1500 - d.element.y) : 1000 - d.element.x, d.element.width + dx)));
                  change = { width, height: square ? width : Math.round(Math.max(40, Math.min(1500 - d.element.y, d.element.height + dy))) };
                } else change = { x: snap(Math.max(0, Math.min(1000 - d.element.width, d.element.x + dx)), [0, (1000 - d.element.width) / 2, 1000 - d.element.width]), y: snap(Math.max(0, Math.min(1500 - d.element.height, d.element.y + dy)), [0, (1500 - d.element.height) / 2, 1500 - d.element.height]) };
                const next = { ...d.doc, elements: d.doc.elements.map((v) => v.id === e.id ? { ...v, ...change } as TicketElement : v) };
                // Un déplacement continu occupe une seule entrée dans l'historique.
                setHistory((h) => [...h.slice(0, cursor), next, ...h.slice(cursor + 1)]);
              }}
              onPointerUp={() => { const d = drag.current; if (!d) return; drag.current = null; const next = doc; if (JSON.stringify(next) === JSON.stringify(d.doc)) return; setHistory((h) => [...h.slice(0, cursor), d.doc, next].slice(-50)); setCursor(Math.min(cursor + 1, 49)); }}
              onPointerCancel={() => { const d = drag.current; drag.current = null; if (d) setHistory((h) => [...h.slice(0, cursor), d.doc, ...h.slice(cursor + 1)]); }}
            >{e.id === selected && !e.locked && <span data-resize="true" className="absolute -bottom-1 -right-1 size-4 cursor-se-resize bg-focus" />}</div>)}
          </div>
        </div>
      </div>
    </div>
    {canEdit && <div className="sticky bottom-20 flex flex-wrap gap-2 rounded-card border border-line bg-surface p-3 md:bottom-4">
      <Button variant="secondary" disabled={busy || !parsed.success} onClick={() => save(false)}>Enregistrer le brouillon{dirty ? " *" : ""}</Button>
      <Button disabled={busy || !parsed.success || !!error || previewed !== serialized} onClick={() => save(true)}>Publier sur les billets</Button>
      {published && <Button variant="ghost" disabled={busy} onClick={async () => { if (await call(base, "DELETE", undefined, "Visuel retiré")) setPublished(false); }}>Retirer le visuel publié</Button>}
    </div>}
  </div>;
}
