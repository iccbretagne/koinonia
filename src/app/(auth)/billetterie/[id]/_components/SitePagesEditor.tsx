"use client";

import { useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { Button, Checkbox, IconButton, Input, Select } from "@/components/ui";
import {
  BUTTON_STYLES,
  BUTTON_STYLE_LABEL,
  GALLERY_LAYOUTS,
  PAGE_KINDS,
  PAGE_KIND_LABEL,
  SEPARATOR_STYLES,
  SITE_ICONS,
  SITE_LIMITS,
  parseRichText,
  richTextToMarkdown,
  type ButtonTarget,
  type SiteBlock,
  type SiteBlockKind,
  type SiteButton,
  type SiteDocument,
  type SitePage,
  type SiteSection,
} from "@/modules/ticketing/schemas";
import { BackgroundFields, ImageField, ParsedTextarea, linesOf, paletteOptions, type ImageTools } from "./SiteFields";

/** Éditeur des pages, bandes et blocs du site (spec 084) : bornes affichées, un formulaire par type de bloc. */

type Edit = (fn: (d: SiteDocument) => void) => void;
const ICON_OPTIONS = SITE_ICONS.map((i) => ({ value: i, label: i }));
const BLOCK_LABEL: Record<SiteBlockKind, string> = {
  hero: "Bandeau d'accueil", richText: "Texte", image: "Image", gallery: "Galerie", palette: "Palette de couleurs", cards: "Cartes",
  doDont: "À faire / à éviter", icons: "Pictogrammes", faq: "Questions fréquentes", button: "Bouton", banner: "Bannière", separator: "Séparateur",
};
const KIND_OPTIONS = (Object.keys(BLOCK_LABEL) as SiteBlockKind[]).map((k) => ({ value: k, label: BLOCK_LABEL[k] }));

function swap<T>(list: T[], i: number, dir: -1 | 1) {
  const j = i + dir;
  if (j >= 0 && j < list.length) [list[i], list[j]] = [list[j], list[i]];
}

function Move({ index, count, onMove, onDelete, what }: { readonly index: number; readonly count: number; readonly onMove: (dir: -1 | 1) => void; readonly onDelete: () => void; readonly what: string }) {
  return (
    <div className="flex gap-1">
      <IconButton size="sm" icon={ArrowUp} aria-label={`Monter ${what}`} disabled={index === 0} onClick={() => onMove(-1)} />
      <IconButton size="sm" icon={ArrowDown} aria-label={`Descendre ${what}`} disabled={index === count - 1} onClick={() => onMove(1)} />
      <IconButton size="sm" icon={Trash2} aria-label={`Supprimer ${what}`} onClick={onDelete} />
    </div>
  );
}

function Box({ title, actions, children }: { readonly title: string; readonly actions?: ReactNode; readonly children: ReactNode }) {
  return (
    <div className="space-y-3 rounded-card border border-line p-3">
      <div className="flex items-center justify-between gap-2"><h4 className="text-sm font-semibold text-ink">{title}</h4>{actions}</div>
      {children}
    </div>
  );
}

const TARGET_KINDS = [
  { value: "booking", label: "Page d'inscription" },
  { value: "page", label: "Page du site" },
  { value: "url", label: "Lien externe (https)" },
  { value: "mailto", label: "Adresse email" },
  { value: "tel", label: "Téléphone" },
  { value: "anchor", label: "Ancre de cette page" },
];
const STYLE_OPTIONS = BUTTON_STYLES.map((v) => ({ value: v, label: BUTTON_STYLE_LABEL[v] }));

/** Destination d'un bouton : type puis valeur (la validation fait foi à l'enregistrement). */
function TargetFields({ target, onChange, pages, anchors }: { readonly target: ButtonTarget; readonly onChange: (t: ButtonTarget) => void; readonly pages: SitePage[]; readonly anchors: string[] }) {
  const kind = Object.keys(target)[0];
  const value = Object.values(target)[0] as string | boolean;
  return (
    <>
      <Select
        label="Destination"
        value={kind}
        options={TARGET_KINDS}
        onChange={(e) => {
          const k = e.target.value;
          onChange(k === "booking" ? { booking: true } : k === "page" ? { page: pages[0]?.slug ?? "" } : k === "url" ? { url: "https://" } : k === "mailto" ? { mailto: "" } : k === "tel" ? { tel: "" } : { anchor: anchors[0] ?? "" });
        }}
      />
      {kind === "page" && <Select label="Page" value={String(value)} options={pages.map((p) => ({ value: p.slug, label: p.title }))} onChange={(e) => onChange({ page: e.target.value })} />}
      {kind === "url" && <Input label="Adresse https" value={String(value)} maxLength={500} onChange={(e) => onChange({ url: e.target.value })} />}
      {kind === "mailto" && <Input label="Adresse email" type="email" value={String(value)} maxLength={200} onChange={(e) => onChange({ mailto: e.target.value })} />}
      {kind === "tel" && <Input label="Numéro de téléphone" type="tel" value={String(value)} maxLength={30} onChange={(e) => onChange({ tel: e.target.value })} />}
      {kind === "anchor" && <Input label="Ancre" hint={anchors.length ? `Ancres de la page : ${anchors.join(", ")}` : "Aucune ancre sur cette page : ajoutez-en une à une bande ou un bloc."} value={String(value)} maxLength={40} onChange={(e) => onChange({ anchor: e.target.value })} />}
    </>
  );
}

function ButtonFields({ button, onChange, pages, anchors }: { readonly button: SiteButton; readonly onChange: (fn: (b: SiteButton) => void) => void; readonly pages: SitePage[]; readonly anchors: string[] }) {
  return (
    <>
      <Input label="Texte du bouton" value={button.label} maxLength={40} onChange={(e) => onChange((b) => void (b.label = e.target.value))} />
      <TargetFields target={button.target} pages={pages} anchors={anchors} onChange={(t) => onChange((b) => void (b.target = t))} />
      <Select label="Style" value={button.style ?? "filled"} options={STYLE_OPTIONS} onChange={(e) => onChange((b) => void (b.style = e.target.value as SiteButton["style"]))} />
    </>
  );
}

/** Bouton facultatif d'un bandeau ou d'une bannière. */
function OptionalButton({ button, fallbackLabel, onChange, pages, anchors }: { readonly button?: SiteButton; readonly fallbackLabel: string; readonly onChange: (b: SiteButton | undefined) => void; readonly pages: SitePage[]; readonly anchors: string[] }) {
  return (
    <>
      <label className="flex items-center gap-2 text-sm text-ink"><Checkbox checked={!!button} onChange={(e) => onChange(e.target.checked ? { label: fallbackLabel, target: { booking: true } } : undefined)} /> Bouton personnalisé</label>
      {button && <ButtonFields button={button} pages={pages} anchors={anchors} onChange={(fn) => { const next = structuredClone(button); fn(next); onChange(next); }} />}
    </>
  );
}

function newBlock(kind: SiteBlockKind, firstImage?: string): SiteBlock {
  const image = { assetId: firstImage ?? "", alt: "Description de l'image" };
  switch (kind) {
    case "hero": return { kind, title: "Titre", showDateLocation: true, showCountdown: false };
    case "richText": return { kind, content: [{ type: "p", children: [{ text: "Votre texte" }] }] };
    case "image": return { kind, image };
    case "gallery": return { kind, images: [image] };
    case "palette": return { kind, swatches: [{ label: "Couleur", color: "#5e17eb" }] };
    case "cards": return { kind, cards: [{ title: "Titre", items: ["Élément"] }] };
    case "doDont": return { kind, doTitle: "À faire", doItems: ["Élément"], dontTitle: "À éviter", dontItems: ["Élément"] };
    case "icons": return { kind, items: [{ icon: "star", label: "Libellé" }] };
    case "faq": return { kind, items: [{ question: "Question", answer: "Réponse" }] };
    case "button": return { kind, label: "Je m'inscris", target: { booking: true } };
    case "banner": return { kind, background: { kind: "color", color: "primary" }, title: "Titre" };
    case "separator": return { kind, style: "line" };
  }
}

/** Liste d'éléments éditables avec ajout et suppression bornés. */
function ListEditor<T>({ items, max, add, onChange, render, what }: { readonly items: T[]; readonly max: number; readonly add: () => T; readonly onChange: (next: T[]) => void; readonly render: (item: T, set: (fn: (i: T) => void) => void, i: number) => ReactNode; readonly what: string }) {
  return (
    <div className="space-y-2">
      {items.map((item, i) => (
        <div key={i} className="flex items-start gap-2">
          <div className="min-w-0 flex-1 space-y-2">{render(item, (fn) => { const next = structuredClone(items); fn(next[i]); onChange(next); }, i)}</div>
          {items.length > 1 && <IconButton size="sm" icon={Trash2} aria-label={`Supprimer ${what} ${i + 1}`} onClick={() => onChange(items.filter((_, j) => j !== i))} />}
        </div>
      ))}
      {items.length < max && <Button type="button" variant="secondary" size="sm" onClick={() => onChange([...items, add()])}>Ajouter {what} ({items.length}/{max})</Button>}
    </div>
  );
}

function BlockForm({ block, update, tools, pages, anchors }: { readonly block: SiteBlock; readonly update: (fn: (b: SiteBlock) => void) => void; readonly tools: ImageTools; readonly pages: SitePage[]; readonly anchors: string[] }) {
  const u = <K extends SiteBlockKind>(fn: (b: Extract<SiteBlock, { kind: K }>) => void) => update(fn as (b: SiteBlock) => void);
  const imageFields = (image: { assetId: string; alt: string; caption?: string }, set: (fn: (i: typeof image) => void) => void) => (
    <>
      <ImageField label="Image" current={image.assetId || undefined} tools={tools} onPick={(id) => set((i) => void (i.assetId = id))} />
      <Input label="Texte alternatif" value={image.alt} maxLength={200} onChange={(e) => set((i) => void (i.alt = e.target.value))} />
      <Input label="Légende" value={image.caption ?? ""} maxLength={200} onChange={(e) => set((i) => void (i.caption = e.target.value || undefined))} />
    </>
  );
  switch (block.kind) {
    case "hero":
      return (
        <>
          <Input label="Titre" value={block.title} maxLength={120} onChange={(e) => u<"hero">((b) => void (b.title = e.target.value))} />
          <Input label="Accroche" value={block.tagline ?? ""} maxLength={240} onChange={(e) => u<"hero">((b) => void (b.tagline = e.target.value || undefined))} />
          <Input label="Texte du bouton" value={block.buttonLabel ?? ""} maxLength={40} onChange={(e) => u<"hero">((b) => void (b.buttonLabel = e.target.value || undefined))} />
          <label className="flex items-center gap-2 text-sm text-ink"><Checkbox checked={block.showDateLocation} onChange={(e) => u<"hero">((b) => void (b.showDateLocation = e.target.checked))} /> Date et lieu</label>
          <label className="flex items-center gap-2 text-sm text-ink"><Checkbox checked={block.showCountdown} onChange={(e) => u<"hero">((b) => void (b.showCountdown = e.target.checked))} /> Compte à rebours</label>
          <OptionalButton button={block.button} fallbackLabel={block.buttonLabel || "Je m'inscris"} pages={pages} anchors={anchors} onChange={(btn) => u<"hero">((b) => void (b.button = btn))} />
          <BackgroundFields label="Fond du bandeau" value={block.background ?? { kind: "none" }} tools={tools} onChange={(bg) => u<"hero">((b) => void (b.background = bg.kind === "none" ? undefined : bg))} />
        </>
      );
    case "richText":
      return (
        <ParsedTextarea
          label="Texte (Markdown restreint)"
          hint="## Titre, ### Sous-titre, - liste, 1. liste numérotée, **gras**, *italique*, [texte](https://…), [texte](page:adresse). Aucun HTML."
          rows={8}
          value={block.content}
          format={richTextToMarkdown}
          parse={parseRichText}
          onChange={(content) => u<"richText">((b) => void (b.content = content))}
        />
      );
    case "image":
      return imageFields(block.image, (fn) => u<"image">((b) => fn(b.image)));
    case "gallery":
      return (
        <>
          <Input label="Titre" value={block.title ?? ""} maxLength={120} onChange={(e) => u<"gallery">((b) => void (b.title = e.target.value || undefined))} />
          <Select label="Présentation" value={block.layout ?? "grid"} options={GALLERY_LAYOUTS.map((l) => ({ value: l, label: l === "grid" ? "Grille" : "Vignettes rondes" }))} onChange={(e) => u<"gallery">((b) => void (b.layout = e.target.value === "grid" ? undefined : (e.target.value as "round")))} />
          <ListEditor what="une image" max={SITE_LIMITS.gallery} items={block.images} add={() => ({ assetId: tools.pool[0] ?? "", alt: "Description de l'image" })} onChange={(images) => u<"gallery">((b) => void (b.images = images))} render={(img, set) => imageFields(img, set)} />
        </>
      );
    case "palette":
      return (
        <>
          <Input label="Titre" value={block.title ?? ""} maxLength={120} onChange={(e) => u<"palette">((b) => void (b.title = e.target.value || undefined))} />
          <ListEditor what="une couleur" max={SITE_LIMITS.swatches} items={block.swatches} add={() => ({ label: "Couleur", color: "#5e17eb" })} onChange={(swatches) => u<"palette">((b) => void (b.swatches = swatches))} render={(s, set) => (
            <div className="flex items-end gap-2">
              <input type="color" aria-label={`Couleur ${s.label}`} value={s.color} onChange={(e) => set((x) => void (x.color = e.target.value.toLowerCase()))} className="size-10 cursor-pointer rounded border border-line" />
              <Input label="Nom" value={s.label} maxLength={60} onChange={(e) => set((x) => void (x.label = e.target.value))} />
            </div>
          )} />
        </>
      );
    case "cards":
      return (
        <>
        <Input label="Titre de la section" value={block.title ?? ""} maxLength={120} onChange={(e) => u<"cards">((b) => void (b.title = e.target.value || undefined))} />
        <Select label="Colonnes" value={String(block.columns ?? 2)} options={[2, 3, 4].map((n) => ({ value: String(n), label: `${n} colonnes` }))} onChange={(e) => u<"cards">((b) => void (b.columns = Number(e.target.value) === 2 ? undefined : Number(e.target.value)))} />
        <ListEditor<Extract<SiteBlock, { kind: "cards" }>["cards"][number]> what="une carte" max={SITE_LIMITS.cards} items={block.cards} add={() => ({ title: "Titre", items: ["Élément"] })} onChange={(cards) => u<"cards">((b) => void (b.cards = cards))} render={(c, set) => (
          <>
            <Input label="Titre" value={c.title} maxLength={120} onChange={(e) => set((x) => void (x.title = e.target.value))} />
            <Input label="Texte court" value={c.text ?? ""} maxLength={300} onChange={(e) => set((x) => void (x.text = e.target.value || undefined))} />
            <Select label="Pictogramme" value={c.icon ?? ""} options={[{ value: "", label: "Aucun" }, ...ICON_OPTIONS]} onChange={(e) => set((x) => void (x.icon = (e.target.value || undefined) as typeof x.icon))} />
            <ParsedTextarea label={`Éléments (un par ligne, ${SITE_LIMITS.listItems} au plus)`} value={c.items} format={(v) => v.join("\n")} parse={linesOf} onChange={(items) => set((x) => void (x.items = items))} />
          </>
        )} />
        </>
      );
    case "doDont":
      return (
        <>
          <Input label="Titre « à faire »" value={block.doTitle} maxLength={80} onChange={(e) => u<"doDont">((b) => void (b.doTitle = e.target.value))} />
          <ParsedTextarea label="À faire (un par ligne)" value={block.doItems} format={(v) => v.join("\n")} parse={linesOf} onChange={(v) => u<"doDont">((b) => void (b.doItems = v))} />
          <Input label="Titre « à éviter »" value={block.dontTitle} maxLength={80} onChange={(e) => u<"doDont">((b) => void (b.dontTitle = e.target.value))} />
          <ParsedTextarea label="À éviter (un par ligne)" value={block.dontItems} format={(v) => v.join("\n")} parse={linesOf} onChange={(v) => u<"doDont">((b) => void (b.dontItems = v))} />
        </>
      );
    case "icons":
      return (
        <>
          <Input label="Titre" value={block.title ?? ""} maxLength={120} onChange={(e) => u<"icons">((b) => void (b.title = e.target.value || undefined))} />
          <ListEditor what="un pictogramme" max={SITE_LIMITS.listItems} items={block.items} add={() => ({ icon: "star" as const, label: "Libellé" })} onChange={(items) => u<"icons">((b) => void (b.items = items))} render={(it, set) => (
            <div className="flex items-end gap-2">
              <Select label="Pictogramme" value={it.icon} options={ICON_OPTIONS} onChange={(e) => set((x) => void (x.icon = e.target.value as typeof x.icon))} />
              <Input label="Libellé" value={it.label} maxLength={120} onChange={(e) => set((x) => void (x.label = e.target.value))} />
              <Input label="Description" value={it.description ?? ""} maxLength={200} onChange={(e) => set((x) => void (x.description = e.target.value || undefined))} />
            </div>
          )} />
        </>
      );
    case "faq":
      return (
        <>
        <Input label="Titre" value={block.title ?? ""} maxLength={120} onChange={(e) => u<"faq">((b) => void (b.title = e.target.value || undefined))} />
        <ListEditor what="une question" max={SITE_LIMITS.faq} items={block.items} add={() => ({ question: "Question", answer: "Réponse" })} onChange={(items) => u<"faq">((b) => void (b.items = items))} render={(it, set) => (
          <>
            <Input label="Question" value={it.question} maxLength={200} onChange={(e) => set((x) => void (x.question = e.target.value))} />
            <Input label="Réponse" value={it.answer} maxLength={2000} onChange={(e) => set((x) => void (x.answer = e.target.value))} />
          </>
        )} />
        </>
      );
    case "button":
      return <ButtonFields button={block} pages={pages} anchors={anchors} onChange={(fn) => update((b) => fn(b as unknown as SiteButton))} />;
    case "banner":
      return (
        <>
          <Input label="Titre" value={block.title} maxLength={120} onChange={(e) => u<"banner">((b) => void (b.title = e.target.value))} />
          <Input label="Accroche" value={block.tagline ?? ""} maxLength={240} onChange={(e) => u<"banner">((b) => void (b.tagline = e.target.value || undefined))} />
          <Input label="Ligne secondaire" value={block.secondary ?? ""} maxLength={240} onChange={(e) => u<"banner">((b) => void (b.secondary = e.target.value || undefined))} />
          <OptionalButton button={block.button} fallbackLabel="En savoir plus" pages={pages} anchors={anchors} onChange={(btn) => u<"banner">((b) => void (b.button = btn))} />
          <BackgroundFields label="Fond de la bannière" value={block.background} tools={tools} onChange={(bg) => u<"banner">((b) => void (b.background = bg))} />
        </>
      );
    case "separator":
      return <Select label="Style" value={block.style} options={SEPARATOR_STYLES.map((s) => ({ value: s, label: { line: "Ligne", goldDiamond: "Losange", wave: "Vague" }[s] }))} onChange={(e) => u<"separator">((b) => void (b.style = e.target.value as typeof b.style))} />;
  }
}

function SectionEditor({ section, p, s, count, edit, tools, pages }: { readonly section: SiteSection; readonly p: number; readonly s: number; readonly count: number; readonly edit: Edit; readonly tools: ImageTools; readonly pages: SitePage[] }) {
  const [kind, setKind] = useState<SiteBlockKind>("richText");
  const sec = (d: SiteDocument) => d.pages[p].sections[s];
  const anchors = pages[p].sections.flatMap((x) => [x.anchor, ...x.blocks.map((b) => b.anchor)]).filter((a): a is string => !!a);
  return (
    <Box title={`Bande ${s + 1}`} actions={<Move index={s} count={count} what={`la bande ${s + 1}`} onMove={(dir) => edit((d) => swap(d.pages[p].sections, s, dir))} onDelete={() => edit((d) => void d.pages[p].sections.splice(s, 1))} />}>
      <BackgroundFields label="Fond de la bande" value={section.background} tools={tools} onChange={(bg) => edit((d) => void (sec(d).background = bg))} />
      <Input label="Ancre de la bande (facultatif)" hint="Identifiant court (minuscules, chiffres, tirets) pour qu'un bouton y mène." value={section.anchor ?? ""} maxLength={40} onChange={(e) => edit((d) => void (sec(d).anchor = e.target.value || undefined))} />
      <Select label="Couleur du texte" value={section.textColor} options={paletteOptions} onChange={(e) => edit((d) => void (sec(d).textColor = e.target.value as SiteSection["textColor"]))} />
      {section.blocks.map((block, b) => (
        <Box key={b} title={`${BLOCK_LABEL[block.kind]} (bloc ${b + 1})`} actions={<Move index={b} count={section.blocks.length} what={`le bloc ${b + 1}`} onMove={(dir) => edit((d) => swap(sec(d).blocks, b, dir))} onDelete={() => edit((d) => void sec(d).blocks.splice(b, 1))} />}>
          <BlockForm block={block} tools={tools} pages={pages} anchors={anchors} update={(fn) => edit((d) => fn(sec(d).blocks[b]))} />
          <Input label="Ancre du bloc (facultatif)" value={block.anchor ?? ""} maxLength={40} onChange={(e) => edit((d) => void (sec(d).blocks[b].anchor = e.target.value || undefined))} />
        </Box>
      ))}
      {section.blocks.length < SITE_LIMITS.blocks && (
        <div className="flex items-end gap-2">
          <Select label={`Ajouter un bloc (${section.blocks.length}/${SITE_LIMITS.blocks})`} value={kind} options={KIND_OPTIONS} onChange={(e) => setKind(e.target.value as SiteBlockKind)} />
          <Button type="button" variant="secondary" onClick={() => edit((d) => void sec(d).blocks.push(newBlock(kind, tools.pool[0])))}><Plus className="size-4" aria-hidden="true" /> Ajouter</Button>
        </div>
      )}
    </Box>
  );
}

export default function SitePagesEditor({ doc, edit, tools }: { readonly doc: SiteDocument; readonly edit: Edit; readonly tools: ImageTools }) {
  return (
    <section className="space-y-3 rounded-card border border-line bg-surface p-4">
      <h2 className="font-semibold text-ink">Pages ({doc.pages.length}/{SITE_LIMITS.pages})</h2>
      <p className="text-[13px] text-ink-muted">La première page est l&apos;accueil. Les pages automatiques se mettent à jour avec l&apos;événement.</p>
      {doc.pages.map((page, p) => (
        <Box key={p} title={page.title || `Page ${p + 1}`} actions={doc.pages.length > 1 ? <Move index={p} count={doc.pages.length} what={`la page ${page.title}`} onMove={(dir) => edit((d) => swap(d.pages, p, dir))} onDelete={() => edit((d) => void d.pages.splice(p, 1))} /> : undefined}>
          <Input label="Titre" value={page.title} maxLength={60} onChange={(e) => edit((d) => void (d.pages[p].title = e.target.value))} />
          <Input label="Adresse de la page" value={page.slug} maxLength={40} onChange={(e) => edit((d) => void (d.pages[p].slug = e.target.value))} />
          <Select label="Type" value={page.kind} options={PAGE_KINDS.map((k) => ({ value: k, label: PAGE_KIND_LABEL[k] }))} onChange={(e) => edit((d) => void (d.pages[p].kind = e.target.value as SitePage["kind"]))} />
          <label className="flex items-center gap-2 text-sm text-ink"><Checkbox checked={page.inMenu} onChange={(e) => edit((d) => void (d.pages[p].inMenu = e.target.checked))} /> Dans le menu</label>
          {page.kind === "content" && (
            <>
              {page.sections.map((section, s) => (
                <SectionEditor key={s} section={section} p={p} s={s} count={page.sections.length} edit={edit} tools={tools} pages={doc.pages} />
              ))}
              {page.sections.length < SITE_LIMITS.sections && (
                <Button type="button" variant="secondary" size="sm" onClick={() => edit((d) => void d.pages[p].sections.push({ background: { kind: "none" }, textColor: "text", blocks: [] }))}>Ajouter une bande ({page.sections.length}/{SITE_LIMITS.sections})</Button>
              )}
            </>
          )}
        </Box>
      ))}
      {doc.pages.length < SITE_LIMITS.pages && (
        <Button type="button" variant="secondary" onClick={() => edit((d) => {
          let n = d.pages.length + 1;
          while (d.pages.some((x) => x.slug === `page-${n}`)) n++;
          d.pages.push({ title: `Page ${n}`, slug: `page-${n}`, inMenu: true, kind: "content", sections: [] });
        })}>Ajouter une page</Button>
      )}
    </section>
  );
}
