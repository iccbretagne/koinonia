import { ApiError } from "@/lib/api-utils";
import type { RentalInput } from "../schemas";
import { fromIsoDate, toIsoDate } from "./ledger-read";

/** Locations de véhicule de la navette (spec 073), ouvertes à l'équipe et à la compta. */

async function db() {
  return (await import("@/lib/prisma")).prisma;
}

function serialize(r: { id: string; vendor: string; vehicle: string | null; startDate: Date; endDate: Date | null }) {
  return { id: r.id, vendor: r.vendor, vehicle: r.vehicle, startDate: toIsoDate(r.startDate), endDate: r.endDate ? toIsoDate(r.endDate) : null };
}

export async function listRentals(churchId: string) {
  const prisma = await db();
  const rows = await prisma.shuttleRental.findMany({ where: { churchId }, orderBy: { startDate: "desc" }, take: 200 });
  return rows.map(serialize);
}

export async function createRental(churchId: string, input: RentalInput, actorId: string) {
  const prisma = await db();
  const rental = await prisma.shuttleRental.create({
    data: {
      churchId,
      vendor: input.vendor,
      vehicle: input.vehicle,
      startDate: fromIsoDate(input.startDate),
      endDate: input.endDate ? fromIsoDate(input.endDate) : null,
      createdById: actorId,
    },
  });
  const { logAudit } = await import("@/lib/audit");
  await logAudit({ userId: actorId, churchId, action: "CREATE", entityType: "ShuttleRental", entityId: rental.id, details: { after: serialize(rental) } });
  return serialize(rental);
}

export async function getRentalChurchId(rentalId: string): Promise<string | null> {
  const prisma = await db();
  const rental = await prisma.shuttleRental.findUnique({ where: { id: rentalId }, select: { churchId: true } });
  return rental?.churchId ?? null;
}

export async function updateRental(rentalId: string, input: RentalInput, actorId: string) {
  const prisma = await db();
  const existing = await prisma.shuttleRental.findUnique({ where: { id: rentalId } });
  if (!existing) throw new ApiError(404, "Location introuvable");
  const rental = await prisma.shuttleRental.update({
    where: { id: rentalId },
    data: {
      vendor: input.vendor,
      vehicle: input.vehicle,
      startDate: fromIsoDate(input.startDate),
      endDate: input.endDate ? fromIsoDate(input.endDate) : null,
    },
  });
  const { logAudit } = await import("@/lib/audit");
  await logAudit({
    userId: actorId,
    churchId: existing.churchId,
    action: "UPDATE",
    entityType: "ShuttleRental",
    entityId: rental.id,
    details: { before: serialize(existing), after: serialize(rental) },
  });
  return serialize(rental);
}
