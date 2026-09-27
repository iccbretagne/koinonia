import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { excludeChurchesAlreadyReached } from "@/lib/onboarding";
import Link from "next/link";
import ProfileClient from "./ProfileClient";
import ThemeSelector from "@/components/ThemeSelector";
import Alert from "@/components/ui/Alert";
import PageHeader from "@/components/ui/PageHeader";
import StatusChip from "@/components/ui/StatusChip";
import { Bell, ChevronRight, Clock, Link2 } from "lucide-react";

/** Section de la page profil : titre `title-md` puis contenu sur une carte. */
function ProfileSection({
  title,
  description,
  children,
}: {
  readonly title: string;
  readonly description?: React.ReactNode;
  readonly children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="font-display text-[17px] font-semibold leading-6 text-ink">{title}</h2>
        {description && <p className="text-[13px] leading-[18px] text-ink-muted">{description}</p>}
      </div>
      <div className="rounded-card border border-line bg-surface p-4 shadow-card sm:p-5">{children}</div>
    </section>
  );
}

export default async function ProfilePage() {
  const session = await auth();
  if (!session?.user) redirect("/");

  // Liens STAR existants
  const links = await prisma.memberUserLink.findMany({
    where: { userId: session.user.id },
    include: {
      member: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          departments: {
            where: { isPrimary: true },
            include: { department: { select: { name: true, ministry: { select: { name: true } } } } },
          },
        },
      },
      church: { select: { id: true, name: true } },
    },
  });

  // Demandes en attente
  const pendingRequests = await prisma.memberLinkRequest.findMany({
    where: { userId: session.user.id, status: "PENDING" },
    include: { church: { select: { id: true, name: true } } },
  });

  // Demandes rejetées récentes (dernière en date par église)
  const rejectedRequests = await prisma.memberLinkRequest.findMany({
    where: { userId: session.user.id, status: "REJECTED" },
    include: { church: { select: { id: true, name: true } } },
    orderBy: { reviewedAt: "desc" },
  });

  // Églises proposables pour une nouvelle demande : ni déjà liée, ni déjà un rôle, ni demande
  // en attente. Toutes les églises de la plateforme sont éligibles — pas seulement celles où
  // l'utilisateur a déjà un rôle (spec 037 : rejoindre une église où l'on n'a encore aucun pied
  // doit être possible, avec le même parcours que /no-access pour un utilisateur sans église).
  const reachedChurchIds = [
    ...links.map((l) => l.church.id),
    ...pendingRequests.map((r) => r.church.id),
    ...session.user.churchRoles.map((r) => r.churchId),
  ];

  const allChurches = await prisma.church.findMany({
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  const unlinkableChurches = excludeChurchesAlreadyReached(allChurches, reachedChurchIds);

  const ministries = await prisma.ministry.findMany({
    where: { isSystem: false },
    select: {
      id: true,
      name: true,
      churchId: true,
      departments: {
        where: { isSystem: false },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      },
    },
    orderBy: { name: "asc" },
  });

  const displayName = session.user.displayName ?? session.user.name ?? session.user.email ?? "";
  const initials = displayName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <PageHeader title="Mon profil" />

      <ProfileSection title="Compte">
        <div className="flex items-center gap-4">
          {session.user.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={session.user.image} alt="" className="size-14 shrink-0 rounded-full" />
          ) : (
            <span aria-hidden="true" className="grid size-14 shrink-0 place-items-center rounded-full bg-brand-soft font-display text-lg font-bold text-brand-text">
              {initials}
            </span>
          )}
          <div className="min-w-0">
            <p className="truncate text-[17px] font-semibold leading-6 text-ink">{displayName}</p>
            {session.user.displayName && session.user.name && session.user.displayName !== session.user.name && (
              <p className="truncate text-[13px] leading-[18px] text-ink-muted">Compte Google : {session.user.name}</p>
            )}
            <p className="truncate text-[13px] leading-[18px] text-ink-muted">{session.user.email}</p>
          </div>
        </div>
        <Link
          href="/profile/notifications"
          className="-mx-2 mt-4 flex min-h-11 items-center gap-3 rounded-control border-t border-line px-2 pt-3 text-[15px] font-semibold text-ink transition-colors hover:bg-surface-sunken focus-visible:outline-2 focus-visible:outline-focus"
        >
          <Bell aria-hidden="true" className="size-5 text-ink-subtle" strokeWidth={1.75} />
          <span className="flex-1">Mes notifications</span>
          <ChevronRight aria-hidden="true" className="size-4 text-ink-subtle" strokeWidth={1.75} />
        </Link>
      </ProfileSection>

      {/* Apparence (spec 055) — préférence stockée dans le navigateur */}
      <ProfileSection
        title="Apparence"
        description="Le thème « Système » suit le réglage de votre téléphone ou de votre ordinateur."
      >
        <ThemeSelector />
      </ProfileSection>

      <ProfileSection title="Fiche STAR liée">
        {links.length === 0 && pendingRequests.length === 0 ? (
          <div className="flex items-center gap-3 text-[15px] text-ink-muted">
            <Link2 aria-hidden="true" className="size-5 shrink-0 text-ink-subtle" strokeWidth={1.75} />
            Aucune fiche STAR n&apos;est liée à votre compte.
          </div>
        ) : (
          <ul className="-my-2 divide-y divide-line">
            {links.map((l) => (
              <li key={l.id} className="flex items-start justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="text-[15px] font-semibold leading-[22px] text-ink">
                    {l.member.firstName} {l.member.lastName}
                  </p>
                  <p className="text-[13px] leading-[18px] text-ink-muted">
                    {l.member.departments[0]?.department.ministry.name} / {l.member.departments[0]?.department.name}
                  </p>
                  {l.member.departments[0]?.department.name === "Sans département" && (
                    <Alert tone="warning" className="mt-2">
                      Profil incomplet : contactez un administrateur pour être rattaché à un département.
                    </Alert>
                  )}
                </div>
                <span className="shrink-0 text-[13px] text-ink-muted">{l.church.name}</span>
              </li>
            ))}
            {pendingRequests.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 py-3">
                <StatusChip tone="warning" icon={Clock}>Demande en cours de traitement</StatusChip>
                <span className="shrink-0 text-[13px] text-ink-muted">{r.church.name}</span>
              </li>
            ))}
          </ul>
        )}
      </ProfileSection>

      {rejectedRequests.length > 0 && (
        <ProfileSection title="Demandes refusées">
          <ul className="-my-2 divide-y divide-line">
            {rejectedRequests.map((r) => (
              <li key={r.id} className="py-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[15px] font-semibold text-ink">{r.church.name}</span>
                  <span className="text-[13px] text-ink-muted">
                    {r.reviewedAt ? new Date(r.reviewedAt).toLocaleDateString("fr-FR") : ""}
                  </span>
                </div>
                {r.rejectReason && <p className="mt-1 text-[13px] text-ink-muted">Motif : {r.rejectReason}</p>}
              </li>
            ))}
          </ul>
        </ProfileSection>
      )}

      {unlinkableChurches.length > 0 && (
        <ProfileClient churches={unlinkableChurches} ministries={ministries} />
      )}
    </div>
  );
}
