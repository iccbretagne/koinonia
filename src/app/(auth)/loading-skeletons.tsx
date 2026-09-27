import Skeleton, { PageSkeleton, SkeletonList } from "@/components/ui/Skeleton";

/**
 * Silhouettes des `loading.tsx` de l'espace authentifié (docs/design-system/guidelines/20-fluidite.md) :
 * chaque segment reprend la forme de sa page (liste, formulaire, fiche, grille, statistiques)
 * pour qu'une navigation affiche immédiatement un squelette plutôt qu'un écran figé.
 * Composants serveur, sans état. L'apparition est différée de 150 ms (pas de clignotement).
 */

const delayedAppear = "transition-opacity delay-150 duration-200 starting:opacity-0";

function Shell({ label, children }: { readonly label: string; readonly children: React.ReactNode }) {
  return (
    <div aria-busy="true" aria-live="polite" className={`flex flex-col gap-6 ${delayedAppear}`}>
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}

function HeaderSkeleton({ withAction = false, withTabs = false }: { readonly withAction?: boolean; readonly withTabs?: boolean }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="flex min-w-0 flex-1 basis-64 flex-col gap-2">
          <Skeleton className="h-7 w-48 md:h-8 md:w-64" />
          <Skeleton className="h-4 w-full max-w-sm" />
        </div>
        {withAction && <Skeleton className="h-11 w-36 rounded-control" />}
      </div>
      {withTabs && (
        <div className="flex gap-4 border-b border-line pb-3">
          {[20, 16, 14, 18].map((w, i) => (
            <Skeleton key={i} className="h-5" style={{ width: `${w * 4}px` }} />
          ))}
        </div>
      )}
    </div>
  );
}

/** Liste : en-tête, action principale, lignes. */
export function ListPageSkeleton({ rows = 6, withAction = true }: { readonly rows?: number; readonly withAction?: boolean }) {
  return <PageSkeleton rows={rows} withAction={withAction} />;
}

/** Formulaire : en-tête puis champs empilés et bouton d'envoi. */
export function FormPageSkeleton({ fields = 5 }: { readonly fields?: number }) {
  return (
    <Shell label="Chargement du formulaire…">
      <HeaderSkeleton />
      <div className="flex max-w-2xl flex-col gap-5">
        {Array.from({ length: fields }, (_, i) => (
          <div key={i} className="flex flex-col gap-1.5">
            <Skeleton className="h-4 w-32" />
            <Skeleton className={`${i === 1 ? "h-24" : "h-11"} w-full rounded-control`} />
          </div>
        ))}
        <Skeleton className="h-11 w-40 rounded-control" />
      </div>
    </Shell>
  );
}

/** Fiche détaillée : en-tête, bloc principal, puis sections. */
export function DetailPageSkeleton() {
  return (
    <Shell label="Chargement de la fiche…">
      <HeaderSkeleton withAction />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex flex-col gap-4">
          <Skeleton className="h-40 w-full rounded-card" />
          <SkeletonList rows={3} label={null} />
        </div>
        <div className="flex flex-col gap-4">
          <Skeleton className="h-32 w-full rounded-card" />
          <Skeleton className="h-24 w-full rounded-card" />
        </div>
      </div>
    </Shell>
  );
}

/** Statistiques : en-tête, filtres, tuiles chiffrées, graphique. */
export function StatsPageSkeleton() {
  return (
    <Shell label="Chargement des statistiques…">
      <HeaderSkeleton />
      <div className="flex flex-wrap gap-3">
        <Skeleton className="h-11 w-56 rounded-control" />
        <Skeleton className="h-11 w-40 rounded-control" />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-[88px] rounded-card" />
        ))}
      </div>
      <Skeleton className="h-72 w-full rounded-card" />
    </Shell>
  );
}

/** Calendrier : en-tête, contrôles, grille de 5 semaines. */
export function CalendarPageSkeleton() {
  return (
    <Shell label="Chargement du calendrier…">
      <HeaderSkeleton withAction />
      <div className="flex items-center justify-between gap-3">
        <Skeleton className="size-11 rounded-control" />
        <Skeleton className="h-11 w-48 rounded-control" />
        <Skeleton className="size-11 rounded-control" />
      </div>
      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-card border border-line bg-line">
        {Array.from({ length: 35 }, (_, i) => (
          <div key={i} className="flex min-h-14 flex-col gap-1 bg-surface p-1.5 md:min-h-24">
            <Skeleton className="size-5 rounded-full" />
            {i % 5 === 2 && <Skeleton className="hidden h-4 w-full md:block" />}
          </div>
        ))}
      </div>
    </Shell>
  );
}

/** Planning d'un département : en-tête à onglets, sélecteurs, grille à contrôle segmenté. */
export function PlanningGridPageSkeleton() {
  return (
    <Shell label="Chargement du planning…">
      <HeaderSkeleton withTabs />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_2fr]">
        <Skeleton className="h-11 rounded-control" />
        <Skeleton className="h-11 rounded-control" />
      </div>
      <div className="overflow-hidden rounded-card border border-line bg-surface">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="flex items-center justify-between gap-3 border-t border-line px-4 py-3 first:border-t-0">
            <Skeleton className="h-4" style={{ width: `${30 + ((i * 13) % 25)}%` }} />
            <Skeleton className="h-10 w-[172px] rounded-control" />
          </div>
        ))}
      </div>
    </Shell>
  );
}

/** Accueil à cartes (espace Médias, Audio) : en-tête puis cartes. */
export function CardsPageSkeleton({ cards = 3 }: { readonly cards?: number }) {
  return (
    <Shell label="Chargement…">
      <HeaderSkeleton />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: cards }, (_, i) => (
          <Skeleton key={i} className="h-28 rounded-card" />
        ))}
      </div>
    </Shell>
  );
}

/** « Mon planning » : carte « prochain service » puis lignes du mois. */
export function MyPlanningPageSkeleton() {
  return (
    <Shell label="Chargement de mon planning…">
      <HeaderSkeleton />
      <Skeleton className="h-44 w-full rounded-card" />
      <div className="flex items-center justify-between gap-3">
        <Skeleton className="size-11 rounded-control" />
        <Skeleton className="h-5 w-40" />
        <Skeleton className="size-11 rounded-control" />
      </div>
      <SkeletonList rows={4} label={null} />
    </Shell>
  );
}

/** Accueil « Aujourd'hui » : salutation, carte « prochain service », listes et raccourcis. */
export function TodayPageSkeleton() {
  return (
    <Shell label="Chargement de l'accueil…">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-3 w-40" />
        <Skeleton className="h-7 w-56 md:h-8" />
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(300px,380px)]">
        <div className="flex flex-col gap-6">
          <Skeleton className="h-44 w-full rounded-card" />
          <SkeletonList rows={4} label={null} />
        </div>
        <div className="flex flex-col gap-3">
          <SkeletonList rows={2} label={null} />
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-16 rounded-card" />
          ))}
        </div>
      </div>
    </Shell>
  );
}
