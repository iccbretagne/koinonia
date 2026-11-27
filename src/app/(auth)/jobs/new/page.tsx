import { auth } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { redirect } from "next/navigation";
import JobFormClient from "./JobFormClient";

export default async function NewJobPage() {
  const session = await auth();
  if (!session?.user) redirect("/");

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <PageHeader title="Publier une offre" />
      <JobFormClient />
    </div>
  );
}
