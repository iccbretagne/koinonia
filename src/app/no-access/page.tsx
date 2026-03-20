import { auth, signOut } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
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

  // Vérifier si une demande est déjà en attente
  const pendingRequest = await prisma.memberLinkRequest.findFirst({
    where: { userId: session.user.id, status: "PENDING" },
  });

  const churches = await prisma.church.findMany({
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-lg border-2 border-gray-200 p-8">
        <div className="w-16 h-16 bg-icc-violet/10 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-icc-violet" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
        </div>

        <h1 className="text-xl font-bold text-gray-900 mb-1 text-center">Accès en attente</h1>
        <p className="text-sm text-gray-500 text-center mb-6">
          {session.user.name && (
            <span className="font-medium text-gray-700">{session.user.name} · </span>
          )}
          {session.user.email}
        </p>

        {pendingRequest ? (
          <div className="text-center">
            <div className="w-12 h-12 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <svg className="w-6 h-6 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <p className="text-gray-600 text-sm">
              Votre demande d&apos;accès est <strong>en cours de traitement</strong>. Un administrateur va l&apos;examiner prochainement.
            </p>
          </div>
        ) : (
          <NoAccessClient churches={churches} />
        )}

        <div className="mt-6 pt-4 border-t border-gray-100 text-center">
          <form action={async () => { "use server"; await signOut({ redirectTo: "/" }); }}>
            <button type="submit" className="text-sm text-gray-400 hover:text-gray-600 transition-colors">
              Se déconnecter
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
