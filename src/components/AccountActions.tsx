"use client";

import Link from "next/link";
import { ArrowLeftRight, LogOut } from "lucide-react";
import { ACCOUNT_PAGES } from "@/lib/navigation";

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

/**
 * Liens de compte communs au menu de l'avatar (desktop) et au panneau « Plus » (mobile) : profil,
 * guide, bascule vue pastorale/classique, déconnexion.
 */
export default function AccountActions({
  hasBothRoles,
  isInPastoralMode,
  switchViewAction,
  signOutAction,
  onNavigate,
}: AccountActionsProps & { readonly onNavigate?: () => void }) {
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
