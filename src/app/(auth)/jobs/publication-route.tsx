import Link from "next/link";
import { redirect } from "next/navigation";
import { SearchX } from "lucide-react";
import { auth } from "@/lib/auth";
import EmptyState from "@/components/ui/EmptyState";
import { buttonClasses } from "@/components/ui/button-classes";
import { loadPublication, type PublicationKind } from "@/modules/jobs";
import PublicationPage from "./PublicationPage";

/** Rendu serveur commun aux quatre pages de détail de l'espace Offres (spec 064). */
export async function renderPublicationRoute(kind: PublicationKind, id: string) {
  const session = await auth();
  if (!session?.user) redirect("/");

  const now = new Date();
  const result = await loadPublication(session, kind, id, { now });
  if (!result) {
    return (
      <EmptyState
        icon={SearchX}
        title="Cette publication n'est plus disponible"
        description="Elle a peut-être été pourvue, retirée ou supprimée."
        action={
          <Link href="/jobs" className={buttonClasses("secondary")}>
            Voir les offres
          </Link>
        }
      />
    );
  }
  return <PublicationPage publication={result.publication} canManage={result.canManage} nowMs={now.getTime()} />;
}
