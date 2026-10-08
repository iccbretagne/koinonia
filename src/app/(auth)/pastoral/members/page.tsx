import { requirePastoralActiveChurch } from "../active-church";
import { prisma } from "@/lib/prisma";
import PastoralMembersClient from "./PastoralMembersClient";

export default async function PastoralMembersPage() {
  const { activeChurchId } = await requirePastoralActiveChurch();

  const [churchData, members] = await Promise.all([
    prisma.church.findUnique({
      where: { id: activeChurchId },
      select: { name: true },
    }),
    prisma.member.findMany({
      where: {
        departments: { some: { department: { ministry: { churchId: activeChurchId } } } },
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        departments: {
          where: { isPrimary: true },
          select: { department: { select: { name: true, ministry: { select: { name: true } } } } },
        },
      },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    }),
  ]);

  return (
    <PastoralMembersClient
      members={members}
      churchName={churchData?.name ?? ""}
    />
  );
}
