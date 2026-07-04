import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import FreelanceProfileFormClient from "./FreelanceProfileFormClient";

export default async function NewFreelanceProfilePage() {
  const session = await auth();
  if (!session?.user) redirect("/");

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Proposer mes services freelance</h1>
      <FreelanceProfileFormClient defaultEmail={session.user.email ?? ""} />
    </div>
  );
}
