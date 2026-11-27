import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader, buttonClasses } from "@/components/ui";
import SeekerFormClient from "./SeekerFormClient";

export default async function NewSeekerPage() {
  const session = await auth();
  if (!session?.user) redirect("/");

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <Link href="/jobs?tab=profils" className={`${buttonClasses("ghost", "sm")} min-h-11 self-start sm:min-h-9`}>
        <ArrowLeft className="size-4" aria-hidden="true" /> Retour aux profils
      </Link>
      <PageHeader title="Publier mon profil de recherche" description="Faites-vous connaître de la communauté pour trouver votre prochain emploi." />
      <SeekerFormClient defaultEmail={session.user.email ?? null} />
    </div>
  );
}
