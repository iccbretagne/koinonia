import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import JobFormClient from "./JobFormClient";

export default async function NewJobPage() {
  const session = await auth();
  if (!session?.user) redirect("/");

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Publier une offre</h1>
      <JobFormClient />
    </div>
  );
}
