"use client";

import { useState } from "react";
import Link from "next/link";
import { Smartphone } from "lucide-react";
import { Button, useToast } from "@/components/ui";
import { buttonClasses } from "@/components/ui/button-classes";
import { INSTALL_PATH, isInstallOffered, isNativePrompt } from "@/lib/install/detect";
import { dismissInstallCard, isInstallCardDismissed } from "@/lib/install/dismiss";
import { promptInstall } from "@/lib/install/prompt-store";
import { useInstallTarget } from "@/lib/install/use-install-target";

/**
 * Invitation à installer Koinonia (spec 070) : affichée seulement si l'appareil le permet et que
 * Koinonia n'y est pas déjà installée. « Plus tard » la masque 30 jours sur cet appareil.
 */
export default function InstallCard() {
  const detected = useInstallTarget();
  const toast = useToast();
  const [hidden, setHidden] = useState(false);

  if (!detected || hidden || !isInstallOffered(detected.target) || isInstallCardDismissed(new Date())) return null;
  const native = isNativePrompt(detected.target);

  async function install() {
    const outcome = await promptInstall();
    if (outcome === "accepted") toast.success("Koinonia est installée");
  }

  function later() {
    dismissInstallCard(new Date());
    setHidden(true);
  }

  return (
    <section
      aria-labelledby="install-card-title"
      className="flex flex-wrap items-center gap-4 rounded-card border border-line bg-surface p-4 shadow-card sm:p-5"
    >
      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-brand-soft text-brand-text">
        <Smartphone aria-hidden="true" className="size-5" strokeWidth={1.75} />
      </span>
      <div className="min-w-0 flex-1 basis-56">
        <h2 id="install-card-title" className="text-[15px] font-semibold leading-[22px] text-ink">
          Installez Koinonia sur votre appareil
        </h2>
        <p className="text-[13px] leading-[18px] text-ink-muted">
          Une icône sur l&apos;écran d&apos;accueil, l&apos;application en plein écran et les notifications.
        </p>
      </div>
      <div className="flex gap-2">
        {native ? (
          <Button size="sm" onClick={install}>
            Installer
          </Button>
        ) : (
          <Link href={INSTALL_PATH} className={buttonClasses("primary", "sm")}>
            Voir comment
          </Link>
        )}
        <Button size="sm" variant="ghost" onClick={later}>
          Plus tard
        </Button>
      </div>
    </section>
  );
}
