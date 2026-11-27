import { auth } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { redirect } from "next/navigation";
import FreelanceProfileFormClient from "./FreelanceProfileFormClient";

export default async function NewFreelanceProfilePage() {
  const session = await auth();
  if (!session?.user) redirect("/");

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <PageHeader title="Proposer mes services freelance" />
      <FreelanceProfileFormClient defaultEmail={session.user.email ?? ""} />
    </div>
  );
}
