"use client";

import { useState } from "react";
import { Button, Checkbox, Input, Select, Textarea } from "@/components/ui";
import { GRADIENT_DIRECTIONS, PALETTE_KEYS, PALETTE_LABEL, type PaletteKey, type SiteBackground } from "@/modules/ticketing/schemas";

/** Champs partagés de l'éditeur du site (spec 084) : image, fond, texte analysé. */

export const paletteOptions = PALETTE_KEYS.map((k) => ({ value: k, label: PALETTE_LABEL[k] }));
const DIRECTION_LABEL = { vertical: "Vertical", horizontal: "Horizontal", diagonal: "Diagonal", radial: "Radial" } as const;

export interface ImageTools {
  readonly assetUrl: (id: string) => string;
  /** Images du site déjà disponibles (référencées ou téléversées). */
  readonly pool: string[];
  readonly upload: (file: File, then: (id: string) => void) => void;
}

export function ImageField({ label, current, tools, onPick, onClear }: { readonly label: string; readonly current?: string; readonly tools: ImageTools; readonly onPick: (id: string) => void; readonly onClear?: () => void }) {
  const options = [{ value: "", label: "Choisir une image du site…" }, ...tools.pool.map((id, i) => ({ value: id, label: `Image ${i + 1}` }))];
  return (
    <div className="space-y-1.5">
      <span className="text-sm font-medium text-ink">{label}</span>
      <div className="flex flex-wrap items-center gap-3">
        {current && (
          // eslint-disable-next-line @next/next/no-img-element -- miniature servie par l'API de l'équipe
          <img src={tools.assetUrl(current)} alt="" className="h-12 w-auto rounded border border-line" />
        )}
        {tools.pool.length > 0 && <Select label="" aria-label={`${label} : image du site`} value={current ?? ""} options={options} onChange={(e) => e.target.value && onPick(e.target.value)} />}
        <input type="file" accept="image/jpeg,image/png,image/webp" aria-label={`${label} : téléverser`} onChange={(e) => e.target.files?.[0] && tools.upload(e.target.files[0], onPick)} className="text-sm text-ink-muted" />
        {current && onClear && <Button type="button" variant="ghost" size="sm" onClick={onClear}>Retirer</Button>}
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
          <label className="flex items-center gap-2 text-sm text-ink"><Checkbox checked={bg.fixed} onChange={(e) => onChange({ ...bg, fixed: e.target.checked })} /> Image fixe au défilement</label>
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
