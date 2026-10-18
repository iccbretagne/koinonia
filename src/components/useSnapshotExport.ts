"use client";

import { useState, type RefObject } from "react";
import { useToast } from "@/components/ui/Toast";

export type SnapshotExportKind = "pdf" | "image" | "copy";

export interface SnapshotExportOptions {
  /** Largeur forcée pendant la capture (mise en page indépendante de l'écran). */
  captureWidth: string;
  orientation: "portrait" | "landscape";
  /** Nom du fichier exporté, sans extension. */
  fileName: () => string;
  /** Titre de l'onglet ouvert quand le presse-papiers est refusé. */
  copyWindowTitle: string;
  /** Thème forcé pendant la capture. Défaut : `light` (image partagée). */
  theme?: "light" | "dark";
  /** Échelle de rendu. Défaut : 2 (netteté sur écran dense). */
  scale?: number;
}

/**
 * Dimensions et décalage d'une image ajustée à une page sans déformation, centrée
 * horizontalement et calée en haut.
 */
export function fitImageInPage(pageWidth: number, pageHeight: number, imageWidth: number, imageHeight: number) {
  const ratio = imageHeight / imageWidth;
  let width = pageWidth;
  let height = pageWidth * ratio;
  if (height > pageHeight) {
    height = pageHeight;
    width = pageHeight / ratio;
  }
  return { x: (pageWidth - width) / 2, width, height };
}

function canvasToBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b: Blob | null) => {
      if (b) resolve(b);
      else reject(new Error("toBlob failed"));
    }, "image/png");
  });
}

/** Élément capturé, réduit à ce que la préparation touche (testable sans DOM). */
interface CaptureTarget {
  style: { width: string; transform: string };
  dataset: Record<string, string | undefined>;
}

/**
 * Prépare un élément à la capture : largeur forcée, échelle d'affichage retirée (une scène mise
 * à l'échelle, comme la slide, est capturée à sa taille réelle) et thème forcé — clair par
 * défaut pour l'image partagée. Renvoie la fonction qui rétablit l'état d'origine.
 */
export function prepareForCapture(
  el: CaptureTarget,
  options: Pick<SnapshotExportOptions, "captureWidth" | "theme">
): () => void {
  const saved = { width: el.style.width, transform: el.style.transform, theme: el.dataset.theme };
  el.style.width = options.captureWidth;
  el.style.transform = "none";
  el.dataset.theme = options.theme ?? "light";
  return () => {
    el.style.width = saved.width;
    el.style.transform = saved.transform;
    if (saved.theme === undefined) delete el.dataset.theme;
    else el.dataset.theme = saved.theme;
  };
}

/**
 * Exports d'un bloc affiché (copie d'image, PNG, PDF A4), capturé en thème clair (ou celui
 * demandé) à une largeur fixe, quelle que soit la taille de l'écran.
 */
export function useSnapshotExport(printRef: RefObject<HTMLElement | null>, options: SnapshotExportOptions) {
  const toast = useToast();
  const [exporting, setExporting] = useState<SnapshotExportKind | null>(null);

  async function captureForExport(): Promise<HTMLCanvasElement | null> {
    if (!printRef.current) return null;
    const html2canvas = (await import("html2canvas-pro")).default;
    const el = printRef.current;
    const restore = prepareForCapture(el, options);
    await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
    try {
      return await html2canvas(el, { scale: options.scale ?? 2, useCORS: true, windowWidth: 1440 });
    } finally {
      restore();
    }
  }

  async function run(kind: SnapshotExportKind, action: (canvas: HTMLCanvasElement) => Promise<void> | void) {
    if (!printRef.current || exporting) return;
    setExporting(kind);
    try {
      const canvas = await captureForExport();
      if (canvas) await action(canvas);
    } catch {
      toast.error("Export impossible. Réessayez dans un instant.");
    } finally {
      setExporting(null);
    }
  }

  const copyImage = () =>
    run("copy", async (canvas) => {
      try {
        const blob = await canvasToBlob(canvas);
        await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
        toast.success("Image copiée dans le presse-papiers");
      } catch {
        const w = window.open();
        if (w) {
          const img = w.document.createElement("img");
          img.src = canvas.toDataURL("image/png");
          w.document.body.append(img);
          w.document.title = options.copyWindowTitle;
        } else {
          toast.error("Impossible de copier l'image. Vérifiez les permissions du navigateur.");
        }
      }
    });

  const downloadImage = () =>
    run("image", (canvas) => {
      const link = document.createElement("a");
      link.download = `${options.fileName()}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    });

  const exportPdf = () =>
    run("pdf", async (canvas) => {
      const { jsPDF } = await import("jspdf");
      const pdf = new jsPDF(options.orientation, "mm", "a4");
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const { x, width, height } = fitImageInPage(pageWidth, pageHeight, canvas.width, canvas.height);
      pdf.addImage(canvas.toDataURL("image/png"), "PNG", x, 0, width, height);
      pdf.save(`${options.fileName()}.pdf`);
    });

  return { exporting, copyImage, downloadImage, exportPdf };
}
