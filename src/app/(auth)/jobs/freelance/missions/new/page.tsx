import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import MissionFormClient from "./MissionFormClient";

export default async function NewMissionPage() {
  const session = await auth();
  if (!session?.user) redirect("/");

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Proposer une mission freelance</h1>
      <MissionFormClient defaultEmail={session.user.email ?? ""} />
    </div>
  );
}
