import pkg from "@/../package.json";
import { redirect } from "next/navigation";
import { cookies, headers } from "next/headers";
import { auth, signOut, getCurrentChurchId } from "@/lib/auth";
import { forgetPushDeviceOnSignOut } from "@/lib/push/sign-out";
import { prisma } from "@/lib/prisma";
import AuthLayoutShell from "@/components/AuthLayoutShell";
import SystemMessageBanner from "@/components/SystemMessageBanner";
import type { RoleKey as TourRoleKey } from "@/lib/tour-steps";
import { landingHref } from "@/lib/navigation";
import { loadNavigationInput, currentPrimaryRole } from "@/lib/navigation-input";
import { registry } from "@/lib/registry";
import { isPastoralView } from "@/lib/view-mode";
import { churchLogoSources } from "@/modules/core/schemas";
import { pickFirstName } from "./accueil/first-name";
import type { Session } from "next-auth";
import { paths } from "@/lib/paths";
import { PATHNAME_HEADER } from "@/lib/request-pathname";
import { enforcePageGate } from "./page-gates";
import type { ChurchRoles } from "@/lib/navigation-input";

/** Églises du sélecteur : celles des rôles, plus celles où l'utilisateur n'a qu'un profil pastoral. */
async function switcherChurches(churchRoles: ChurchRoles, pastoralChurchIds: string[]) {
  const churchMap = new Map(
    churchRoles.map((r) => [r.churchId, { id: r.churchId, name: r.church.name }])
  );
  const pastoralOnlyIds = pastoralChurchIds.filter((id) => !churchMap.has(id));
  if (pastoralOnlyIds.length > 0) {
    const pastoralChurchData = await prisma.church.findMany({
      where: { id: { in: pastoralOnlyIds } },
      select: { id: true, name: true },
    });
    for (const c of pastoralChurchData) churchMap.set(c.id, c);
  }
  return Array.from(churchMap.values());
}

/** Nom, couleur et logo (spec 072, versions seulement) de l'église courante, pour l'en-tête. */
async function churchDisplay(currentChurchId: string | null | undefined) {
  const currentChurchDb = currentChurchId
    ? await prisma.church.findUnique({
        where: { id: currentChurchId },
        select: { name: true, primaryColor: true, logos: { select: { variant: true, version: true } } },
      })
    : null;
  return {
    churchName: currentChurchDb?.name ?? "Église",
    churchPrimaryColor: currentChurchDb?.primaryColor ?? "#5E17EB",
    churchLogo: currentChurchId && currentChurchDb ? churchLogoSources(currentChurchId, currentChurchDb.logos) : null,
  };
}

/**
 * Bouton d'aide (spec 075) : assistant actif pour l'église courante (module, instance, église)
 * et personnage choisi par le compte (Nia par défaut). Un échec de lecture laisse le lien vers le
 * guide, sans jamais casser la page.
 */
async function assistantShell(session: Session, currentChurchId: string | null | undefined) {
  const firstName = pickFirstName(session.user.displayName ?? session.user.name);
  if (!registry.has("assistant")) return { enabled: false, persona: "NIA" as const, firstName };
  try {
    const { isAssistantEnabled } = await import("@/modules/assistant");
    const [enabled, user] = await Promise.all([
      isAssistantEnabled(currentChurchId),
      prisma.user.findUnique({ where: { id: session.user.id! }, select: { assistantPersona: true } }),
    ]);
    return { enabled, persona: user?.assistantPersona ?? ("NIA" as const), firstName };
  } catch {
    return { enabled: false, persona: "NIA" as const, firstName };
  }
}

async function signOutAction() {
  "use server";
  await forgetPushDeviceOnSignOut();
  await signOut({ redirectTo: "/" });
}

export default async function AuthLayout({
  children,
}: {
  readonly children: React.ReactNode;
}) {
  const session = await auth();

  if (!session?.user) {
    redirect("/");
  }

  const churchRoles = session.user.churchRoles;
  const pastoralChurchIds = session.user.pastoralChurchIds ?? [];

  const hasPastoralProfile = pastoralChurchIds.length > 0;

  if (!session.user.isSuperAdmin && churchRoles.length === 0 && !hasPastoralProfile) {
    redirect("/no-access");
  }

  const currentChurchId = await getCurrentChurchId(session);

  // isPastoral : l'utilisateur a un profil pastoral dans l'église courante
  const isPastoral = currentChurchId
    ? pastoralChurchIds.includes(currentChurchId)
    : hasPastoralProfile;

  // Mode d'affichage : cookie pour persister le choix entre vue pastorale et vue admin
  const cookieStore = await cookies();
  const viewModeCookie = cookieStore.get("koinonia-view-mode")?.value;
  const hasClassicRole = churchRoles.some((r) => r.churchId === currentChurchId);
  const isInPastoralMode = isPastoralView({ isPastoral, hasClassicRole, viewModeCookie });
  // Double rôle dans l'église courante : profil pastoral + au moins un rôle classique
  const hasBothRoles = isPastoral && hasClassicRole;

  // Vrai 403 (avant le premier `loading.tsx`, donc avant que le statut parte) : la garde de la
  // page demandée, rejouée ici pour les adresses de `page-gates.ts`.
  await enforcePageGate((await headers()).get(PATHNAME_HEADER), {
    churchId: currentChurchId ?? null,
    pastoralView: isInPastoralMode,
  });

  const { churchName, churchPrimaryColor, churchLogo } = await churchDisplay(currentChurchId);

  const churches = await switcherChurches(churchRoles, pastoralChurchIds);
  // Navigation de l'église courante (spec 092, lot 1) : calculée dans `src/lib/navigation-input.ts`.
  const { nav, canAccessDashboard, hasStarPlanning, hasAnyNavigation } = await loadNavigationInput(
    session,
    currentChurchId,
    isPastoral
  );

  const footerContent = (
    <footer className="px-4 py-4 text-center text-xs text-ink-subtle print:hidden">
      <span className="inline-flex items-center gap-1">
        <a
          href="https://github.com/iccbretagne/koinonia"
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-chip transition-colors hover:text-ink-muted"
        >
          Koinonia
        </a>
        {/*
          En production, `package.json` porte la version du tag deploye : elle suffit.
          En recette on deploie une branche quelconque, dont le `package.json` reste fige
          sur la derniere version publiee — le footer afficherait donc une version qui
          n'est pas celle qu'on teste. `NEXT_PUBLIC_BUILD_VERSION` (inline au build par
          deploy-staging.yml, forme `1.18.0-abc1234`) prend alors le relais.
        */}
        <span className="tabular-nums">v{process.env.NEXT_PUBLIC_BUILD_VERSION ?? pkg.version}</span>
      </span>
    </footer>
  );

  // Actions de bascule déclarées APRÈS canAccessDashboard/hasStarPlanning : une server action
  // inline est extraite du composant et ne reçoit que les variables liées à l'endroit où elle
  // est définie — déclarées avant elles, leur exécution échouait (ReferenceError en recette).
  async function switchToAdminMode() {
    "use server";
    (await cookies()).set("koinonia-view-mode", "admin", { path: "/", maxAge: 2592000 });
    // Même accueil que l'entrée « Accueil » de la navigation (landingHref) plutôt que
    // "/dashboard" en dur : sur une instance qui désactive le module planning, ou pour un
    // rôle sans planning:department (spec 031/#462), ce dernier mènerait à un 404/FORBIDDEN.
    redirect(landingHref({ isPastoral: false, hasPlanningAccess: canAccessDashboard, hasStarPlanning }));
  }
  async function switchToPastoralMode() {
    "use server";
    (await cookies()).set("koinonia-view-mode", "pastoral", { path: "/", maxAge: 2592000 });
    redirect(paths.accueil());
  }
  // Rôle principal dans l'église courante (spec 092) : priorité fixe, présentation seule
  // (barre du bas, visite guidée) — aucun droit n'en dépend.
  const currentRole = currentPrimaryRole(session, currentChurchId);

  // Spec 038 (CA10) : un utilisateur dont TOUS les rôles ne portent que sur des modules
  // désactivés conserve `churchRoles.length > 0` ; le critère réel est « aucune entrée de
  // navigation disponible » (`hasAnyNavigation`), même parcours « aucun accès ».
  if (!hasAnyNavigation) {
    redirect("/no-access");
  }

  const assistant = await assistantShell(session, currentChurchId);

  // Messages système en cours (spec 071) : un échec de lecture ne doit jamais casser la page.
  const bannerMessages = registry.has("messages")
    ? await import("@/modules/messages")
        .then(({ getActiveBannerMessages, messageViewerFromSession }) =>
          getActiveBannerMessages(messageViewerFromSession(session))
        )
        .catch(() => [])
    : [];

  return (
    <AuthLayoutShell
      {...nav}
      isPastoral={isInPastoralMode}
      homeHref={landingHref({ isPastoral: isInPastoralMode, hasPlanningAccess: nav.hasPlanningAccess === true, hasStarPlanning })}
      userRole={currentRole as TourRoleKey}
      user={{ name: session.user.name ?? null, email: session.user.email ?? null, image: session.user.image ?? null }}
      churches={churches}
      currentChurchId={currentChurchId ?? null}
      churchName={churchName}
      headerColor={churchPrimaryColor}
      churchLogo={churchLogo}
      hasBothRoles={hasBothRoles}
      switchViewAction={isInPastoralMode ? switchToAdminMode : switchToPastoralMode}
      signOutAction={signOutAction}
      footer={footerContent}
      banner={bannerMessages.length > 0 ? <SystemMessageBanner messages={bannerMessages} /> : undefined}
      assistant={assistant}
    >
      {children}
    </AuthLayoutShell>
  );
}
