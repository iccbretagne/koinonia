import { auth, signOut } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import NoAccessClient from "./NoAccessClient";

export default async function NoAccessPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/");
  }

  if (session.user.isSuperAdmin || session.user.churchRoles.length > 0) {
    redirect("/dashboard");
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
    <div className="min-h-screen bg-surface-sunken flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-surface rounded-lg border border-line p-8">
        <div className="w-16 h-16 bg-brand-soft rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-brand-text" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
        </div>

        <h1 className="text-xl font-bold text-ink mb-1 text-center">Accès en attente</h1>
        <p className="text-sm text-ink-muted text-center mb-6">
          {session.user.name && (
            <span className="font-medium text-ink-muted">{session.user.name} · </span>
          )}
          {session.user.email}
        </p>

        {pendingRequests.length > 0 && (
          <div className="mb-5 flex items-start gap-3 bg-warning-soft border border-warning/30 rounded-lg p-3">
            <svg className="w-5 h-5 text-warning mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-sm text-warning">
              {churches.length === 0
                ? "Votre demande d'accès est en cours de traitement. Un administrateur va l'examiner prochainement."
                : "Une demande est déjà en attente pour certaines de vos églises."}
            </p>
          </div>
        )}

        {accessContent}

        <div className="mt-6 pt-4 border-t border-line text-center">
          <form action={async () => { "use server"; await signOut({ redirectTo: "/" }); }}>
            <button type="submit" className="text-sm text-ink-subtle hover:text-ink-muted transition-colors">
              Se déconnecter
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
