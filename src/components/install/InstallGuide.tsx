"use client";

import { useMemo, type ReactNode } from "react";
import Link from "next/link";
import {
  CircleCheck,
  Copy,
  Download,
  EllipsisVertical,
  MonitorDown,
  Share,
  Share2,
  SquarePlus,
  type LucideIcon,
} from "lucide-react";
import { Alert, Button, useToast } from "@/components/ui";
import { INSTALL_PATH, type InstallTarget } from "@/lib/install/detect";
import { promptInstall } from "@/lib/install/prompt-store";
import { useInstallTarget } from "@/lib/install/use-install-target";
import { qrPath } from "@/lib/qr";

const SHARE_TEXT = "Installe Koinonia sur ton téléphone en 1 minute :";

interface Step {
  readonly icon?: LucideIcon;
  readonly text: ReactNode;
}

function Steps({ steps }: { readonly steps: readonly Step[] }) {
  return (
    <ol className="flex flex-col gap-3">
      {steps.map((step, index) => (
        <li key={index} className="flex items-start gap-3">
          <span className="grid size-7 shrink-0 place-items-center rounded-full bg-brand-soft font-display text-[13px] font-bold text-brand-text">
            {index + 1}
          </span>
          <span className="flex flex-1 flex-wrap items-center gap-x-2 pt-0.5 text-[15px] leading-[22px] text-ink">
            {step.text}
            {step.icon && (
              <span className="inline-grid size-7 place-items-center rounded-control border border-line bg-surface-sunken text-ink-muted">
                <step.icon aria-hidden="true" className="size-4" strokeWidth={1.75} />
              </span>
            )}
          </span>
        </li>
      ))}
    </ol>
  );
}

const IOS_STEPS: Step[] = [
  { text: "Touchez le bouton Partager, en bas de Safari (en haut sur iPad)", icon: Share },
  { text: "Faites défiler et choisissez « Sur l'écran d'accueil »", icon: SquarePlus },
  { text: "Touchez « Ajouter » : Koinonia apparaît sur votre écran d'accueil." },
];

const ANDROID_STEPS: Step[] = [
  { text: "Touchez le menu du navigateur, en haut à droite", icon: EllipsisVertical },
  { text: "Choisissez « Installer l'application » (ou « Ajouter à l'écran d'accueil »)", icon: Download },
  { text: "Confirmez : Koinonia apparaît sur votre écran d'accueil." },
];

const DESKTOP_STEPS: Step[] = [
  { text: "Dans la barre d'adresse, cliquez sur l'icône d'installation, à droite", icon: MonitorDown },
  { text: "Cliquez sur « Installer »." },
  {
    text: "Sans cette icône (Edge) : menu « … » › Applications › « Installer ce site en tant qu'application ».",
  },
];

function Section({ title, children }: { readonly title: string; readonly children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4 rounded-card border border-line bg-surface p-4 shadow-card sm:p-5">
      <h2 className="font-display text-[17px] font-semibold leading-6 text-ink">{title}</h2>
      {children}
    </section>
  );
}

function useInstallUrl(): string {
  return useMemo(() => (typeof window === "undefined" ? INSTALL_PATH : `${window.location.origin}${INSTALL_PATH}`), []);
}

function CopyLinkButton({ url }: { readonly url: string }) {
  const toast = useToast();
  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Lien copié");
    } catch {
      toast.error("Copie impossible : appuyez longuement sur le lien pour le copier.");
    }
  }
  return (
    <div className="flex flex-col gap-2">
      <Button variant="secondary" onClick={copy}>
        <Copy aria-hidden="true" className="size-4" />
        Copier le lien
      </Button>
      <p className="break-all text-[13px] text-ink-muted">{url}</p>
    </div>
  );
}

function NativeInstallButton({ fallback }: { readonly fallback: readonly Step[] }) {
  const toast = useToast();
  async function install() {
    const outcome = await promptInstall();
    if (outcome === "accepted") toast.success("Koinonia est installée");
  }
  return (
    <div className="flex flex-col gap-4">
      <div>
        <Button onClick={install}>
          <Download aria-hidden="true" className="size-4" />
          Installer Koinonia
        </Button>
      </div>
      <details className="text-[15px] text-ink-muted">
        <summary className="cursor-pointer">Le bouton ne fonctionne pas ?</summary>
        <div className="mt-3">
          <Steps steps={fallback} />
        </div>
      </details>
    </div>
  );
}

function MainSection({ target, url, signedIn }: { readonly target: InstallTarget; readonly url: string; readonly signedIn: boolean }) {
  switch (target) {
    case "installed":
      return (
        <Alert tone="success" icon={CircleCheck} title="Koinonia est déjà installée sur cet appareil.">
          {signedIn ? (
            <>
              Pour recevoir les notifications, activez-les dans{" "}
              <Link href="/profile/notifications" className="font-semibold underline">
                Mes notifications
              </Link>
              .
            </>
          ) : (
            "Ouvrez-la depuis son icône sur l'écran d'accueil."
          )}
        </Alert>
      );
    case "ios-safari":
      return (
        <Section title="Sur votre iPhone ou iPad">
          <Steps steps={IOS_STEPS} />
          <p className="text-[13px] leading-[18px] text-ink-muted">
            Sur iPhone et iPad, c&apos;est indispensable pour recevoir les notifications de Koinonia.
          </p>
        </Section>
      );
    case "ios-open-in-safari":
      return (
        <Section title="Ouvrez cette page dans Safari">
          <p className="text-[15px] leading-[22px] text-ink">
            Sur iPhone et iPad, seul Safari peut installer Koinonia. Copiez le lien, ouvrez Safari et collez-le dans la
            barre d&apos;adresse. Depuis WhatsApp, vous pouvez aussi toucher « ⋯ » puis « Ouvrir dans Safari ».
          </p>
          <CopyLinkButton url={url} />
        </Section>
      );
    case "android-prompt":
      return (
        <Section title="Sur votre téléphone">
          <NativeInstallButton fallback={ANDROID_STEPS} />
        </Section>
      );
    case "android-manual":
      return (
        <Section title="Sur votre téléphone">
          <Steps steps={ANDROID_STEPS} />
        </Section>
      );
    case "android-open-in-chrome":
      return (
        <Section title="Ouvrez cette page dans Chrome">
          <p className="text-[15px] leading-[22px] text-ink">
            Cette page est ouverte dans une autre application, qui ne peut pas installer Koinonia. Touchez le menu « ⋮ »
            puis « Ouvrir dans Chrome », ou copiez le lien et collez-le dans Chrome.
          </p>
          <CopyLinkButton url={url} />
        </Section>
      );
    case "desktop-prompt":
      return (
        <Section title="Sur cet ordinateur">
          <NativeInstallButton fallback={DESKTOP_STEPS} />
        </Section>
      );
    case "desktop-manual":
      return (
        <Section title="Sur cet ordinateur">
          <Steps steps={DESKTOP_STEPS} />
        </Section>
      );
    case "unsupported":
      return (
        <Alert tone="info" title="Ce navigateur ne permet pas d'installer Koinonia.">
          Koinonia reste utilisable normalement ici. Pour l&apos;installer, ouvrez cette page dans Chrome ou Edge, ou
          sur votre téléphone avec le QR code ci-dessous.
        </Alert>
      );
  }
}

function QrCode({ url }: { readonly url: string }) {
  const qr = useMemo(() => qrPath(url), [url]);
  return (
    <Section title="Sur votre téléphone">
      <div className="flex flex-wrap items-center gap-4">
        <div data-theme="light" className="size-40 shrink-0 rounded-card bg-surface p-3 text-ink shadow-card">
          <svg viewBox={`0 0 ${qr.size} ${qr.size}`} shapeRendering="crispEdges" role="img" aria-label={`QR code vers ${url}`} className="block size-full">
            <path d={qr.path} fill="currentColor" />
          </svg>
        </div>
        <p className="min-w-0 flex-1 basis-48 text-[15px] leading-[22px] text-ink-muted">
          Scannez ce code avec l&apos;appareil photo de votre téléphone : la page s&apos;ouvre avec les étapes de votre
          téléphone.
        </p>
      </div>
    </Section>
  );
}

function ShareButton({ url }: { readonly url: string }) {
  const toast = useToast();
  async function share() {
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title: "Installer Koinonia", text: SHARE_TEXT, url });
        return;
      } catch (error) {
        if ((error as Error).name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.writeText(`${SHARE_TEXT} ${url}`);
      toast.success("Lien copié, prêt à être collé dans WhatsApp");
    } catch {
      toast.error("Copie impossible : copiez l'adresse de la page.");
    }
  }
  return (
    <Button variant="secondary" onClick={share}>
      <Share2 aria-hidden="true" className="size-4" />
      Partager ce lien
    </Button>
  );
}

/**
 * Aide à l'installation de Koinonia (spec 070) : étapes de l'appareil détecté en premier,
 * toutes les autres sous « Autre appareil ? ». Rien n'est rendu avant la détection.
 */
export default function InstallGuide({ signedIn }: { readonly signedIn: boolean }) {
  const detected = useInstallTarget();
  const url = useInstallUrl();
  if (!detected) return null;
  const { target, platform } = detected;

  return (
    <div className="flex flex-col gap-4">
      <MainSection target={target} url={url} signedIn={signedIn} />

      {platform === "desktop" && <QrCode url={url} />}

      <details className="rounded-card border border-line bg-surface p-4 sm:p-5">
        <summary className="cursor-pointer font-display text-[15px] font-semibold text-ink">Autre appareil ?</summary>
        <div className="mt-4 flex flex-col gap-5">
          <div className="flex flex-col gap-3">
            <h3 className="text-[15px] font-semibold text-ink">iPhone et iPad (Safari)</h3>
            <Steps steps={IOS_STEPS} />
          </div>
          <div className="flex flex-col gap-3">
            <h3 className="text-[15px] font-semibold text-ink">Android (Chrome, Edge, Samsung Internet)</h3>
            <Steps steps={ANDROID_STEPS} />
          </div>
          <div className="flex flex-col gap-3">
            <h3 className="text-[15px] font-semibold text-ink">Ordinateur (Chrome, Edge)</h3>
            <Steps steps={DESKTOP_STEPS} />
          </div>
          <p className="text-[13px] leading-[18px] text-ink-muted">
            Firefox et Safari sur ordinateur ne permettent pas l&apos;installation : Koinonia y reste utilisable dans
            un onglet.
          </p>
        </div>
      </details>

      <div>
        <ShareButton url={url} />
      </div>
    </div>
  );
}
