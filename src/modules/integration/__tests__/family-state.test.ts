import { describe, it, expect } from "vitest";
import {
  computeFamilyTransitionData,
  computeReopenData,
  assertNoStaleAssignment,
  statusBeforeAbandon,
  contactConsentSchema,
  initialRequestStatusData,
  familyPatchSchema,
  ABANDON_REASON_CODES,
  ABANDON_REASON_LABELS,
  type FamilyRequestState,
  type FamilyActor,
} from "../services/family-state";
import type { FamilyIntegrationStatus } from "@/generated/prisma/client";

const now = new Date("2026-09-23T10:00:00Z");

const TEAM: FamilyActor = { isIntegrationMember: true, isAssignedBerger: false };
const BERGER: FamilyActor = { isIntegrationMember: false, isAssignedBerger: true };
const STRANGER: FamilyActor = { isIntegrationMember: false, isAssignedBerger: false };

function state(status: FamilyIntegrationStatus, overrides: Partial<FamilyRequestState> = {}): FamilyRequestState {
  const assigned = !["SUBMITTED", "WAITING_RECONTACT", "WAITING_MISSION"].includes(status);
  return {
    status,
    waitingFrom: null,
    assignedFamilyId: assigned ? 12 : null,
    assignedBergerId: assigned ? "berger-1" : null,
    ...overrides,
  };
}

const ALL_STATUSES: FamilyIntegrationStatus[] = [
  "SUBMITTED", "WAITING_RECONTACT", "WAITING_MISSION", "ASSIGNED",
  "CONTACTED", "WHATSAPP_ADDED", "INTEGRATED", "ABANDONED",
];

describe("computeFamilyTransitionData — parcours existant (non-régression)", () => {
  it.each([
    ["contact", "ASSIGNED", "CONTACTED", "contactedAt"],
    ["whatsapp", "CONTACTED", "WHATSAPP_ADDED", "whatsappAddedAt"],
    ["integrate", "WHATSAPP_ADDED", "INTEGRATED", "integratedAt"],
  ] as const)("%s : %s → %s", (action, from, to, tsField) => {
    const { data } = computeFamilyTransitionData(state(from), { action }, BERGER, now);
    expect(data).toEqual({ status: to, [tsField]: now });
  });

  it.each([
    ["contact", "SUBMITTED"],
    ["whatsapp", "ASSIGNED"],
    ["integrate", "CONTACTED"],
  ] as const)("%s refusé depuis %s", (action, from) => {
    expect(() => computeFamilyTransitionData(state(from), { action }, TEAM, now)).toThrow(/Transition invalide/);
  });

  it("assign depuis SUBMITTED affecte famille et berger et notifie le berger", () => {
    const r = computeFamilyTransitionData(
      state("SUBMITTED"),
      { action: "assign", assignedFamilyId: 3, assignedFamilyName: "F3", assignedBergerId: "b3" },
      TEAM,
      now
    );
    expect(r.data).toMatchObject({ status: "ASSIGNED", assignedFamilyId: 3, assignedBergerId: "b3", assignedAt: now });
    expect(r.notifyAssignedBergerId).toBe("b3");
    expect(r.notifyUnassignedBergerId).toBeNull();
  });

  it("assign est réservé à l'équipe intégration", () => {
    expect(() =>
      computeFamilyTransitionData(
        state("SUBMITTED"),
        { action: "assign", assignedFamilyId: 3, assignedFamilyName: "F3", assignedBergerId: "b3" },
        BERGER,
        now
      )
    ).toThrow(/réservée aux membres de l'équipe intégration/);
  });

  it("réaffectation à un autre berger : l'ancien berger est informé de son dessaisissement", () => {
    const r = computeFamilyTransitionData(
      state("ASSIGNED"),
      { action: "assign", assignedFamilyId: 4, assignedFamilyName: "F4", assignedBergerId: "b4" },
      TEAM,
      now
    );
    expect(r.notifyUnassignedBergerId).toBe("berger-1");
    expect(r.notifyAssignedBergerId).toBe("b4");
  });

  it("réaffectation au même berger : personne n'est dessaisi", () => {
    const r = computeFamilyTransitionData(
      state("ASSIGNED"),
      { action: "assign", assignedFamilyId: 4, assignedFamilyName: "F4", assignedBergerId: "berger-1" },
      TEAM,
      now
    );
    expect(r.notifyUnassignedBergerId).toBeNull();
  });

  it("abandon refusé sur une demande intégrée", () => {
    expect(() =>
      computeFamilyTransitionData(state("INTEGRATED"), { action: "abandon", abandonReasonCode: "OTHER" }, TEAM, now)
    ).toThrow(
      /déjà intégrée/
    );
  });

  it("un tiers (ni équipe ni berger assigné) ne peut rien faire", () => {
    expect(() => computeFamilyTransitionData(state("ASSIGNED"), { action: "contact" }, STRANGER, now)).toThrow(
      /berger assigné ou à l'équipe/
    );
  });
});

describe("computeFamilyTransitionData — mise en attente", () => {
  it.each([
    ["RECONTACT", "WAITING_RECONTACT"],
    ["MISSION", "WAITING_MISSION"],
  ] as const)("wait %s depuis SUBMITTED par l'équipe → %s, mémorise le point d'entrée", (kind, to) => {
    const { data } = computeFamilyTransitionData(state("SUBMITTED"), { action: "wait", waitingKind: kind }, TEAM, now);
    expect(data).toEqual({ status: to, waitingFrom: "SUBMITTED", waitingSince: now, lastRelanceAt: null });
  });

  it("wait depuis CONTACTED est accepté du berger assigné comme de l'équipe", () => {
    for (const actor of [BERGER, TEAM]) {
      const { data } = computeFamilyTransitionData(
        state("CONTACTED"),
        { action: "wait", waitingKind: "RECONTACT" },
        actor,
        now
      );
      expect(data).toMatchObject({ status: "WAITING_RECONTACT", waitingFrom: "CONTACTED" });
    }
  });

  it("wait depuis SUBMITTED est refusé à un berger", () => {
    expect(() =>
      computeFamilyTransitionData(state("SUBMITTED"), { action: "wait", waitingKind: "RECONTACT" }, BERGER, now)
    ).toThrow(/réservée aux membres de l'équipe intégration/);
  });

  it("wait RECONTACT depuis ASSIGNED est accepté du berger assigné (amendement de recette)", () => {
    const { data } = computeFamilyTransitionData(
      state("ASSIGNED"),
      { action: "wait", waitingKind: "RECONTACT" },
      BERGER,
      now
    );
    expect(data).toMatchObject({ status: "WAITING_RECONTACT", waitingFrom: "ASSIGNED" });
  });

  it.each(["ASSIGNED", "CONTACTED"] as const)(
    "la transmission au département mission depuis %s est refusée au berger, acceptée de l'équipe",
    (from) => {
      expect(() =>
        computeFamilyTransitionData(state(from), { action: "wait", waitingKind: "MISSION" }, BERGER, now)
      ).toThrow(/réservée aux membres de l'équipe intégration/);
      expect(
        computeFamilyTransitionData(state(from), { action: "wait", waitingKind: "MISSION" }, TEAM, now).data
      ).toMatchObject({ status: "WAITING_MISSION", waitingFrom: from });
    }
  );

  it.each(ALL_STATUSES.filter((s) => s !== "SUBMITTED" && s !== "ASSIGNED" && s !== "CONTACTED"))(
    "wait refusé depuis %s",
    (from) => {
      expect(() =>
        computeFamilyTransitionData(state(from), { action: "wait", waitingKind: "MISSION" }, TEAM, now)
      ).toThrow(/Transition invalide/);
    }
  );
});

describe("computeFamilyTransitionData — sortie d'attente", () => {
  it("resume d'une attente posée depuis SUBMITTED ramène à l'affectation (SUBMITTED)", () => {
    const { data } = computeFamilyTransitionData(
      state("WAITING_MISSION", { waitingFrom: "SUBMITTED" }),
      { action: "resume" },
      TEAM,
      now
    );
    expect(data).toEqual({ status: "SUBMITTED", waitingFrom: null, waitingSince: null, lastRelanceAt: null });
  });

  it("resume d'une attente posée depuis CONTACTED ramène à l'ajout au groupe (CONTACTED)", () => {
    const { data } = computeFamilyTransitionData(
      state("WAITING_RECONTACT", { waitingFrom: "CONTACTED", assignedFamilyId: 12, assignedBergerId: "berger-1" }),
      { action: "resume" },
      BERGER,
      now
    );
    expect(data).toMatchObject({ status: "CONTACTED", waitingFrom: null });
  });

  it("resume d'une attente posée depuis ASSIGNED ramène au premier contact, par le berger", () => {
    const { data } = computeFamilyTransitionData(
      state("WAITING_RECONTACT", { waitingFrom: "ASSIGNED", assignedFamilyId: 12, assignedBergerId: "berger-1" }),
      { action: "resume" },
      BERGER,
      now
    );
    expect(data).toMatchObject({ status: "ASSIGNED", waitingFrom: null });
  });

  it("le droit de lever suit le point d'entrée : berger refusé si l'attente vient de SUBMITTED", () => {
    expect(() =>
      computeFamilyTransitionData(state("WAITING_RECONTACT", { waitingFrom: "SUBMITTED" }), { action: "resume" }, BERGER, now)
    ).toThrow(/réservée aux membres de l'équipe intégration/);
  });

  it("resume refusé hors attente", () => {
    expect(() => computeFamilyTransitionData(state("ASSIGNED"), { action: "resume" }, TEAM, now)).toThrow(
      /n'est pas en attente/
    );
  });

  it.each(["WAITING_RECONTACT", "WAITING_MISSION"] as const)("abandon direct depuis %s", (from) => {
    const { data } = computeFamilyTransitionData(
      state(from, { waitingFrom: "SUBMITTED" }),
      { action: "abandon", abandonReasonCode: "UNREACHABLE", abandonReason: "sans nouvelles" },
      TEAM,
      now
    );
    expect(data).toEqual({
      status: "ABANDONED",
      abandonedAt: now,
      abandonReasonCode: "UNREACHABLE",
      abandonReason: "sans nouvelles",
    });
  });

  it("relance : ne change pas le statut, remet le décompte à zéro", () => {
    const { data } = computeFamilyTransitionData(
      state("WAITING_RECONTACT", { waitingFrom: "SUBMITTED" }),
      { action: "relance", note: "appelé" },
      TEAM,
      now
    );
    expect(data).toEqual({ lastRelanceAt: now });
  });

  it("relance refusée hors attente", () => {
    expect(() => computeFamilyTransitionData(state("CONTACTED"), { action: "relance" }, TEAM, now)).toThrow(
      /en attente peut être relancée/
    );
  });
});

describe("computeFamilyTransitionData — renvoi à l'équipe intégration", () => {
  it.each(["ASSIGNED", "CONTACTED"] as const)(
    "handback depuis %s : repart en demande reçue, sans famille, berger, jalons ni attente",
    (from) => {
      const current = state(from, { assignedAt: now, contactedAt: from === "CONTACTED" ? now : null });
      const { data } = computeFamilyTransitionData(current, { action: "handback", reason: "hors secteur" }, BERGER, now);
      expect(data).toMatchObject({
        status: "SUBMITTED",
        assignedFamilyId: null,
        assignedFamilyName: null,
        assignedBergerId: null,
        assignedAt: null,
        contactedAt: null,
        waitingFrom: null,
      });
      expect(() => assertNoStaleAssignment({ ...current, ...data } as never)).not.toThrow();
    }
  );

  it.each(ALL_STATUSES.filter((s) => s !== "ASSIGNED" && s !== "CONTACTED"))("handback refusé depuis %s", (from) => {
    expect(() =>
      computeFamilyTransitionData(state(from, { waitingFrom: "CONTACTED" }), { action: "handback", reason: "x" }, TEAM, now)
    ).toThrow(/Transition invalide/);
  });

  it("handback par le berger : personne d'autre à informer ; par l'équipe : le berger est informé", () => {
    const byBerger = computeFamilyTransitionData(state("ASSIGNED"), { action: "handback", reason: "x" }, BERGER, now);
    expect(byBerger.notifyUnassignedBergerId).toBeNull();
    const byTeam = computeFamilyTransitionData(state("ASSIGNED"), { action: "handback", reason: "x" }, TEAM, now);
    expect(byTeam.notifyUnassignedBergerId).toBe("berger-1");
  });

  it("handback refusé à un tiers", () => {
    expect(() =>
      computeFamilyTransitionData(state("ASSIGNED"), { action: "handback", reason: "x" }, STRANGER, now)
    ).toThrow(/berger assigné ou à l'équipe/);
  });
});

describe("computeReopenData", () => {
  const abandoned = state("ABANDONED", { contactedAt: now, assignedAt: now });

  it("mode resume : restaure l'état qui précédait l'abandon, lu dans l'historique", () => {
    const history = [
      { from: "SUBMITTED", to: "ASSIGNED" },
      { from: "ASSIGNED", to: "CONTACTED" },
      { from: "CONTACTED", to: "WAITING_RECONTACT" },
      { from: "WAITING_RECONTACT", to: "ABANDONED" },
    ];
    const r = computeReopenData(abandoned, "resume", history, TEAM);
    expect(r.data).toEqual({
      status: "WAITING_RECONTACT",
      abandonedAt: null,
      abandonReason: null,
      abandonReasonCode: null,
    });
    expect(r.notifyUnassignedBergerId).toBeNull();
  });

  it("mode resume sans historique exploitable (abandon antérieur) : déduit des jalons", () => {
    expect(computeReopenData(abandoned, "resume", [{ from: null, to: "ABANDONED" }], TEAM).data.status).toBe(
      "CONTACTED"
    );
  });

  it("mode restart : repart de zéro, détache famille et berger, informe le berger", () => {
    const r = computeReopenData(abandoned, "restart", [], TEAM);
    expect(r.data).toMatchObject({
      status: "SUBMITTED",
      assignedFamilyId: null,
      assignedFamilyName: null,
      assignedBergerId: null,
      waitingFrom: null,
    });
    expect(r.notifyUnassignedBergerId).toBe("berger-1");
    expect(() => assertNoStaleAssignment({ ...abandoned, ...r.data } as never)).not.toThrow();
  });

  it("réservé à l'équipe et aux demandes abandonnées", () => {
    expect(() => computeReopenData(abandoned, "resume", [], BERGER)).toThrow(/équipe intégration/);
    expect(() => computeReopenData(state("ASSIGNED"), "resume", [], TEAM)).toThrow(/abandonnée/);
  });
});

describe("statusBeforeAbandon", () => {
  it("retient le dernier abandon quand il y en a eu plusieurs", () => {
    const history = [
      { from: "ASSIGNED", to: "ABANDONED" },
      { from: "ABANDONED", to: "ASSIGNED" },
      { from: "ASSIGNED", to: "CONTACTED" },
      { from: "CONTACTED", to: "ABANDONED" },
    ];
    expect(statusBeforeAbandon(state("ABANDONED"), history)).toBe("CONTACTED");
  });

  it("sans jalon ni affectation : demande reçue", () => {
    expect(statusBeforeAbandon(state("ABANDONED", { assignedFamilyId: null, assignedBergerId: null }), [])).toBe(
      "SUBMITTED"
    );
  });
});

describe("assertNoStaleAssignment", () => {
  it("rejette une demande reçue portant une famille ou un berger", () => {
    expect(() => assertNoStaleAssignment({ status: "SUBMITTED", assignedFamilyId: 1, assignedBergerId: null })).toThrow(
      /incohérent/
    );
    expect(() => assertNoStaleAssignment({ status: "SUBMITTED", assignedFamilyId: null, assignedBergerId: "b" })).toThrow(
      /incohérent/
    );
  });

  it("accepte une demande reçue vierge et une demande affectée", () => {
    expect(() => assertNoStaleAssignment({ status: "SUBMITTED", assignedFamilyId: null, assignedBergerId: null })).not.toThrow();
    expect(() => assertNoStaleAssignment({ status: "ASSIGNED", assignedFamilyId: 1, assignedBergerId: "b" })).not.toThrow();
  });
});

describe("consentement au contact (formulaire public)", () => {
  it("absent du body : vaut NOW (non-régression pour les appelants existants)", () => {
    expect(contactConsentSchema.parse(undefined)).toBe("NOW");
  });

  it("refuse toute autre valeur", () => {
    expect(() => contactConsentSchema.parse("NEVER")).toThrow();
  });

  it("NOW : demande reçue, hors attente", () => {
    expect(initialRequestStatusData("NOW", now)).toEqual({ status: "SUBMITTED", waitingFrom: null, waitingSince: null });
  });

  it("LATER : naît directement en attente de recontact, depuis « demande reçue »", () => {
    expect(initialRequestStatusData("LATER", now)).toEqual({
      status: "WAITING_RECONTACT",
      waitingFrom: "SUBMITTED",
      waitingSince: now,
    });
  });
});

describe("schéma PATCH — amendement de recette", () => {
  it("abandon sans motif est refusé", () => {
    expect(familyPatchSchema.safeParse({ action: "abandon" }).success).toBe(false);
    expect(familyPatchSchema.safeParse({ action: "abandon", abandonReasonCode: "PAS_UN_MOTIF" }).success).toBe(false);
    expect(familyPatchSchema.safeParse({ action: "abandon", abandonReasonCode: "MOVED" }).success).toBe(true);
  });

  it("handback exige une raison non vide", () => {
    expect(familyPatchSchema.safeParse({ action: "handback" }).success).toBe(false);
    expect(familyPatchSchema.safeParse({ action: "handback", reason: "   " }).success).toBe(false);
    expect(familyPatchSchema.safeParse({ action: "handback", reason: "hors secteur" }).success).toBe(true);
  });

  it("chaque motif d'abandon a un libellé", () => {
    for (const code of ABANDON_REASON_CODES) expect(ABANDON_REASON_LABELS[code]).toBeTruthy();
  });
});
