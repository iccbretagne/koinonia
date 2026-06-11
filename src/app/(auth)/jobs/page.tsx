import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import Link from "next/link";
import JobsListClient from "./JobsListClient";

export default async function JobsPage() {
  const session = await auth();
  if (!session?.user) redirect("/");

  const now = new Date();

  const jobs = await prisma.jobOffer.findMany({
    where: {
      status: "PUBLISHED",
      OR: [{ deadline: null }, { deadline: { gte: now } }],
    },
    include: {
      author: { select: { id: true, name: true, displayName: true, image: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const serialized = jobs.map((j) => ({
    ...j,
    deadline:  j.deadline  ? j.deadline.toISOString()  : null,
    createdAt: j.createdAt.toISOString(),
  }));

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Emploi</h1>
          <p className="text-sm text-gray-500 mt-1">Offres d&apos;emploi, stages et alternances de la communauté</p>
        </div>
        <Link
          href="/jobs/new"
          className="px-4 py-2 bg-icc-violet text-white text-sm font-semibold rounded-lg hover:bg-icc-violet/90 transition-colors"
        >
          Publier une offre
        </Link>
      </div>

      <JobsListClient jobs={serialized} currentUserId={session.user.id!} nowMs={now.getTime()} />
    </div>
  );
}
