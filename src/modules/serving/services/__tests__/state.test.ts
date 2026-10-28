import { describe, expect, it } from "vitest";
import type { ServingAssignmentStatus } from "@/generated/prisma/client";
import {
  addMonths,
  canTransition,
  needsPvsAction,
  observationEndsAt,
  observationPhase,
  retentionDeadline,
} from "../state";

const d = (iso: string) => new Date(`${iso}T12:00:00.000Z`);

function assignment(status: ServingAssignmentStatus, extra: { resolvedAt?: Date | null; decidedAt?: Date | null } = {}) {
  return { status, resolvedAt: extra.resolvedAt ?? null, decidedAt: extra.decidedAt ?? null };
}

describe("canTransition", () => {
  it("accueille seulement une affectation en attente", () => {
    expect(canTransition("PENDING", "accept")).toBe(true);
    expect(canTransition("OBSERVATION", "accept")).toBe(false);
  });
  it("confirme seulement pendant l'observation", () => {
    expect(canTransition("OBSERVATION", "confirm")).toBe(true);
    expect(canTransition("PENDING", "confirm")).toBe(false);
    expect(canTransition("CONFIRMED", "confirm")).toBe(false);
  });
  it("renvoie avant l'accueil ou pendant l'observation, jamais après confirmation", () => {
    expect(canTransition("PENDING", "send-back")).toBe(true);
    expect(canTransition("OBSERVATION", "send-back")).toBe(true);
    expect(canTransition("CONFIRMED", "send-back")).toBe(false);
    expect(canTransition("SENT_BACK", "send-back")).toBe(false);
  });
});

describe("needsPvsAction", () => {
  const base = { createdAt: d("2026-01-01"), decidedAt: null };
  it("une candidature reçue est à traiter", () => {
    expect(needsPvsAction({ ...base, status: "RECEIVED", assignments: [] })).toBe(true);
  });
  it("une validée avec un renvoi non traité est à traiter", () => {
    expect(needsPvsAction({ ...base, status: "VALIDATED", assignments: [assignment("SENT_BACK")] })).toBe(true);
  });
  it("un renvoi déjà traité ne compte plus", () => {
    expect(
      needsPvsAction({ ...base, status: "VALIDATED", assignments: [assignment("SENT_BACK", { resolvedAt: d("2026-02-01") })] })
    ).toBe(false);
  });
  it("une non retenue n'est jamais à traiter", () => {
    expect(needsPvsAction({ ...base, status: "REJECTED", assignments: [assignment("SENT_BACK")] })).toBe(false);
  });
});

describe("addMonths / observationEndsAt", () => {
  it("31 janvier + 1 mois tombe sur le dernier jour de février", () => {
    expect(addMonths(d("2026-01-31"), 1).toISOString().slice(0, 10)).toBe("2026-02-28");
    expect(addMonths(d("2028-01-31"), 1).toISOString().slice(0, 10)).toBe("2028-02-29");
  });
  it("3 mois d'observation par défaut", () => {
    expect(observationEndsAt(d("2026-03-15"), 3).toISOString().slice(0, 10)).toBe("2026-06-15");
  });
  it("change d'année", () => {
    expect(addMonths(d("2026-11-30"), 3).toISOString().slice(0, 10)).toBe("2027-02-28");
  });
});

describe("observationPhase", () => {
  const end = d("2026-06-15");
  it("en cours plus de 14 jours avant la fin", () => {
    expect(observationPhase(end, d("2026-05-31"))).toBe("running");
  });
  it("fin proche à J-14", () => {
    expect(observationPhase(end, d("2026-06-01"))).toBe("ending-soon");
  });
  it("échue à la date de fin", () => {
    expect(observationPhase(end, end)).toBe("overdue");
    expect(observationPhase(end, d("2026-07-01"))).toBe("overdue");
  });
});

describe("retentionDeadline", () => {
  it("non retenue : à partir de la décision", () => {
    const app = { status: "REJECTED" as const, createdAt: d("2026-01-01"), decidedAt: d("2026-03-01"), assignments: [] };
    expect(retentionDeadline(app, 12)?.toISOString().slice(0, 10)).toBe("2027-03-01");
  });
  it("jamais traitée : à partir de la réception", () => {
    const app = { status: "RECEIVED" as const, createdAt: d("2026-01-10"), decidedAt: null, assignments: [] };
    expect(retentionDeadline(app, 12)?.toISOString().slice(0, 10)).toBe("2027-01-10");
  });
  it("renvoyée par tous ses départements : à partir du dernier renvoi", () => {
    const app = {
      status: "VALIDATED" as const,
      createdAt: d("2026-01-01"),
      decidedAt: d("2026-01-15"),
      assignments: [
        assignment("SENT_BACK", { decidedAt: d("2026-02-01") }),
        assignment("SENT_BACK", { decidedAt: d("2026-04-20") }),
      ],
    };
    expect(retentionDeadline(app, 6)?.toISOString().slice(0, 10)).toBe("2026-10-20");
  });
  it("jamais effacée tant qu'un département la suit", () => {
    const app = {
      status: "VALIDATED" as const,
      createdAt: d("2026-01-01"),
      decidedAt: d("2026-01-15"),
      assignments: [assignment("SENT_BACK", { decidedAt: d("2026-02-01") }), assignment("OBSERVATION")],
    };
    expect(retentionDeadline(app, 12)).toBeNull();
  });
});
