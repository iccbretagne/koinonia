import { z } from "zod";
import { backgroundSchema, blockSchema, pageSchema, sectionSchema, siteDocumentSchema, themeSchema } from "./site-schemas";

/**
 * Description des schémas du site d'événement (spec 084) **générée à partir des schémas Zod**
 * (`z.toJSONSchema`) pour ne jamais diverger de la validation : champs, types, obligatoire ou non,
 * bornes, valeurs permises. Sert l'outil MCP `describe_site_blocks` et les messages d'erreur qui
 * listent les clés ou les `kind` permis. Pur, sans dépendance au runtime.
 */

interface Js {
  type?: string | string[];
  properties?: Record<string, Js>;
  required?: string[];
  items?: Js;
  oneOf?: Js[];
  anyOf?: Js[];
  enum?: unknown[];
  const?: unknown;
  description?: string;
  minLength?: number;
  maxLength?: number;
  minItems?: number;
  maxItems?: number;
  minimum?: number;
  maximum?: number;
  default?: unknown;
}

const cache = new WeakMap<z.ZodType, Js>();
function jsonOf(schema: z.ZodType): Js {
  let js = cache.get(schema);
  if (!js) {
    js = z.toJSONSchema(schema, { io: "input", unrepresentable: "any" }) as Js;
    cache.set(schema, js);
  }
  return js;
}

const variantsOf = (js: Js) => js.oneOf ?? js.anyOf;

// ─── Description ─────────────────────────────────────────────────────────────

export interface FieldDoc {
  path: string;
  type: string;
  required: boolean;
  description?: string;
  limits?: string;
  values?: unknown[];
  default?: unknown;
}

function scalar(js: Js): string {
  if (js.const !== undefined) return "valeur fixe";
  if (js.enum) return "choix";
  const t = Array.isArray(js.type) ? js.type[0] : js.type;
  return t === "string" ? "texte" : t === "number" ? "nombre" : t === "integer" ? "entier" : t === "boolean" ? "booléen" : (t ?? "valeur");
}

function limits(js: Js): string | undefined {
  const parts: string[] = [];
  if (js.minLength !== undefined || js.maxLength !== undefined) parts.push(`${js.minLength ?? 0} à ${js.maxLength ?? "…"} caractères`);
  if (js.minItems !== undefined || js.maxItems !== undefined) parts.push(`${js.minItems ?? 0} à ${js.maxItems ?? "…"} éléments`);
  if (js.minimum !== undefined || js.maximum !== undefined) parts.push(`de ${js.minimum ?? "…"} à ${js.maximum ?? "…"}`);
  return parts.length ? parts.join(", ") : undefined;
}

function flatten(js: Js, path: string, required: boolean, out: FieldDoc[]): void {
  const variants = variantsOf(js);
  if (variants) {
    out.push({ path, type: "une des formes suivantes", required, description: js.description });
    for (const v of variants) {
      const tag = v.properties ? Object.entries(v.properties).find(([, p]) => p.const !== undefined) : undefined;
      const label = tag ? `${tag[0]}=${String(tag[1].const)}` : Object.keys(v.properties ?? {}).join("+");
      flatten(v, `${path}{${label}}`, true, out);
    }
    return;
  }
  if (js.properties) {
    if (path) out.push({ path, type: "objet", required, description: js.description });
    for (const [name, child] of Object.entries(js.properties)) flatten(child, path ? `${path}.${name}` : name, (js.required ?? []).includes(name), out);
    return;
  }
  if (js.type === "array" && js.items) {
    const item = js.items;
    const composite = item.properties || variantsOf(item);
    out.push({ path, type: composite ? "liste d'objets" : `liste de ${scalar(item)}`, required, description: js.description ?? item.description, limits: limits(js), values: item.enum });
    if (composite) flatten(item, `${path}[]`, true, out);
    return;
  }
  out.push({ path, type: scalar(js), required, description: js.description, limits: limits(js), values: js.enum ?? (js.const !== undefined ? [js.const] : undefined), default: js.default });
}

const fieldsOf = (schema: z.ZodType): FieldDoc[] => {
  const out: FieldDoc[] = [];
  flatten(jsonOf(schema), "", true, out);
  return out;
};

const blockVariants = (): Js[] => variantsOf(jsonOf(blockSchema)) ?? [];
const kindOf = (v: Js) => String(v.properties?.kind?.const);

export const SITE_SUBJECTS = ["theme", "band", "page", "background"] as const;

export interface SiteDescription {
  subject: string;
  kind: "block" | "structure";
  fields: FieldDoc[];
}

/** Tous les blocs, puis thème, bande, page et fonds ; `only` limite à un `kind` de bloc ou un sujet. */
export function describeSite(only?: string): SiteDescription[] {
  const all: SiteDescription[] = [
    ...blockVariants().map((v) => {
      const fields: FieldDoc[] = [];
      flatten(v, "", true, fields);
      return { subject: kindOf(v), kind: "block" as const, fields };
    }),
    { subject: "theme", kind: "structure", fields: fieldsOf(themeSchema) },
    { subject: "band", kind: "structure", fields: fieldsOf(sectionSchema) },
    { subject: "page", kind: "structure", fields: fieldsOf(pageSchema) },
    { subject: "background", kind: "structure", fields: fieldsOf(backgroundSchema) },
  ];
  return only ? all.filter((d) => d.subject === only) : all;
}

export function describeSiteText(descriptions: SiteDescription[]): string {
  return descriptions
    .map((d) => {
      const head = d.kind === "block" ? `Bloc « ${d.subject} »` : `Structure « ${d.subject} »${d.subject === "band" ? " (bande : fond, textColor, blocks)" : ""}`;
      const lines = d.fields.map((f) => {
        const bits = [f.type, f.required ? "obligatoire" : "facultatif", f.limits, f.values ? `valeurs : ${f.values.join(", ")}` : undefined, f.default !== undefined ? `défaut ${JSON.stringify(f.default)}` : undefined, f.description].filter(Boolean);
        return `- ${f.path || "(racine)"} : ${bits.join(" ; ")}`;
      });
      return [head, ...lines].join("\n");
    })
    .join("\n\n");
}

// ─── Messages d'erreur explicites ────────────────────────────────────────────

type Path = (string | number)[];

/** Forme du schéma qui correspond aux données (un bloc d'après son `kind`, un fond d'après son `kind`…). */
function resolve(js: Js, data: unknown): Js {
  const variants = variantsOf(js);
  if (!variants) return js;
  const obj = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
  const match = variants.find((v) => Object.entries(v.properties ?? {}).some(([k, p]) => p.const !== undefined && obj[k] === p.const));
  return match ?? js;
}

function allowedKeysAt(root: z.ZodType, path: Path, data: unknown): string[] | null {
  let cur = resolve(jsonOf(root), data);
  let value: unknown = data;
  for (const seg of path) {
    value = value && typeof value === "object" ? (value as Record<string | number, unknown>)[seg] : undefined;
    const next: Js | undefined = typeof seg === "number" ? cur.items : cur.properties?.[seg];
    if (!next) return null;
    cur = resolve(next, value);
  }
  return cur.properties ? Object.keys(cur.properties) : null;
}

const valueAt = (data: unknown, path: Path): unknown => path.reduce<unknown>((v, seg) => (v && typeof v === "object" ? (v as Record<string | number, unknown>)[seg] : undefined), data);

/**
 * Messages lisibles pour les erreurs de schéma : une clé refusée liste les clés permises de son
 * objet ; un `kind` inconnu liste les `kind` permis. `root` et `data` : le schéma validé et la saisie.
 */
export function explainIssues(issues: readonly z.core.$ZodIssue[], root: z.ZodType, data: unknown, fallback = "document"): string {
  return issues
    .map((i) => {
      const path = i.path as Path;
      const where = path.join(".");
      if (i.code === "unrecognized_keys") {
        const allowed = allowedKeysAt(root, path, data);
        const owner = valueAt(data, path) as { kind?: unknown } | undefined;
        const prefix = path.length ? `${where}.` : typeof owner?.kind === "string" ? `${owner.kind}.` : "";
        return i.keys.map((k) => `\`${prefix}${k}\` refusé : ${allowed ? `clés permises ${allowed.join(", ")}` : "aucune clé de ce nom n'existe ici"}`).join(" ; ");
      }
      const union = i as { code: string; discriminator?: string; options?: unknown[] };
      if (i.code === "invalid_union" && union.discriminator && union.options?.length) {
        return `${where || fallback} : ${union.discriminator} « ${String(valueAt(data, path))} » inconnu, valeurs permises ${union.options.join(", ")}`;
      }
      return `${where || fallback} : ${i.message}`;
    })
    .join(" ; ");
}

/** Validation d'un document complet avec ces messages (utilisée par les outils MCP). */
export const explainDocumentIssues = (issues: readonly z.core.$ZodIssue[], data: unknown) => explainIssues(issues, siteDocumentSchema, data);
