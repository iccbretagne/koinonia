import sharp from "sharp";
import { ApiError } from "@/lib/errors";
import type { TicketTextStyle } from "../ticket-visual-schemas";

export const escapeTicketXml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c]!).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "");
const families = { "sans-serif": "DejaVu Sans", serif: "DejaVu Serif", monospace: "DejaVu Sans Mono" };
export function pangoText(text: string, style: TicketTextStyle, size: number) {
  return { text: `<span foreground="${style.color}" letter_spacing="${Math.round(style.letterSpacing * 1024)}">${escapeTicketXml(text)}</span>`, font: `${families[style.fontFamily]} ${style.fontWeight === "bold" ? "Bold " : ""}${size}`, dpi: 72, rgba: true };
}

/** Même mesure Pango et mêmes pixels dans l'aperçu, le PNG et le PDF. Aucun ellipsis. */
export async function layoutTicketText(text: string, width: number, height: number, style: TicketTextStyle) {
  const available = width - 2 * style.padding;
  const maxHeight = height - 2 * style.padding;
  const cache = new Map<string, { width: number; height: number }>();
  const measure = async (value: string, size: number) => {
    if (!value.trim()) return { width: 0, height: size };
    const key = `${size}:${value}`;
    if (!cache.has(key)) {
      const { info } = await sharp({ text: pangoText(value, style, size) }).png().toBuffer({ resolveWithObject: true });
      cache.set(key, { width: info.width, height: info.height });
    }
    return cache.get(key)!;
  };
  const linesAt = async (size: number) => {
    const lines: string[] = [];
    for (const paragraph of text.replace(/\r\n?/g, "\n").split("\n")) {
      if (style.autoFit === "fixed") { lines.push(paragraph); continue; }
      let line = "";
      for (const word of paragraph.split(/\s+/u).filter(Boolean)) {
        const candidate = line ? `${line} ${word}` : word;
        if ((await measure(candidate, size)).width <= available) { line = candidate; continue; }
        if (line) { lines.push(line); line = ""; }
        if ((await measure(word, size)).width <= available) { line = word; continue; }
        // Un nom sans espace est découpé aux graphèmes, jamais au milieu d'un accent/emoji.
        for (const { segment } of new Intl.Segmenter("fr", { granularity: "grapheme" }).segment(word)) {
          if (line && (await measure(line + segment, size)).width > available) { lines.push(line); line = ""; }
          line += segment;
        }
      }
      lines.push(line);
    }
    return lines;
  };
  let lower = style.autoFit === "shrink" ? style.minFontSize : style.fontSize;
  let upper = style.fontSize;
  let best: { fontSize: number; lines: { text: string; x: number; y: number; width: number; height: number }[] } | undefined;
  while (lower <= upper) {
    const size = Math.floor((lower + upper) / 2);
    const lines = await linesAt(size);
    const metrics = await Promise.all(lines.map((line) => measure(line, size)));
    const lineHeight = Math.max(size * style.lineHeight, ...metrics.map((m) => m.height));
    const blockHeight = lines.length * lineHeight;
    const fits = lines.length <= style.maxLines && blockHeight <= maxHeight && metrics.every((m) => m.width <= available);
    if (fits) {
      const top = style.padding + (style.verticalAlign === "middle" ? (maxHeight - blockHeight) / 2 : style.verticalAlign === "bottom" ? maxHeight - blockHeight : 0);
      best = { fontSize: size, lines: lines.map((text, i) => ({ text, x: Math.round(style.padding + (style.textAlign === "center" ? (available - metrics[i].width) / 2 : style.textAlign === "right" ? available - metrics[i].width : 0)), y: Math.round(top + i * lineHeight + (lineHeight - metrics[i].height) / 2), ...metrics[i] })) };
      lower = size + 1;
    } else upper = size - 1;
  }
  if (!best) throw new ApiError(422, `Texte trop long pour sa zone (${width} × ${height}, minimum ${style.minFontSize} px). Agrandissez la zone ou augmentez le nombre de lignes ; aucun nom n'est tronqué.`);
  return best;
}
