import { redirect } from "next/navigation";
import { requireAuth } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { listDomains } from "@/modules/ticketing";
import SiteDomainsClient from "./SiteDomainsClient";

/** Domaines dédiés des sites d'événement (spec 084) : approbation réservée au Super Admin. */
export default async function SiteDomainsPage() {
  const session = await requireAuth();
  if (!session.user.isSuperAdmin) redirect("/admin");
  return (
    <div className="flex flex-col gap-6">
      <PageHeader eyebrow="Administration · Plateforme" title="Domaines des sites d'événement" description="Un domaine dédié est servi après vérification DNS par l'organisateur puis approbation ici. Un contrôle quotidien suspend le domaine dont le DNS ne répond plus." />
      <SiteDomainsClient domains={await listDomains()} />
    </div>
  );
}
