"use client";

import { useState } from "react";
import { Button, Checkbox, Input, Select, Textarea, fieldLabelClasses } from "@/components/ui";
import FileInput from "@/components/ui/FileInput";
import { GRADIENT_DIRECTIONS, PALETTE_KEYS, PALETTE_LABEL, type PaletteKey, type SiteBackground } from "@/modules/ticketing/schemas";

/** Champs partagés de l'éditeur du site (spec 084) : image, fond, texte analysé. */

export const paletteOptions = PALETTE_KEYS.map((k) => ({ value: k, label: PALETTE_LABEL[k] }));
const DIRECTION_LABEL = { vertical: "Vertical", horizontal: "Horizontal", diagonal: "Diagonal", radial: "Radial" } as const;

export interface ImageTools {
  readonly assetUrl: (id: string, width?: number) => string;
  /** Images du site déjà disponibles (référencées ou téléversées). */
  readonly pool: string[];
  /** Images déjà téléversées (nom et texte alternatif) pour les libeller. */
  readonly library: readonly { id: string; name: string; alt: string }[];
  /** Dépôt : le texte alternatif est obligatoire. */
  readonly upload: (file: File, alt: string, then: (id: string) => void) => void;
}

export function ImageField({ label, current, tools, onPick, onClear }: { readonly label: string; readonly current?: string; readonly tools: ImageTools; readonly onPick: (id: string) => void; readonly onClear?: () => void }) {
  const [alt, setAlt] = useState("");
  const options = [
    { value: "", label: "Choisir une image du site…" },
    ...tools.pool.map((id, i) => {
      const known = tools.library.find((a) => a.id === id);
      return { value: id, label: known?.name || known?.alt || `Image ${i + 1}` };
    }),
  ];
  return (
    <div className="space-y-1.5">
      <span className={fieldLabelClasses}>{label}</span>
      <div className="flex flex-wrap items-center gap-3">
        {current && (
          // eslint-disable-next-line @next/next/no-img-element -- miniature servie par l'API de l'équipe
          <img src={tools.assetUrl(current)} alt="" className="h-12 w-auto rounded-chip border border-line" />
        )}
        {tools.pool.length > 0 && <Select label={`${label} : image du site`} hideLabel value={current ?? ""} options={options} onChange={(e) => e.target.value && onPick(e.target.value)} />}
        <Input label="Texte alternatif de la nouvelle image (obligatoire)" value={alt} maxLength={200} onChange={(e) => setAlt(e.target.value)} />
        <FileInput
          accept="image/jpeg,image/png,image/webp,image/svg+xml"
          buttonLabel="Téléverser une image"
          aria-label={`${label} : téléverser (JPEG, PNG, WebP ou SVG, 8 Mo au plus)`}
          disabled={!alt.trim()}
          title={alt.trim() ? undefined : "Saisissez d'abord le texte alternatif"}
          resetAfterSelect
          onFiles={(files) => {
            if (files[0]) tools.upload(files[0], alt.trim(), onPick);
          }}
        />
        {!alt.trim() && <p className="w-full text-[13px] text-ink-muted">Saisissez d&apos;abord le texte alternatif pour téléverser une image.</p>}
        {current && onClear && <Button type="button" variant="ghost" size="sm" onClick={onClear}>Retirer l&apos;image</Button>}
      </div>
    </div>
  );
}

/** Fond d'une page, d'une bande ou d'une bannière : aucun, couleur, dégradé ou image sous voile. */
export function BackgroundFields({ label, value, onChange, tools }: { readonly label: string; readonly value: SiteBackground; readonly onChange: (b: SiteBackground) => void; readonly tools: ImageTools }) {
  const bg = value;
  return (
    <div className="space-y-3">
      <Select
        label={label}
        value={bg.kind}
        options={[{ value: "none", label: "Aucun" }, { value: "color", label: "Couleur unie" }, { value: "gradient", label: "Dégradé" }, { value: "image", label: "Image" }]}
        onChange={(e) => {
          const kind = e.target.value;
          if (kind === "none") onChange({ kind: "none" });
          else if (kind === "color") onChange({ kind: "color", color: "background" });
          else if (kind === "gradient") onChange({ kind: "gradient", stops: ["background", "secondary"], direction: "vertical" });
          else if (bg.kind !== "image" && tools.pool[0]) onChange({ kind: "image", assetId: tools.pool[0], veil: "background", opacity: 0.7, fixed: false });
        }}
      />
      {bg.kind === "color" && <Select label="Couleur" value={bg.color} options={paletteOptions} onChange={(e) => onChange({ ...bg, color: e.target.value as PaletteKey })} />}
      {bg.kind === "gradient" && (
        <>
          <Select label="Première couleur" value={bg.stops[0]} options={paletteOptions} onChange={(e) => onChange({ ...bg, stops: [e.target.value as PaletteKey, ...bg.stops.slice(1)] })} />
          <Select label="Seconde couleur" value={bg.stops[1]} options={paletteOptions} onChange={(e) => onChange({ ...bg, stops: [bg.stops[0], e.target.value as PaletteKey] })} />
          <Select label="Direction" value={bg.direction} options={GRADIENT_DIRECTIONS.map((d) => ({ value: d, label: DIRECTION_LABEL[d] }))} onChange={(e) => onChange({ ...bg, direction: e.target.value as (typeof GRADIENT_DIRECTIONS)[number] })} />
        </>
      )}
      {(bg.kind === "image" || bg.kind === "none") && (
        <ImageField
          label="Image de fond"
          current={bg.kind === "image" ? bg.assetId : undefined}
          tools={tools}
          onPick={(id) => onChange({ kind: "image", assetId: id, veil: bg.kind === "image" ? bg.veil : "background", opacity: bg.kind === "image" ? bg.opacity : 0.7, fixed: bg.kind === "image" ? bg.fixed : false })}
          onClear={() => onChange({ kind: "none" })}
        />
      )}
      {bg.kind === "image" && (
        <>
          <Select label="Couleur du voile" value={bg.veil} options={paletteOptions} onChange={(e) => onChange({ ...bg, veil: e.target.value as PaletteKey })} />
          <Input label={`Opacité du voile : ${Math.round(bg.opacity * 100)} %`} type="range" min={20} max={90} value={Math.round(bg.opacity * 100)} onChange={(e) => onChange({ ...bg, opacity: Number(e.target.value) / 100 })} />
          <label className="flex min-h-11 items-center gap-3 text-[15px] text-ink"><Checkbox checked={bg.fixed} onChange={(e) => onChange({ ...bg, fixed: e.target.checked })} /> Image fixe au défilement</label>
        </>
      )}
    </div>
  );
}

/**
 * Zone de texte dont le contenu est analysé (Markdown restreint, liste d'une ligne par élément) :
 * le document n'est mis à jour que si l'analyse réussit, sinon l'erreur s'affiche et le texte saisi
 * est conservé.
 */
export function ParsedTextarea<T>({ label, value, format, parse, onChange, hint, rows = 5 }: { readonly label: string; readonly value: T; readonly format: (v: T) => string; readonly parse: (text: string) => T; readonly onChange: (v: T) => void; readonly hint?: string; readonly rows?: number }) {
  const serialized = JSON.stringify(value);
  const [text, setText] = useState(() => format(value));
  const [seen, setSeen] = useState(serialized);
  const [error, setError] = useState<string | undefined>();
  // Valeur modifiée ailleurs (déplacement d'un bloc…) : on repart du document.
  if (serialized !== seen) {
    setSeen(serialized);
    setText(format(value));
    setError(undefined);
  }
  return (
    <Textarea
      label={label}
      rows={rows}
      value={text}
      error={error}
      hint={hint}
      onChange={(e) => {
        setText(e.target.value);
        try {
          const next = parse(e.target.value);
          setSeen(JSON.stringify(next));
          setError(undefined);
          onChange(next);
        } catch (err) {
          setError(err instanceof Error ? err.message : "Texte invalide");
        }
      }}
    />
  );
}

export const linesOf = (text: string): string[] => text.split("\n").map((l) => l.trim()).filter(Boolean);
