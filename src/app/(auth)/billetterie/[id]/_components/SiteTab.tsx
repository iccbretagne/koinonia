"use client";

import { useState, type ReactNode } from "react";
import { Alert, Button, Checkbox, Input, Select, StatusChip, useToast } from "@/components/ui";
import SitePagesEditor from "./SitePagesEditor";
import { BackgroundFields, ImageField } from "./SiteFields";
import SiteRenderer from "@/app/site/_components/SiteRenderer";
import {
  PALETTE_KEYS,
  PALETTE_LABEL,
  SITE_FONTS,
  SITE_FONT_LABEL,
  assetIdsOf,
  contrastIssues,
  type PublicEvent,
  type SiteDocument,
} from "@/modules/ticketing/schemas";
import type { SiteView } from "@/modules/ticketing";
import { useApi } from "../../use-api";

function Card({ title, children }: { readonly title: string; readonly children: ReactNode }) {
  return (
    <section className="space-y-3 rounded-card border border-line bg-surface p-4">
      <h2 className="font-semibold text-ink">{title}</h2>
      {children}
    </section>
  );
}

/** Téléverse une image du site ; renvoie son identifiant. */
async function uploadImage(eventId: string, file: File): Promise<string> {
  const body = new FormData();
  body.set("file", file);
  const res = await fetch(`/api/ticketing/events/${eventId}/site/assets`, { method: "POST", body });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Dépôt refusé");
  return data.id as string;
}

/**
 * Onglet « Site » (spec 084) : thème, accueil, aperçu (mêmes composants que le site public, sur le
 * brouillon), publication. Ouvert aux rôles Organisateur et Communication.
 */
export default function SiteTab({
  eventId,
  site,
  event,
  title,
  churchSlug,
  eventSlug,
  sitesEnabled,
  baseDomain,
}: {
  readonly eventId: string;
  readonly site: SiteView;
  readonly event: PublicEvent | null;
  readonly title: string;
  readonly churchSlug: string;
  readonly eventSlug: string;
  readonly sitesEnabled: boolean;
  readonly baseDomain?: string;
}) {
  const { call, busy } = useApi();
  const toast = useToast();
  const [doc, setDoc] = useState<SiteDocument>(site.draft);
  const [dirty, setDirty] = useState(false);
  const [published, setPublished] = useState(site.published);
  const [previewPage, setPreviewPage] = useState<string | undefined>();
  const [uploaded, setUploaded] = useState<string[]>([]);
  const [afterClose, setAfterClose] = useState(site.afterCloseDays);

  const assetUrl = (id: string) => `/api/ticketing/events/${eventId}/site/assets/${id}`;
  const issues = contrastIssues(doc).map((i) => i.message);
  const edit = (fn: (d: SiteDocument) => void) => {
    setDoc((prev) => {
      const next = structuredClone(prev);
      fn(next);
      return next;
    });
    setDirty(true);
  };
  const upload = async (file: File, then: (id: string) => void) => {
    try {
      const id = await uploadImage(eventId, file);
      setUploaded((u) => [...u, id]);
      then(id);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Dépôt refusé");
    }
  };

  const hero = doc.pages[0].sections.flatMap((s) => s.blocks).find((b) => b.kind === "hero");
  const tools = { assetUrl, upload, pool: [...new Set([...assetIdsOf(doc), ...uploaded])] };

  async function save() {
    const saved = await call<SiteView>(`/api/ticketing/events/${eventId}/site`, "PUT", doc, "Brouillon enregistré");
    if (saved) setDirty(false);
  }
  async function publish() {
    const res = await call<SiteView>(`/api/ticketing/events/${eventId}/site/publish`, "POST", undefined, "Site publié");
    if (res) setPublished(true);
  }
  async function unpublish() {
    const res = await call<SiteView>(`/api/ticketing/events/${eventId}/site/publish`, "DELETE", undefined, "Site dépublié");
    if (res) setPublished(false);
  }

  return (
    <div className="space-y-6">
      {!sitesEnabled && <Alert tone="info" title="Sites d'événement désactivés.">L&apos;administrateur de l&apos;église ne les a pas activés : le site est modifiable mais n&apos;est pas visible du public.</Alert>}
      {issues.length > 0 && (
        <Alert tone="danger" title="Textes peu lisibles.">
          <ul className="list-disc pl-5">{issues.map((m) => <li key={m}>{m}</li>)}</ul>
        </Alert>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <StatusChip tone={published ? "success" : "neutral"}>{published ? "Publié" : "Non publié"}</StatusChip>
        <span className="text-[13px] text-ink-muted">Adresse : {site.slug}{baseDomain ? `.${baseDomain}` : ""}</span>
        <div className="ml-auto flex flex-wrap gap-2">
          <Button type="button" variant="secondary" disabled={busy || !dirty} onClick={save}>Enregistrer le brouillon</Button>
          <Button type="button" disabled={busy || dirty || issues.length > 0} onClick={publish}>{published ? "Republier" : "Publier"}</Button>
          {published && <Button type="button" variant="secondary" disabled={busy} onClick={unpublish}>Dépublier</Button>}
        </div>
      </div>
      {dirty && <p className="text-[13px] text-ink-muted">Modifications non enregistrées : enregistrez le brouillon avant de publier.</p>}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,22rem)_1fr]">
        <div className="space-y-4">
          <Card title="Couleurs">
            <div className="grid grid-cols-2 gap-3">
              {PALETTE_KEYS.map((key) => (
                <label key={key} className="flex items-center gap-2 text-sm text-ink">
                  <input type="color" value={doc.theme.colors[key]} onChange={(e) => edit((d) => void (d.theme.colors[key] = e.target.value.toLowerCase()))} className="size-9 cursor-pointer rounded border border-line" />
                  {PALETTE_LABEL[key]}
                </label>
              ))}
            </div>
          </Card>
          <Card title="Polices">
            <Select label="Titres" value={doc.theme.fonts.heading} options={SITE_FONTS.map((f) => ({ value: f, label: SITE_FONT_LABEL[f] }))} onChange={(e) => edit((d) => void (d.theme.fonts.heading = e.target.value as (typeof SITE_FONTS)[number]))} />
            <Select label="Texte" value={doc.theme.fonts.body} options={SITE_FONTS.map((f) => ({ value: f, label: SITE_FONT_LABEL[f] }))} onChange={(e) => edit((d) => void (d.theme.fonts.body = e.target.value as (typeof SITE_FONTS)[number]))} />
          </Card>
          <Card title="Images et fond">
            <ImageField label="Logo" current={doc.theme.logoAssetId} tools={tools} onPick={(id) => edit((d) => void (d.theme.logoAssetId = id))} onClear={() => edit((d) => void delete d.theme.logoAssetId)} />
            <ImageField label="Image d'en-tête" current={doc.theme.headerAssetId} tools={tools} onPick={(id) => edit((d) => void (d.theme.headerAssetId = id))} onClear={() => edit((d) => void delete d.theme.headerAssetId)} />
            <BackgroundFields label="Fond de page" value={doc.theme.background} tools={tools} onChange={(bg) => edit((d) => void (d.theme.background = bg))} />
          </Card>
          <Card title="Accueil">
            {hero ? (
              <>
                <Input label="Titre" value={hero.title} maxLength={120} onChange={(e) => edit((d) => void (heroOf(d).title = e.target.value))} />
                <Input label="Accroche" value={hero.tagline ?? ""} maxLength={240} onChange={(e) => edit((d) => void (heroOf(d).tagline = e.target.value || undefined))} />
                <Input label="Texte du bouton" value={hero.buttonLabel ?? ""} maxLength={40} placeholder="Je m'inscris" onChange={(e) => edit((d) => void (heroOf(d).buttonLabel = e.target.value || undefined))} />
                <label className="flex items-center gap-2 text-sm text-ink"><Checkbox checked={hero.showDateLocation} onChange={(e) => edit((d) => void (heroOf(d).showDateLocation = e.target.checked))} /> Date et lieu</label>
                <label className="flex items-center gap-2 text-sm text-ink"><Checkbox checked={hero.showCountdown} onChange={(e) => edit((d) => void (heroOf(d).showCountdown = e.target.checked))} /> Compte à rebours</label>
              </>
            ) : (
              <p className="text-sm text-ink-muted">La page d&apos;accueil n&apos;a pas de bandeau d&apos;accueil.</p>
            )}
          </Card>
          <Card title="Après l'événement">
            <Input label="Jours d'affichage de « Événement terminé » (1 à 365)" type="number" min={1} max={365} value={afterClose} onChange={(e) => setAfterClose(Number(e.target.value))} />
            <Button type="button" variant="secondary" size="sm" disabled={busy || afterClose === site.afterCloseDays || !(afterClose >= 1 && afterClose <= 365)} onClick={() => call<SiteView>(`/api/ticketing/events/${eventId}/site`, "PATCH", { afterCloseDays: afterClose }, "Durée enregistrée")}>Enregistrer la durée</Button>
          </Card>
          <SitePagesEditor doc={doc} edit={edit} tools={tools} />
        </div>

        <div className="min-w-0 space-y-2">
          <h2 className="font-semibold text-ink">Aperçu du brouillon</h2>
          <div className="max-h-[80vh] overflow-auto rounded-card border border-line">
            <SiteRenderer
              document={doc}
              event={event}
              title={title}
              churchSlug={churchSlug}
              eventSlug={eventSlug}
              ended={false}
              pageSlug={previewPage}
              assetUrl={assetUrl}
              pageHref={() => "#"}
              onNavigate={setPreviewPage}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function heroOf(d: SiteDocument) {
  const block = d.pages[0].sections.flatMap((s) => s.blocks).find((b) => b.kind === "hero");
  if (!block || block.kind !== "hero") throw new Error("Bandeau d'accueil introuvable");
  return block;
}
