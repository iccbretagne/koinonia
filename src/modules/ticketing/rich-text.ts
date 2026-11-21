import { linkSchema, type RichInline, type RichNode } from "./site-schemas";

/**
 * Texte riche des sites d'événement (spec 084) : un **Markdown restreint**, converti en arbre par
 * cet analyseur maison — jamais de HTML. Reconnu : `## titre`, `### sous-titre`, listes `- ` et
 * `1. `, paragraphes séparés par une ligne vide, `**gras**`, `*italique*` (marque collée au texte, comme en Markdown), `[texte](lien)` avec un
 * lien https, mailto ou `page:adresse`. Tout le reste, balises HTML comprises, reste du texte.
 */

export class RichTextError extends Error {}

const BULLET = /^[-*]\s+(.*)$/;
const NUMBERED = /^\d+[.)]\s+(.*)$/;

/** Marques en ligne : gras, italique, liens. Une marque non fermée reste du texte. */
export function parseInline(text: string): RichInline[] {
  const out: RichInline[] = [];
  const push = (part: RichInline) => {
    if (!part.text) return;
    const last = out.at(-1);
    if (last && !last.href && !part.href && !!last.bold === !!part.bold && !!last.italic === !!part.italic) last.text += part.text;
    else out.push(part);
  };
  const walk = (s: string, marks: { bold?: boolean; italic?: boolean }) => {
    let i = 0;
    let plain = "";
    const flush = () => {
      push({ text: plain, ...marks });
      plain = "";
    };
    while (i < s.length) {
      const rest = s.slice(i);
      const link = /^\[([^\]\n]+)\]\(([^)\s]+)\)/.exec(rest);
      if (link) {
        const href = linkSchema.safeParse(link[2]);
        if (!href.success) throw new RichTextError(`Lien refusé : « ${link[2]} » (https, mailto ou page du site seulement).`);
        flush();
        push({ text: link[1], ...marks, href: href.data });
        i += link[0].length;
        continue;
      }
      const bold = /^\*\*(?!\s)([^*\n]+?)(?<!\s)\*\*/.exec(rest);
      if (bold && !marks.bold) {
        flush();
        walk(bold[1], { ...marks, bold: true });
        i += bold[0].length;
        continue;
      }
      const italic = /^([*_])(?!\s)([^*_\n]+?)(?<!\s)\1/.exec(rest);
      if (italic && !marks.italic) {
        flush();
        walk(italic[2], { ...marks, italic: true });
        i += italic[0].length;
        continue;
      }
      plain += s[i];
      i += 1;
    }
    flush();
  };
  walk(text, {});
  return out.map(({ text: t, bold, italic, href }) => ({ text: t, ...(bold ? { bold } : {}), ...(italic ? { italic } : {}), ...(href ? { href } : {}) }));
}

/** Markdown restreint → arbre. Lève `RichTextError` sur un lien refusé. */
export function parseRichText(source: string): RichNode[] {
  const nodes: RichNode[] = [];
  let paragraph: string[] = [];
  let list: { type: "ul" | "ol"; items: string[] } | null = null;
  const flushParagraph = () => {
    if (paragraph.length) nodes.push({ type: "p", children: parseInline(paragraph.join(" ")) });
    paragraph = [];
  };
  const flushList = () => {
    if (list) nodes.push({ type: list.type, items: list.items.map(parseInline) });
    list = null;
  };
  for (const raw of source.replace(/\r\n?/g, "\n").split("\n")) {
    const lineText = raw.trim();
    if (!lineText) {
      flushParagraph();
      flushList();
      continue;
    }
    const heading = /^(#{2,3})\s+(.*)$/.exec(lineText);
    const bullet = BULLET.exec(lineText);
    const numbered = NUMBERED.exec(lineText);
    if (heading) {
      flushParagraph();
      flushList();
      nodes.push({ type: heading[1].length === 2 ? "h2" : "h3", children: parseInline(heading[2]) });
    } else if (bullet || numbered) {
      flushParagraph();
      const type = bullet ? "ul" : "ol";
      if (list && list.type !== type) flushList();
      list ??= { type, items: [] };
      list.items.push((bullet ?? numbered)![1]);
    } else {
      flushList();
      paragraph.push(lineText);
    }
  }
  flushParagraph();
  flushList();
  return nodes;
}

function inlineToMarkdown(parts: RichInline[]): string {
  return parts
    .map((p) => {
      let t = p.text;
      if (p.italic) t = `*${t}*`;
      if (p.bold) t = `**${t}**`;
      return p.href ? `[${t}](${p.href})` : t;
    })
    .join("");
}

/** Arbre → Markdown restreint, pour l'éditeur. */
export function richTextToMarkdown(nodes: RichNode[]): string {
  return nodes
    .map((n) => {
      if ("items" in n) return n.items.map((item, i) => `${n.type === "ul" ? "-" : `${i + 1}.`} ${inlineToMarkdown(item)}`).join("\n");
      if (n.type === "h2") return `## ${inlineToMarkdown(n.children)}`;
      if (n.type === "h3") return `### ${inlineToMarkdown(n.children)}`;
      return inlineToMarkdown(n.children);
    })
    .join("\n\n");
}
