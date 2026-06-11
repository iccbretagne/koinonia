import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { rolePermissions } from "@/lib/registry";
import AdminJobsClient from "./AdminJobsClient";

export default async function AdminJobsPage() {
  const session = await auth();
  if (!session?.user) redirect("/");

  const userRoles   = session.user.churchRoles.map((r) => r.role);
  const permissions = new Set(userRoles.flatMap((r) => rolePermissions[r] ?? []));
  if (!session.user.isSuperAdmin && !permissions.has("jobs:manage")) redirect("/jobs");

  const jobs = await prisma.jobOffer.findMany({
    include: {
      author: { select: { id: true, name: true, displayName: true, image: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Modération — Emploi</h1>
      <p className="text-sm text-gray-500 mb-6">Gérez les offres publiées par les membres de la communauté.</p>
      <AdminJobsClient jobs={jobs.map((j) => ({
        ...j,
        deadline:  j.deadline  ? j.deadline.toISOString()  : null,
        createdAt: j.createdAt.toISOString(),
        updatedAt: j.updatedAt.toISOString(),
      }))} />
    </div>
  );
}
