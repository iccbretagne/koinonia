import { auth, signOut } from "@/lib/auth";
import { forgetPushDeviceOnSignOut } from "@/lib/push/sign-out";
import { prisma } from "@/lib/prisma";
import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { Clock, LockKeyhole } from "lucide-react";
import Alert from "@/components/ui/Alert";
import { buttonClasses } from "@/components/ui/button-classes";
import NoAccessClient from "./NoAccessClient";
import { paths } from "@/lib/paths";

export default async function NoAccessPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/");
  }

  if (session.user.isSuperAdmin || session.user.churchRoles.length > 0) {
    redirect(paths.dashboard());
  }

  const allChurches = await prisma.church.findMany({
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  // Demandes en attente par église — scoped pour ne pas bloquer les autres églises
  const pendingRequests = await prisma.memberLinkRequest.findMany({
    where: { userId: session.user.id, status: "PENDING" },
    select: { churchId: true },
  });
  const pendingChurchIds = new Set(pendingRequests.map((r) => r.churchId));

  // Églises disponibles = toutes les églises sans demande en attente
  const churches = allChurches.filter((c) => !pendingChurchIds.has(c.id));

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

  let accessContent: ReactNode = null;
  if (churches.length > 0) {
    accessContent = (
        <NoAccessClient
          churches={churches}
          ministries={ministries.map((m) => ({
            id: m.id,
            name: m.name,
            churchId: m.churchId,
            departments: m.departments,
          }))}
        />
    );
  } else if (pendingRequests.length === 0) {
    accessContent = <p className="text-sm text-ink-subtle text-center">Aucune église disponible.</p>;
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg p-4">
      <div className="w-full max-w-md rounded-card border border-line bg-surface p-8 shadow-card">
        <div className="w-16 h-16 bg-brand-soft rounded-full flex items-center justify-center mx-auto mb-4">
          <LockKeyhole aria-hidden="true" className="size-8 text-brand-text" strokeWidth={1.75} />
        </div>

        <h1 className="mb-1 text-center font-display text-[22px] font-bold leading-7 text-ink">Accès en attente</h1>
        <p className="text-sm text-ink-muted text-center mb-6">
          {session.user.name && (
            <span className="font-medium text-ink-muted">{session.user.name} · </span>
          )}
          {session.user.email}
        </p>

        {pendingRequests.length > 0 && (
          <Alert tone="warning" icon={Clock} className="mb-5">
            {churches.length === 0
              ? "Votre demande d'accès est en cours de traitement. Un administrateur va l'examiner prochainement."
              : "Une demande est déjà en attente pour certaines de vos églises."}
          </Alert>
        )}

        {accessContent}

        <div className="mt-6 pt-4 border-t border-line text-center">
          <form action={async () => { "use server"; await forgetPushDeviceOnSignOut(); await signOut({ redirectTo: "/" }); }}>
            <button type="submit" className={buttonClasses("ghost", "sm")}>
              Se déconnecter
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
