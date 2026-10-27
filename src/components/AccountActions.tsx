"use client";

import Link from "next/link";
import { ArrowLeftRight, Download, LogOut } from "lucide-react";
import { ACCOUNT_PAGES } from "@/lib/navigation";
import { sheetGroup } from "@/components/nav-styles";
import { INSTALL_PATH, installHint, isInstallOffered, isNativePrompt } from "@/lib/install/detect";
import { promptInstall } from "@/lib/install/prompt-store";
import { useInstallTarget } from "@/lib/install/use-install-target";

/** Actions serveur existantes du layout `(auth)` (bascule de vue, déconnexion). */
export type ServerAction = () => Promise<void>;

export interface AccountActionsProps {
  /** Profil pastoral + rôle classique dans l'église courante : bascule de vue proposée. */
  readonly hasBothRoles: boolean;
  readonly isInPastoralMode: boolean;
  readonly switchViewAction?: ServerAction;
  readonly signOutAction: ServerAction;
}

const rowClass = `flex min-h-11 w-full cursor-pointer items-center gap-3 rounded-control px-3 text-left text-[15px] text-ink
  transition-colors duration-120 hover:bg-surface-sunken focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus`;
const iconClass = "size-5 shrink-0 text-ink-subtle";

// Variante `sheet` (panneau « Plus ») : lignes d'un bloc groupé, icône plus discrète qu'une tuile
// d'espace, déconnexion isolée dans son propre bloc.
const sheetRowClass = `flex min-h-12 w-full cursor-pointer items-center gap-3 px-3.5 text-left text-[15px]
  transition-colors duration-120 hover:bg-surface focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus`;
const sheetIconClass = "size-[18px] shrink-0";

/**
 * « Installer l'application » (spec 070) : ligne contextuelle, absente dans l'application
 * installée et sur un navigateur qui ne permet pas l'installation. Un appui ouvre directement la
 * fenêtre du système quand elle est disponible, sinon la page d'installation.
 */
function InstallRow({
  variant,
  onNavigate,
}: {
  readonly variant: "menu" | "sheet";
  readonly onNavigate?: () => void;
}) {
  const detected = useInstallTarget();
  if (!detected || !isInstallOffered(detected.target)) return null;

  const row = variant === "sheet" ? `${sheetRowClass} text-ink` : rowClass;
  const icon = variant === "sheet" ? `${sheetIconClass} text-ink-subtle` : iconClass;
  const content = (
    <>
      <Download aria-hidden="true" className={icon} strokeWidth={1.75} />
      <span className="flex min-w-0 flex-col py-1.5">
        <span>Installer l&apos;application</span>
        <span className="text-[13px] leading-[18px] text-ink-muted">{installHint(detected.target)}</span>
      </span>
    </>
  );

  if (isNativePrompt(detected.target)) {
    return (
      <li>
        <button
          type="button"
          className={row}
          onClick={() => {
            onNavigate?.();
            void promptInstall();
          }}
        >
          {content}
        </button>
      </li>
    );
  }
  return (
    <li>
      <Link href={INSTALL_PATH} onClick={onNavigate} className={row}>
        {content}
      </Link>
    </li>
  );
}

/**
 * Liens de compte communs au menu de l'avatar (desktop) et au panneau « Plus » (mobile,
 * `variant="sheet"`) : profil, guide, bascule vue pastorale/classique, déconnexion.
 */
export default function AccountActions({
  hasBothRoles,
  isInPastoralMode,
  switchViewAction,
  signOutAction,
  onNavigate,
  variant = "menu",
}: AccountActionsProps & { readonly onNavigate?: () => void; readonly variant?: "menu" | "sheet" }) {
  if (variant === "sheet") {
    return (
      <div className="flex flex-col gap-3">
        <ul className={`${sheetGroup} divide-y divide-line`}>
          {ACCOUNT_PAGES.map(({ href, label, icon: Icon }) => (
            <li key={href}>
              <Link href={href} onClick={onNavigate} className={`${sheetRowClass} text-ink`}>
                <Icon aria-hidden="true" className={`${sheetIconClass} text-ink-subtle`} strokeWidth={1.75} />
                {label}
              </Link>
            </li>
          ))}
          <InstallRow variant="sheet" onNavigate={onNavigate} />
          {hasBothRoles && switchViewAction && (
            <li>
              <form action={switchViewAction}>
                <button type="submit" className={`${sheetRowClass} text-ink`}>
                  <ArrowLeftRight aria-hidden="true" className={`${sheetIconClass} text-ink-subtle`} strokeWidth={1.75} />
                  {isInPastoralMode ? "Basculer vers la vue classique" : "Basculer vers la vue pastorale"}
                </button>
              </form>
            </li>
          )}
        </ul>
        <form action={signOutAction} className={sheetGroup}>
          <button type="submit" className={`${sheetRowClass} text-danger`}>
            <LogOut aria-hidden="true" className={sheetIconClass} strokeWidth={1.75} />
            Se déconnecter
          </button>
        </form>
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-px">
      {ACCOUNT_PAGES.map(({ href, label, icon: Icon }) => (
        <li key={href}>
          <Link href={href} onClick={onNavigate} className={rowClass}>
            <Icon aria-hidden="true" className={iconClass} strokeWidth={1.75} />
            {label}
          </Link>
        </li>
      ))}
      <InstallRow variant="menu" onNavigate={onNavigate} />
      {hasBothRoles && switchViewAction && (
        <li>
          <form action={switchViewAction}>
            <button type="submit" className={rowClass}>
              <ArrowLeftRight aria-hidden="true" className={iconClass} strokeWidth={1.75} />
              {isInPastoralMode ? "Basculer vers la vue classique" : "Basculer vers la vue pastorale"}
            </button>
          </form>
        </li>
      )}
      <li>
        <form action={signOutAction}>
          <button type="submit" className={rowClass}>
            <LogOut aria-hidden="true" className={iconClass} strokeWidth={1.75} />
            Se déconnecter
          </button>
        </form>
      </li>
    </ul>
  );
}
