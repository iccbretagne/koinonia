import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Suspense } from "react";
import JobsListClient from "./JobsListClient";
import SeekersListClient from "./SeekersListClient";
import JobsTabBar from "./JobsTabBar";

export default async function JobsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/");

  const { tab } = await searchParams;
  const activeTab = tab === "seekers" ? "seekers" : "offers";

  const now = new Date();

  const [jobs, seekers] = await Promise.all([
    prisma.jobOffer.findMany({
      where: {
        status: "PUBLISHED",
        OR: [{ deadline: null }, { deadline: { gte: now } }],
      },
      include: {
        author: { select: { id: true, name: true, displayName: true, image: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.jobSeeker.findMany({
      where: { status: "ACTIVE" },
      include: {
        author: { select: { id: true, name: true, displayName: true, image: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const serializedJobs = jobs.map((j) => ({
    ...j,
    deadline:  j.deadline  ? j.deadline.toISOString()  : null,
    createdAt: j.createdAt.toISOString(),
  }));

  const serializedSeekers = seekers.map((s) => ({
    ...s,
    availableFrom: s.availableFrom ? s.availableFrom.toISOString() : null,
    createdAt:     s.createdAt.toISOString(),
  }));

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Emploi</h1>
          <p className="text-sm text-gray-500 mt-1">
            {activeTab === "offers"
              ? "Offres d’emploi, stages et alternances de la communauté"
              : "Membres de la communauté en recherche d’emploi"}
          </p>
        </div>
        {activeTab === "offers" ? (
          <Link
            href="/jobs/new"
            className="px-4 py-2 bg-icc-violet text-white text-sm font-semibold rounded-lg hover:bg-icc-violet/90 transition-colors"
          >
            Publier une offre
          </Link>
        ) : (
          <Link
            href="/jobs/seekers/new"
            className="px-4 py-2 bg-icc-violet text-white text-sm font-semibold rounded-lg hover:bg-icc-violet/90 transition-colors"
          >
            Publier mon profil
          </Link>
        )}
      </div>

      <Suspense>
        <JobsTabBar offersCount={serializedJobs.length} seekersCount={serializedSeekers.length} />
      </Suspense>

      {activeTab === "offers" ? (
        <JobsListClient
          jobs={serializedJobs}
          currentUserId={session.user.id!}
          nowMs={now.getTime()}
        />
      ) : (
        <SeekersListClient
          seekers={serializedSeekers}
          currentUserId={session.user.id!}
        />
      )}
    </div>
  );
}
