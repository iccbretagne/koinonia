"use client";

import { useState, useEffect, useMemo, type CSSProperties } from "react";
import dynamic from "next/dynamic";
import { usePathname, useSearchParams } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import BottomNav from "@/components/BottomNav";
import MoreSheet from "@/components/MoreSheet";
import TopBar, { type TopBarUser } from "@/components/TopBar";
import GuidedTour from "@/components/GuidedTour";
import type { ServerAction } from "@/components/AccountActions";
import { useSidebarPref, useViewport } from "@/components/shell-state";
import {
  STAGING_BUILD_VERSION,
  STAGING_BANNER_HEADER_OFFSET_CLASS,
  STAGING_BANNER_SIDEBAR_CLASS,
  STICKY_TOP_OFFSET,
} from "@/lib/env-banner";
import {
  bottomDestinations,
  buildSpaces,
  resolveActive,
  searchablePages,
  type NavigationInput,
} from "@/lib/navigation";

// Type importe plutot que recopie : les copies locales avaient derive et
// omettaient PASTORAL_CARE_REFERENT, privant ce role des etapes de tour ciblees.
import type { RoleKey } from "@/lib/tour-steps";

interface AuthLayoutShellProps extends Omit<NavigationInput, "jobsUnseenCount" | "isPastoral"> {
  /** Vue pastorale active. */
  readonly isPastoral?: boolean;
  readonly userRole: RoleKey;
  readonly user: TopBarUser;
  readonly churches: { id: string; name: string }[];
  readonly currentChurchId: string | null;
  readonly churchName: string;
  /** `Church.primaryColor` : filet sous la barre supérieure et pastille du sélecteur d'église. */
  readonly headerColor?: string;
  readonly hasBothRoles?: boolean;
  readonly switchViewAction?: ServerAction;
  readonly signOutAction: ServerAction;
  readonly children: React.ReactNode;
  readonly footer: React.ReactNode;
}

/** Largeur réservée à la sidebar, lue par le `Toast` (`--k-sidebar-width`) pour se placer à côté. */
const SIDEBAR_WIDTH = { mobile: "0px", rail: "72px", expanded: "256px" } as const;

/**
 * Chargée à la demande (⌘K/Ctrl K ou loupe, jamais au chargement initial de la page) : son
 * module n'est récupéré qu'à la première ouverture, pas sur chaque page authentifiée.
 */
const CommandPalette = dynamic(() => import("@/components/CommandPalette"), { ssr: false });

/**
 * Coquille de l'espace authentifié (spec 055, lot 3) : sidebar (≥ 768px), barre supérieure,
 * barre du bas et panneau « Plus » (< 768px), palette de recherche. Toutes les entrées de
 * navigation viennent d'une seule définition (`@/lib/navigation`), construite à partir des
 * sections calculées par `(auth)/layout.tsx`.
 */
export default function AuthLayoutShell({
  isPastoral = false,
  userRole,
  user,
  churches,
  currentChurchId,
  churchName,
  headerColor = "#5E17EB", // Church.primaryColor par défaut : donnée, style inline (exception de migration.md)
  hasBothRoles = false,
  switchViewAction,
  signOutAction,
  children,
  footer,
  ...navInput
}: AuthLayoutShellProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [moreOpen, setMoreOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  // Une fois vrai (première ouverture), reste vrai : le module de la palette a été demandé,
  // inutile de le redemander à chaque fermeture/réouverture.
  const [paletteLoaded, setPaletteLoaded] = useState(false);
  const [lastPath, setLastPath] = useState(pathname);
  if (pathname !== lastPath) {
    // Changement de page : les panneaux se referment.
    setLastPath(pathname);
    setMoreOpen(false);
    setSearchOpen(false);
  }

  // ── Pastille "nouvelles offres" (spec 042) ──────────────────────────────
  // Centralisé ici : sidebar, barre du bas et panneau « Plus » la reçoivent par la navigation,
  // un seul sondage réseau évite les doublons et les remises à zéro incohérentes.
  const { hasJobs = false } = navInput;
  const [jobsUnseenCount, setJobsUnseenCount] = useState(0);

  useEffect(() => {
    if (!hasJobs) return;
    let cancelled = false;
    const fetchCount = async () => {
      try {
        const res = await fetch("/api/jobs/unseen-count");
        if (!res.ok || cancelled) return;
        const data = await res.json();
        if (!cancelled) setJobsUnseenCount(data.count ?? 0);
      } catch {
        // Silencieux : la pastille reste simplement à sa dernière valeur connue.
      }
    };
    void fetchCount();
    const interval = setInterval(fetchCount, 60000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [hasJobs]);

  useEffect(() => {
    if (!hasJobs || pathname !== "/jobs" || jobsUnseenCount === 0) return;
    setJobsUnseenCount(0);
    fetch("/api/jobs/unseen-count", { method: "POST" }).catch(() => {
      // Silencieux : au pire le compteur se recale au prochain sondage.
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, hasJobs]);

  // ── Navigation (une seule définition) ───────────────────────────────────
  const spaces = useMemo(
    () => buildSpaces({ ...navInput, isPastoral, jobsUnseenCount }),
    // navInput est recréé à chaque rendu mais ses valeurs viennent du layout serveur.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(navInput), isPastoral, jobsUnseenCount]
  );
  const active = resolveActive(spaces, pathname, searchParams.get("dept"));
  const destinations = useMemo(() => bottomDestinations(spaces, { role: userRole, isPastoral }), [spaces, userRole, isPastoral]);
  const pages = useMemo(() => searchablePages(spaces), [spaces]);
  const moreBadge = spaces
    .filter((s) => !destinations.some((d) => d.space === s.key))
    .reduce((sum, s) => sum + (s.badge ?? 0), 0);

  // ── Raccourci ⌘K / Ctrl K ───────────────────────────────────────────────
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setMoreOpen(false);
        setPaletteLoaded(true);
        setSearchOpen((o) => !o);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // ── Largeur de la sidebar pour le Toast (monté hors de la coquille) ─────
  const [pref] = useSidebarPref();
  const viewport = useViewport();
  useEffect(() => {
    if (!viewport) return;
    const width =
      viewport === "mobile" ? SIDEBAR_WIDTH.mobile : viewport === "tablet" || pref === "rail" ? SIDEBAR_WIDTH.rail : SIDEBAR_WIDTH.expanded;
    const root = document.documentElement;
    root.style.setProperty("--k-sidebar-width", width);
    return () => {
      root.style.removeProperty("--k-sidebar-width");
    };
  }, [viewport, pref]);

  const accountActions = { hasBothRoles, isInPastoralMode: isPastoral, switchViewAction, signOutAction };

  return (
    <div className="min-h-dvh bg-bg md:flex" style={{ "--k-sticky-top": STICKY_TOP_OFFSET } as CSSProperties}>
      <Sidebar
        spaces={spaces}
        active={active}
        churches={churches}
        currentChurchId={currentChurchId}
        churchName={churchName}
        churchColor={headerColor}
        stickyClassName={STAGING_BUILD_VERSION ? STAGING_BANNER_SIDEBAR_CLASS : "top-0 h-dvh"}
      />

      <div className="flex min-h-dvh min-w-0 flex-1 flex-col">
        {/* Barre supérieure — décalée sous le bandeau de recette (fixe, hors flux) plutôt que de
            passer dessous au défilement. */}
        <TopBar
          spaces={spaces}
          user={user}
          churches={churches}
          currentChurchId={currentChurchId}
          churchName={churchName}
          churchColor={headerColor}
          onOpenSearch={() => {
            setPaletteLoaded(true);
            setSearchOpen(true);
          }}
          stickyClassName={STAGING_BUILD_VERSION ? STAGING_BANNER_HEADER_OFFSET_CLASS : "top-0"}
          {...accountActions}
        />

        <main className="mx-auto w-full max-w-[1200px] flex-1 px-4 pb-6 pt-4 md:px-6 md:pt-6">{children}</main>

        <div className="pb-[calc(64px+env(safe-area-inset-bottom))] md:pb-0">{footer}</div>
      </div>

      <BottomNav
        destinations={destinations}
        active={active}
        moreBadge={moreBadge > 0 ? moreBadge : undefined}
        moreOpen={moreOpen}
        onMoreOpen={() => setMoreOpen(true)}
      />

      <MoreSheet open={moreOpen} onClose={() => setMoreOpen(false)} spaces={spaces} active={active} {...accountActions} />

      {paletteLoaded && (
        <CommandPalette
          open={searchOpen}
          onClose={() => setSearchOpen(false)}
          pages={pages}
          churchId={currentChurchId}
          canSearchMembers={!!navInput.hasMembersAccess}
          canSearchEvents={!!navInput.hasEventsAccess}
        />
      )}

      {/* Interactive guided tour */}
      <GuidedTour userRole={userRole} />
    </div>
  );
}
