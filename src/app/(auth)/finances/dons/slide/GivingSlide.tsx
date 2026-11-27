"use client";

import { useEffect, useRef } from "react";
import { Download, Maximize } from "lucide-react";
import Button from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { useSnapshotExport } from "@/components/useSnapshotExport";
import GivingSlideStage, { SLIDE_W } from "./GivingSlideStage";
import type { SlideProps } from "./slide-props";

/**
 * Slide « Dîmes & Offrandes » projetée au culte (spec 065) : la scène, le plein écran et l'export
 * PNG.
 */
export default function GivingSlide(props: SlideProps & { readonly qr: { readonly size: number; readonly path: string } }) {
  const toast = useToast();
  const stageRef = useRef<HTMLDivElement>(null);
  const slideRef = useRef<HTMLDivElement>(null);

  const { exporting, downloadImage } = useSnapshotExport(slideRef, {
    captureWidth: `${SLIDE_W}px`,
    orientation: "landscape",
    fileName: () => "slide-dons",
    copyWindowTitle: "Slide de dons",
    theme: "dark",
    scale: 1,
  });

  useEffect(() => {
    // Sortie du plein écran : Échap (natif), un clic ou retour arrière.
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Backspace" && document.fullscreenElement === stageRef.current) {
        e.preventDefault();
        void document.exitFullscreen();
      }
    };
    const onClick = () => {
      if (document.fullscreenElement === stageRef.current) void document.exitFullscreen();
    };
    const stage = stageRef.current;
    document.addEventListener("keydown", onKey);
    stage?.addEventListener("click", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      stage?.removeEventListener("click", onClick);
    };
  }, []);

  async function enterFullscreen() {
    const stage = stageRef.current;
    if (!stage?.requestFullscreen) {
      toast.error("Le plein écran n'est pas disponible dans ce navigateur.");
      return;
    }
    try {
      await stage.requestFullscreen();
    } catch {
      toast.error("Plein écran refusé par le navigateur.");
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={enterFullscreen}>
          <Maximize aria-hidden="true" className="size-4" />
          Plein écran
        </Button>
        <Button variant="secondary" onClick={downloadImage} disabled={exporting !== null}>
          <Download aria-hidden="true" className="size-4" />
          {exporting === "image" ? "Préparation…" : "Télécharger (PNG)"}
        </Button>
        <p className="min-w-0 flex-1 basis-64 break-words text-[13px] leading-[18px] text-ink-muted">
          Le QR code mène à {props.target}.
          {props.shortUrl ? null : " Sans adresse courte, seul le QR code est affiché."}
        </p>
      </div>
      <GivingSlideStage {...props} stageRef={stageRef} slideRef={slideRef} />
    </div>
  );
}
