"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { Images } from "lucide-react";
import { Alert, Button, Checkbox, ConfirmModal, Input, Select, StatusChip, buttonClasses, useToast } from "@/components/ui";
import SitePagesEditor from "./SitePagesEditor";
import { BackgroundFields, ImageField } from "./SiteFields";
import SiteRenderer from "@/app/site/_components/SiteRenderer";
import SitePreviewDialog from "./SitePreviewDialog";
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
import DomainCard from "./DomainCard";
import type { DomainView } from "@/modules/ticketing";

function Card({ title, children }: { readonly title: string; readonly children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="font-semibold text-ink">{title}</h2>
      {children}
    </section>
  );
}

/** Téléverse une image du site ; renvoie son identifiant. */
async function uploadImage(eventId: string, file: File, alt: string): Promise<string> {
  const body = new FormData();
  body.set("file", file);
  body.set("alt", alt);
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
  publicUrl,
  warnings,
  canConfigure = false,
  domain = null,
}: {
  readonly eventId: string;
  readonly site: SiteView;
  readonly event: PublicEvent | null;
  readonly title: string;
  readonly churchSlug: string;
  readonly eventSlug: string;
  /** Adresse publique finale ; `null` sans adresse. */
  readonly publicUrl: string | null;
  /** Raisons pour lesquelles le site ne sera pas accessible (publier reste possible). */
  readonly warnings: readonly string[];
  /** Organisateur : peut demander un domaine dédié. */
  readonly canConfigure?: boolean;
  readonly domain?: DomainView | null;
}) {
  const { call, busy } = useApi();
  const toast = useToast();
  const [doc, setDoc] = useState<SiteDocument>(site.draft);
  const [dirty, setDirty] = useState(false);
  const [confirmSite, setConfirmSite] = useState<"publish" | "withdraw" | null>(null);
  const [published, setPublished] = useState(site.published);
  const [previewPage, setPreviewPage] = useState<string | undefined>();
  const [fullPreview, setFullPreview] = useState(false);
  const [uploaded, setUploaded] = useState<string[]>([]);
  const [library, setLibrary] = useState<{ id: string; name: string; alt: string }[]>([]);
  const [afterClose, setAfterClose] = useState(site.afterCloseDays);

  const assetUrl = (id: string, width?: number) => `/api/ticketing/events/${eventId}/site/assets/${id}${width ? `?w=${width}` : ""}`;
  const issues = contrastIssues(doc).map((i) => i.message);
  const edit = (fn: (d: SiteDocument) => void) => {
    setDoc((prev) => {
      const next = structuredClone(prev);
      fn(next);
      return next;
    });
    setDirty(true);
  };
  const upload = async (file: File, alt: string, then: (id: string) => void) => {
    try {
      const id = await uploadImage(eventId, file, alt);
      setUploaded((u) => [...u, id]);
      setLibrary((l) => [...l, { id, name: file.name, alt }]);
      then(id);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Dépôt refusé");
    }
  };

  // Images déjà téléversées sur le site (y compris par l'assistant) : proposées dans les sélecteurs.
  useEffect(() => {
    let live = true;
    fetch(`/api/ticketing/events/${eventId}/site/assets`)
      .then((res) => (res.ok ? res.json() : null))
      .then((body: { id: string; name: string; alt: string }[] | null) => {
        if (live && Array.isArray(body)) setLibrary(body.map(({ id, name, alt }) => ({ id, name, alt })));
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [eventId]);

  const hero = doc.pages[0].sections.flatMap((s) => s.blocks).find((b) => b.kind === "hero");
  const tools = { assetUrl, upload, library, pool: [...new Set([...assetIdsOf(doc), ...library.map((a) => a.id), ...uploaded])] };

  async function save() {
    const saved = await call<SiteView>(`/api/ticketing/events/${eventId}/site`, "PUT", doc, "Brouillon enregistré");
    if (saved) setDirty(false);
  }
  async function publish() {
    const res = await call<SiteView>(`/api/ticketing/events/${eventId}/site/publish`, "POST", undefined, "Site publié");
    if (res) { setPublished(true); setConfirmSite(null); }
  }
  async function unpublish() {
    const res = await call<SiteView>(`/api/ticketing/events/${eventId}/site/publish`, "DELETE", undefined, "Site dépublié");
    if (res) { setPublished(false); setConfirmSite(null); }
  }

  return (
    <div className="space-y-6">
      {warnings.length > 0 && (
        <Alert tone="warning" title="Le site ne sera pas accessible au public pour l'instant.">
          <ul className="list-disc pl-5">{warnings.map((w) => <li key={w}>{w}</li>)}</ul>
          <p className="mt-1">Vous pouvez publier : la version publiée sera servie dès que ces conditions seront remplies.</p>
        </Alert>
      )}
      {issues.length > 0 && (
        <Alert tone="danger" title="Textes peu lisibles.">
          <ul className="list-disc pl-5">{issues.map((m) => <li key={m}>{m}</li>)}</ul>
        </Alert>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <StatusChip tone={published ? "success" : "neutral"}>{published ? "Publié" : "Non publié"}</StatusChip>
        <span className="break-all text-[13px] text-ink-muted">Adresse : {publicUrl ?? "aucune pour l'instant"}</span>
        <div className="ml-auto flex flex-wrap gap-2">
          <Button type="button" variant="secondary" disabled={busy || !dirty} onClick={save}>Enregistrer le brouillon</Button>
          <Button type="button" disabled={busy || dirty || issues.length > 0} onClick={() => setConfirmSite("publish")}>{published ? "Republier le site" : "Publier le site"}</Button>
          {published && <Button type="button" variant="secondary" disabled={busy} onClick={() => setConfirmSite("withdraw")}>Dépublier le site</Button>}
        </div>
      </div>
      {confirmSite && <ConfirmModal
        open
        title={confirmSite === "publish" ? "Publier le site de l’événement ?" : "Dépublier le site de l’événement ?"}
        message={confirmSite === "publish"
          ? "Le site utilisera le dernier brouillon enregistré. Sa visibilité dépend des réglages de l’événement."
          : "Le site sera retiré de la consultation publique. Le brouillon reste disponible."}
        confirmLabel={confirmSite === "publish" ? "Publier le site" : "Dépublier le site"}
        variant="primary"
        confirming={busy}
        onConfirm={() => { void (confirmSite === "publish" ? publish() : unpublish()); }}
        onCancel={() => { if (!busy) setConfirmSite(null); }}
      />}
      {dirty && <p className="text-[13px] text-ink-muted">Modifications non enregistrées : enregistrez le brouillon avant de publier.</p>}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,22rem)_1fr]">
        <div className="space-y-4">
          <Card title="Couleurs">
            <div className="grid grid-cols-2 gap-3">
              {PALETTE_KEYS.map((key) => (
                <label key={key} className="flex min-h-11 items-center gap-2 text-[15px] text-ink">
                  <input type="color" value={doc.theme.colors[key]} onChange={(e) => edit((d) => void (d.theme.colors[key] = e.target.value.toLowerCase()))} className="size-11 shrink-0 cursor-pointer rounded-control border border-control-line focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus" />
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
            <Link href={`/billetterie/${eventId}/images`} className={`${buttonClasses("secondary")} self-start`}>
              <Images aria-hidden="true" className="size-4" strokeWidth={1.75} />
              Déposer plusieurs images
            </Link>
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
                <label className="flex min-h-11 items-center gap-3 text-[15px] text-ink"><Checkbox checked={hero.showDateLocation} onChange={(e) => edit((d) => void (heroOf(d).showDateLocation = e.target.checked))} /> Date et lieu</label>
                <label className="flex min-h-11 items-center gap-3 text-[15px] text-ink"><Checkbox checked={hero.showCountdown} onChange={(e) => edit((d) => void (heroOf(d).showCountdown = e.target.checked))} /> Compte à rebours</label>
              </>
            ) : (
              <p className="text-[15px] text-ink-muted">La page d&apos;accueil n&apos;a pas de bandeau d&apos;accueil.</p>
            )}
          </Card>
          <Card title="Après l'événement">
            <Input label="Jours d'affichage de « Événement terminé » (1 à 365)" type="number" min={1} max={365} value={afterClose} onChange={(e) => setAfterClose(Number(e.target.value))} />
            <Button type="button" variant="secondary" disabled={busy || afterClose === site.afterCloseDays || !(afterClose >= 1 && afterClose <= 365)} onClick={() => call<SiteView>(`/api/ticketing/events/${eventId}/site`, "PATCH", { afterCloseDays: afterClose }, "Durée enregistrée")}>Enregistrer la durée</Button>
          </Card>
          <SitePagesEditor doc={doc} edit={edit} tools={tools} />
          {canConfigure && <DomainCard eventId={eventId} domain={domain} />}
        </div>

        <div className="min-w-0 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-semibold text-ink">Aperçu du brouillon</h2>
            <Button type="button" size="sm" variant="secondary" onClick={() => setFullPreview(true)}>
              Voir en plein écran
            </Button>
          </div>
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
          <SitePreviewDialog
            open={fullPreview}
            onClose={() => setFullPreview(false)}
            renderer={{ document: doc, event, title, churchSlug, eventSlug, assetUrl, pageHref: () => "#" }}
          />
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
