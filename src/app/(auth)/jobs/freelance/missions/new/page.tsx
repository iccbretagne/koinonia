import { auth } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { redirect } from "next/navigation";
import MissionFormClient from "./MissionFormClient";

export default async function NewMissionPage() {
  const session = await auth();
  if (!session?.user) redirect("/");

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <PageHeader title="Proposer une mission freelance" />
      <MissionFormClient defaultEmail={session.user.email ?? ""} />
    </div>
  );
}
