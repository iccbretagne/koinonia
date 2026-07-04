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

  const [jobs, seekers, freelanceMissions, freelanceProfiles] = await Promise.all([
    prisma.jobOffer.findMany({
      include: {
        author: { select: { id: true, name: true, displayName: true, image: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.jobSeeker.findMany({
      include: {
        author: { select: { id: true, name: true, displayName: true, image: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.freelanceMission.findMany({
      include: {
        author: { select: { id: true, name: true, displayName: true, image: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.freelanceProfile.findMany({
      include: {
        author: { select: { id: true, name: true, displayName: true, image: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Modération — Emploi</h1>
      <p className="text-sm text-gray-500 mb-6">Gérez les offres, profils de recherche et missions freelance de la communauté.</p>
      <AdminJobsClient
        jobs={jobs.map((j) => ({
          ...j,
          deadline:  j.deadline  ? j.deadline.toISOString()  : null,
          createdAt: j.createdAt.toISOString(),
          updatedAt: j.updatedAt.toISOString(),
        }))}
        seekers={seekers.map((s) => ({
          ...s,
          availableFrom: s.availableFrom ? s.availableFrom.toISOString() : null,
          createdAt:     s.createdAt.toISOString(),
          updatedAt:     s.updatedAt.toISOString(),
        }))}
        freelanceMissions={freelanceMissions.map((m) => ({
          ...m,
          createdAt: m.createdAt.toISOString(),
          updatedAt: m.updatedAt.toISOString(),
        }))}
        freelanceProfiles={freelanceProfiles.map((p) => ({
          ...p,
          availableFrom: p.availableFrom ? p.availableFrom.toISOString() : null,
          createdAt:     p.createdAt.toISOString(),
          updatedAt:     p.updatedAt.toISOString(),
        }))}
      />
    </div>
  );
}
