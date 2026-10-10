import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import SeekerFormClient from "./SeekerFormClient";

export default async function NewSeekerPage() {
  const session = await auth();
  if (!session?.user) redirect("/");

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center gap-2 mb-4">
        <Link href="/jobs?tab=profils" className="text-sm text-ink-subtle hover:text-ink-muted">
          ← Retour
        </Link>
      </div>
      <h1 className="text-2xl font-bold text-ink mb-1">Publier mon profil de recherche</h1>
      <p className="text-sm text-ink-muted mb-6">Faites-vous connaître de la communauté pour trouver votre prochain emploi.</p>
      <SeekerFormClient defaultEmail={session.user.email ?? null} />
    </div>
  );
}
