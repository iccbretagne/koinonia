"use client";

import { useCallback, useEffect, useRef, type ReactNode } from "react";
import { Download, FileText, Landmark, Mail, Maximize, type LucideIcon } from "lucide-react";
import Button from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { useSnapshotExport } from "@/components/useSnapshotExport";
import type { GivingNameSize } from "@/generated/prisma/enums";
import {
  displayUrl,
  fitName,
  fitQrSize,
  fitUrlLines,
  fitVerse,
  QR_MAX,
  SLIDE_IDENTITY_H,
  SLIDE_LOGO_H,
  SLIDE_LOGO_MAX_W,
  SLIDE_NAME_PX,
  SLIDE_TITLE_PX,
  slideVerse,
} from "./slide-fit";

const SLIDE_W = 1920;
const SLIDE_H = 1080;

interface GivingSlideProps {
  readonly churchName: string;
  /** Taille du nom de l'église, `null` s'il est masqué (spec 066). */
  readonly churchNameSize: GivingNameSize | null;
  /** Logo (adresse publique, même origine), `null` s'il est absent ou masqué. */
  readonly logoSrc: string | null;
  /** Adresse visée par le QR code : l'adresse courte, à défaut la page publique Koinonia. */
  readonly target: string;
  /** Adresse courte, seule écrite sous le QR code. */
  readonly shortUrl: string | null;
  readonly qr: { readonly size: number; readonly path: string };
  readonly transfer: boolean;
  readonly onsite: boolean;
  readonly checkPayee: string | null;
  readonly verse: { readonly text: string; readonly reference: string | null } | null;
}

function Mean({
  icon: Icon,
  iconClass,
  title,
  children,
}: {
  readonly icon: LucideIcon;
  readonly iconClass: string;
  readonly title: string;
  readonly children: ReactNode;
}) {
  return (
    <div className="flex flex-1 items-center gap-7 rounded-[28px] border border-line bg-surface px-[34px] py-[26px]">
      <span className={`grid size-[84px] shrink-0 place-items-center rounded-[22px] ${iconClass}`}>
        <Icon aria-hidden="true" className="size-[46px]" strokeWidth={1.75} />
      </span>
      <div className="min-w-0">
        <h3 className="mb-2 font-display text-[46px] font-black uppercase leading-none text-ink">{title}</h3>
        <p className="text-[33px] font-semibold leading-tight text-ink-muted">{children}</p>
      </div>
    </div>
  );
}

/** Nom sur sa ligne : réduit jusqu'à 26 px, puis à la ligne (spec 066). */
function fitNameElement(el: HTMLElement, start: number) {
  const apply = (px: number) => {
    el.style.fontSize = `${px}px`;
    el.style.letterSpacing = px > SLIDE_NAME_PX.SMALL ? "0.12em" : "0.2em";
  };
  el.style.whiteSpace = "nowrap";
  const { size, wrap } = fitName(start, (px) => {
    apply(px);
    return el.scrollWidth <= el.clientWidth;
  });
  apply(size);
  el.style.whiteSpace = wrap ? "normal" : "nowrap";
}

/** Verset sur une ligne, police réduite, puis retour à la ligne. */
function fitVerseElement(el: HTMLElement) {
  if (!el.clientWidth) return;
  el.style.whiteSpace = "nowrap";
  const { size, wrap } = fitVerse((px) => {
    el.style.fontSize = `${px}px`;
    return el.scrollWidth <= el.clientWidth;
  });
  el.style.fontSize = `${size}px`;
  el.style.whiteSpace = wrap ? "normal" : "nowrap";
}

/**
 * Adresse sous le QR code : la plus grande taille qui tient en largeur **sans faire déborder la
 * slide** ; à défaut, la plus grande qui tient en largeur (le QR code se réduira ensuite).
 */
function fitUrlElement(
  shownUrl: string,
  els: { url: HTMLElement; line1: HTMLElement; line2: HTMLElement },
  overflows: () => boolean
) {
  const { url, line1, line2 } = els;
  const apply = (lines: string[], px: number) => {
    line1.textContent = lines[0];
    line2.textContent = lines[1] ?? "";
    line2.hidden = lines.length < 2;
    url.style.fontSize = `${px}px`;
  };
  const fitsWidth = (lines: string[], px: number) => {
    apply(lines, px);
    return line1.scrollWidth <= url.clientWidth && line2.scrollWidth <= url.clientWidth;
  };
  const fitsAll = (lines: string[], px: number) => fitsWidth(lines, px) && !overflows();
  let fit = fitUrlLines(shownUrl, fitsAll);
  if (!fitsAll(fit.lines, fit.size)) fit = fitUrlLines(shownUrl, fitsWidth);
  apply(fit.lines, fit.size);
}

/**
 * Slide « Dîmes & Offrandes » (spec 065) : scène 1920 × 1080 en thème sombre Koinonia, mise à
 * l'échelle de son conteneur. Les tailles (adresse, verset, QR code) sont ajustées sur le rendu
 * réel pour que rien ne dépasse. Jamais d'IBAN : il se lit sur la page de dons.
 */
export default function GivingSlide({
  churchName,
  churchNameSize,
  logoSrc,
  target,
  shortUrl,
  qr,
  transfer,
  onsite,
  checkPayee,
  verse,
}: GivingSlideProps) {
  const toast = useToast();
  const stageRef = useRef<HTMLDivElement>(null);
  const slideRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const urlRef = useRef<HTMLDivElement>(null);
  const urlLine1 = useRef<HTMLSpanElement>(null);
  const urlLine2 = useRef<HTMLSpanElement>(null);
  const verseRef = useRef<HTMLParagraphElement>(null);
  const nameRef = useRef<HTMLParagraphElement>(null);

  const shownUrl = shortUrl ? displayUrl(shortUrl) : null;

  const { exporting, downloadImage } = useSnapshotExport(slideRef, {
    captureWidth: `${SLIDE_W}px`,
    orientation: "landscape",
    fileName: () => "slide-dons",
    copyWindowTitle: "Slide de dons",
    theme: "dark",
    scale: 1,
  });

  const fitContent = useCallback(() => {
    if (churchNameSize && nameRef.current) fitNameElement(nameRef.current, SLIDE_NAME_PX[churchNameSize]);
    if (verseRef.current) fitVerseElement(verseRef.current);

    const slide = slideRef.current;
    const frame = frameRef.current;
    const card = cardRef.current;
    const body = bodyRef.current;
    if (!slide || !frame || !card || !body) return;
    const setQr = (px: number) => {
      frame.style.width = `${px}px`;
      frame.style.height = `${px}px`;
    };
    const overflows = () =>
      slide.scrollHeight > SLIDE_H ||
      card.scrollHeight > card.clientHeight + 1 ||
      body.scrollHeight > body.clientHeight + 1;

    // L'adresse se réduit d'abord avec le QR code à pleine taille ; le QR code ne rétrécit qu'en
    // dernier recours (spec 066). Le nom et le logo, sur leur ligne fixe, n'y touchent jamais.
    setQr(QR_MAX);
    const url = urlRef.current;
    const line1 = urlLine1.current;
    const line2 = urlLine2.current;
    if (shownUrl && url?.clientWidth && line1 && line2) fitUrlElement(shownUrl, { url, line1, line2 }, overflows);
    setQr(fitQrSize((px) => {
      setQr(px);
      return overflows();
    }));
  }, [shownUrl, churchNameSize]);

  const scaleToStage = useCallback(() => {
    const stage = stageRef.current;
    const slide = slideRef.current;
    if (!stage || !slide || !stage.clientWidth) return;
    const fullscreen = document.fullscreenElement === stage;
    const w = stage.clientWidth;
    const h = stage.clientHeight;
    const s = fullscreen ? Math.min(w / SLIDE_W, h / SLIDE_H) : w / SLIDE_W;
    slide.style.transform = `scale(${s})`;
    slide.style.left = fullscreen ? `${(w - SLIDE_W * s) / 2}px` : "0px";
    slide.style.top = fullscreen ? `${(h - SLIDE_H * s) / 2}px` : "0px";
  }, []);

  useEffect(() => {
    const refit = () => {
      fitContent();
      scaleToStage();
    };
    refit();
    // Les mesures ne valent qu'avec les polices définitives.
    document.fonts?.ready.then(refit).catch(() => {});
    const stage = stageRef.current;
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(scaleToStage);
    if (stage) observer?.observe(stage);
    document.addEventListener("fullscreenchange", scaleToStage);
    return () => {
      observer?.disconnect();
      document.removeEventListener("fullscreenchange", scaleToStage);
    };
  }, [fitContent, scaleToStage]);

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
          Le QR code mène à {target}.
          {shortUrl ? null : " Sans adresse courte, seul le QR code est affiché."}
        </p>
      </div>

      {/* En plein écran, un clic sur la scène en sort (écouteur posé dans l'effet ci-dessus). */}
      <div
        ref={stageRef}
        className="relative aspect-video w-full overflow-hidden rounded-card border border-line bg-bg [&:fullscreen]:aspect-auto [&:fullscreen]:rounded-none [&:fullscreen]:border-0"
      >
        <div
          ref={slideRef}
          data-theme="dark"
          style={{ width: SLIDE_W, height: SLIDE_H, transformOrigin: "0 0" }}
          className="absolute left-0 top-0 flex flex-col bg-bg px-24 pb-[60px] pt-[72px] font-sans text-ink"
        >
          {(churchNameSize || logoSrc) && (
            // Ligne de hauteur fixe : le nom et le logo ne prennent jamais la place du QR code (spec 066).
            <div className="mb-[18px] flex shrink-0 items-center gap-6" style={{ minHeight: SLIDE_IDENTITY_H }}>
              {logoSrc && (
                // Logo servi par Koinonia (même origine) pour l'export PNG : pas de next/image.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={logoSrc}
                  alt=""
                  onLoad={fitContent}
                  style={{ height: SLIDE_LOGO_H, maxWidth: SLIDE_LOGO_MAX_W }}
                  className="w-auto shrink-0 object-contain"
                />
              )}
              {churchNameSize && (
                <p
                  ref={nameRef}
                  style={{ fontSize: SLIDE_NAME_PX[churchNameSize] }}
                  className="min-w-0 flex-1 font-display font-bold uppercase leading-[1.2] tracking-[0.2em] text-ink-muted [overflow-wrap:anywhere]"
                >
                  {churchName}
                </p>
              )}
            </div>
          )}
          <p
            style={{ fontSize: SLIDE_TITLE_PX }}
            className="font-display font-black uppercase leading-[0.95] tracking-[-0.015em] text-ink"
          >
            Dîmes &amp; <span className="text-brand-text">Offrandes</span>
          </p>

          <div ref={bodyRef} className="mt-10 grid min-h-0 flex-1 grid-cols-[700px_1fr] gap-12">
            <div
              ref={cardRef}
              className="flex min-h-0 flex-col items-center justify-center gap-[26px] overflow-hidden rounded-[32px] border-2 border-brand bg-surface p-9"
            >
              <div
                ref={frameRef}
                data-theme="light"
                style={{ width: QR_MAX, height: QR_MAX }}
                className="shrink-0 rounded-[20px] bg-surface p-[22px] text-ink"
              >
                <svg
                  viewBox={`0 0 ${qr.size} ${qr.size}`}
                  shapeRendering="crispEdges"
                  role="img"
                  aria-label={`QR code vers ${target}`}
                  className="block size-full"
                >
                  <path d={qr.path} fill="currentColor" />
                </svg>
              </div>
              {shownUrl ? (
                <div
                  ref={urlRef}
                  className="w-full shrink-0 overflow-hidden whitespace-nowrap text-center font-display text-[60px] font-black leading-[1.08] text-accent"
                >
                  <span ref={urlLine1} className="block">
                    {shownUrl}
                  </span>
                  <span ref={urlLine2} className="block" hidden />
                </div>
              ) : (
                <p className="text-center text-[36px] font-semibold text-ink">Scanne le code avec ton téléphone</p>
              )}
            </div>

            <div className="flex min-h-0 flex-col gap-[22px]">
              {transfer && (
                <Mean icon={Landmark} iconClass="bg-info-soft text-info" title="Par virement">
                  IBAN et libellé sur <b className="text-ink">{shownUrl ?? "la page de dons"}</b>
                </Mean>
              )}
              {checkPayee && (
                <Mean icon={FileText} iconClass="bg-success-soft text-success" title="Par chèque">
                  À l&apos;ordre de <b className="text-ink">{checkPayee}</b>
                </Mean>
              )}
              {onsite && (
                <Mean icon={Mail} iconClass="bg-warning-soft text-warning" title="En espèces">
                  Dans l&apos;enveloppe remise par <b className="text-ink">l&apos;accueil</b>
                </Mean>
              )}
            </div>
          </div>

          {verse && (
            <p
              ref={verseRef}
              className="mt-7 shrink-0 overflow-hidden whitespace-nowrap text-center text-[34px] font-semibold italic leading-[1.2] text-ink"
            >
              « {slideVerse(verse.text)} »
              {verse.reference && (
                <b className="font-extrabold not-italic text-brand-text"> — {verse.reference}</b>
              )}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
