import { describe, it, expect } from "vitest";
import {
  computeAppointmentTransitionData,
  type AppointmentActor,
  type AppointmentRequestState,
} from "../services/appointment-state";
import type { ResolvedAssignee } from "../services/assignee";

const now = new Date("2026-06-01T10:00:00Z");
const past = new Date("2026-05-01T10:00:00Z");
const future = new Date("2026-07-01T10:00:00Z");

const REFERENT: AppointmentActor = { isReferent: true, isCurrentAssignee: false, currentAssigneeHasAccount: true };
const ASSIGNEE_ACTOR: AppointmentActor = { isReferent: false, isCurrentAssignee: true, currentAssigneeHasAccount: true };
const DESSAISI: AppointmentActor = { isReferent: false, isCurrentAssignee: false, currentAssigneeHasAccount: true };
const THIRD_PARTY: AppointmentActor = { isReferent: false, isCurrentAssignee: false, currentAssigneeHasAccount: true };
const REFERENT_PROXY_NO_ACCOUNT: AppointmentActor = { isReferent: true, isCurrentAssignee: false, currentAssigneeHasAccount: false };

const profileAssignee: ResolvedAssignee = { kind: "PROFILE", id: "profile-1", userId: "user-profile-1", name: "Pasteur Jean", email: "jean@x.org" };
const memberAssignee: ResolvedAssignee = { kind: "MEMBER", id: "user-member-1", userId: "user-member-1", name: "Alice", email: "alice@x.org" };

function state(overrides: Partial<AppointmentRequestState> = {}): AppointmentRequestState {
  return { status: "PENDING", assignedToId: null, assignedMemberId: null, scheduledFor: null, ...overrides };
}

describe("validate", () => {
  it("réservé au référent", () => {
    expect(() =>
      computeAppointmentTransitionData(state(), { action: "validate", assignee: { kind: "PROFILE", id: "p1" } }, ASSIGNEE_ACTOR, now, "u1", profileAssignee)
    ).toThrow("référent");
  });

  it("exige PENDING", () => {
    expect(() =>
      computeAppointmentTransitionData(
        state({ status: "VALIDATED" }),
        { action: "validate", assignee: { kind: "PROFILE", id: "p1" } },
        REFERENT,
        now,
        "u1",
        profileAssignee
      )
    ).toThrow("Transition invalide");
  });

  it("vers un profil pastoral : assignedToId renseigné, notifie le Protocole", () => {
    const result = computeAppointmentTransitionData(
      state(),
      { action: "validate", assignee: { kind: "PROFILE", id: "profile-1" } },
      REFERENT,
      now,
      "u-referent",
      profileAssignee
    );
    expect(result.data.status).toBe("VALIDATED");
    expect(result.data.assignedToId).toBe("profile-1");
    expect(result.data.assignedMemberId).toBeNull();
    expect(result.data.assignedById).toBe("u-referent");
    expect(result.notifyProtocole).toBe(true);
    expect(result.notifyAssigned).toEqual(profileAssignee);
  });

  it("vers un membre du MSDP : assignedMemberId renseigné, ne notifie pas le Protocole", () => {
    const result = computeAppointmentTransitionData(
      state(),
      { action: "validate", assignee: { kind: "MEMBER", id: "user-member-1" } },
      REFERENT,
      now,
      "u-referent",
      memberAssignee
    );
    expect(result.data.assignedMemberId).toBe("user-member-1");
    expect(result.data.assignedToId).toBeNull();
    expect(result.notifyProtocole).toBe(false);
  });
});

describe("reject", () => {
  it("réservé au référent, exige PENDING", () => {
    expect(() =>
      computeAppointmentTransitionData(state(), { action: "reject", reasonCode: "OUT_OF_SCOPE" }, ASSIGNEE_ACTOR, now, "u1", null)
    ).toThrow("référent");
    expect(() =>
      computeAppointmentTransitionData(
        state({ status: "VALIDATED" }),
        { action: "reject", reasonCode: "OUT_OF_SCOPE" },
        REFERENT,
        now,
        "u1",
        null
      )
    ).toThrow("Transition invalide");
  });

  it("motif qualifié obligatoire (le schéma Zod le garantit), commentaire optionnel", () => {
    const result = computeAppointmentTransitionData(
      state(),
      { action: "reject", reasonCode: "DUPLICATE" },
      REFERENT,
      now,
      "u1",
      null
    );
    expect(result.data.status).toBe("REJECTED");
    expect(result.data.rejectReasonCode).toBe("DUPLICATE");
    expect(result.data.rejectReason).toBeNull();
  });
});

describe("reassign", () => {
  it("réservé au référent", () => {
    expect(() =>
      computeAppointmentTransitionData(
        state({ status: "VALIDATED", assignedToId: "profile-1" }),
        { action: "reassign", assignee: memberAssignee },
        ASSIGNEE_ACTOR,
        now,
        "u1",
        memberAssignee
      )
    ).toThrow("référent");
  });

  it("exige VALIDATED ou SCHEDULED", () => {
    expect(() =>
      computeAppointmentTransitionData(state(), { action: "reassign", assignee: memberAssignee }, REFERENT, now, "u1", memberAssignee)
    ).toThrow("Transition invalide");
  });

  it("réaffecte, efface la date, notifie l'ancien et le nouvel accompagnant, repasse à VALIDATED même depuis SCHEDULED", () => {
    const result = computeAppointmentTransitionData(
      state({ status: "SCHEDULED", assignedToId: "profile-1", scheduledFor: future }),
      { action: "reassign", assignee: memberAssignee },
      REFERENT,
      now,
      "u-referent",
      memberAssignee
    );
    expect(result.data.status).toBe("VALIDATED");
    expect(result.data.assignedMemberId).toBe("user-member-1");
    expect(result.data.assignedToId).toBeNull();
    expect(result.data.scheduledFor).toBeNull();
    expect(result.notifyPreviousAssignee).toBe(true);
    expect(result.notifyAssigned).toEqual(memberAssignee);
  });
});

describe("set_date", () => {
  it("réservé à l'accompagnant membre du MSDP en charge", () => {
    expect(() =>
      computeAppointmentTransitionData(
        state({ status: "VALIDATED", assignedToId: "profile-1" }),
        { action: "set_date", scheduledFor: future.toISOString() },
        ASSIGNEE_ACTOR,
        now,
        "u1",
        null
      )
    ).toThrow("membre du MSDP");
  });

  it("refuse un référent qui n'est pas l'accompagnant", () => {
    expect(() =>
      computeAppointmentTransitionData(
        state({ status: "VALIDATED", assignedMemberId: "user-member-1" }),
        { action: "set_date", scheduledFor: future.toISOString() },
        REFERENT,
        now,
        "u1",
        null
      )
    ).toThrow("accompagnant en charge");
  });

  it("exige VALIDATED", () => {
    expect(() =>
      computeAppointmentTransitionData(
        state({ status: "SCHEDULED", assignedMemberId: "user-member-1" }),
        { action: "set_date", scheduledFor: future.toISOString() },
        ASSIGNEE_ACTOR,
        now,
        "u1",
        null
      )
    ).toThrow("Transition invalide");
  });

  it("passe à SCHEDULED avec la date fixée par le membre", () => {
    const result = computeAppointmentTransitionData(
      state({ status: "VALIDATED", assignedMemberId: "user-member-1" }),
      { action: "set_date", scheduledFor: future.toISOString() },
      ASSIGNEE_ACTOR,
      now,
      "user-member-1",
      null
    );
    expect(result.data.status).toBe("SCHEDULED");
    expect(result.data.scheduledFor).toEqual(future);
    expect(result.data.scheduledById).toBe("user-member-1");
  });
});

describe("outcome — les cinq issues", () => {
  const scheduled = state({ status: "SCHEDULED", assignedMemberId: "user-member-1", scheduledFor: past });

  it("exige SCHEDULED", () => {
    expect(() =>
      computeAppointmentTransitionData(state(), { action: "outcome", kind: "HELD" }, ASSIGNEE_ACTOR, now, "u1", null)
    ).toThrow("Transition invalide");
  });

  it("refuse tant que le rendez-vous n'a pas eu lieu", () => {
    expect(() =>
      computeAppointmentTransitionData(
        state({ status: "SCHEDULED", assignedMemberId: "user-member-1", scheduledFor: future }),
        { action: "outcome", kind: "HELD" },
        ASSIGNEE_ACTOR,
        now,
        "u1",
        null
      )
    ).toThrow("n'a pas encore eu lieu");
  });

  it("refuse un tiers, accepte l'accompagnant en charge", () => {
    expect(() =>
      computeAppointmentTransitionData(scheduled, { action: "outcome", kind: "HELD" }, THIRD_PARTY, now, "u1", null)
    ).toThrow("accompagnant en charge");
    expect(
      computeAppointmentTransitionData(scheduled, { action: "outcome", kind: "HELD" }, ASSIGNEE_ACTOR, now, "u1", null).data.status
    ).toBe("CLOSED");
  });

  it("le référent agit à la place d'un profil pastoral sans compte", () => {
    const result = computeAppointmentTransitionData(
      state({ status: "SCHEDULED", assignedToId: "profile-1", scheduledFor: past }),
      { action: "outcome", kind: "HELD" },
      REFERENT_PROXY_NO_ACCOUNT,
      now,
      "u-referent",
      null
    );
    expect(result.data.status).toBe("CLOSED");
  });

  it("HELD : clôture avec l'issue HELD", () => {
    const result = computeAppointmentTransitionData(scheduled, { action: "outcome", kind: "HELD" }, ASSIGNEE_ACTOR, now, "u1", null);
    expect(result.data).toMatchObject({ status: "CLOSED", outcome: "HELD" });
    expect(result.createFollowUpFromOrientation).toBe(false);
  });

  it("REFERRED_TO_FOLLOWUP : clôture, signale la création d'un suivi", () => {
    const result = computeAppointmentTransitionData(
      scheduled,
      { action: "outcome", kind: "REFERRED_TO_FOLLOWUP" },
      ASSIGNEE_ACTOR,
      now,
      "u1",
      null
    );
    expect(result.data).toMatchObject({ status: "CLOSED", outcome: "REFERRED_TO_FOLLOWUP" });
    expect(result.createFollowUpFromOrientation).toBe(true);
  });

  it("NO_SHOW_CLOSE : clôture avec l'issue NO_SHOW (mappage du kind API vers l'enum)", () => {
    const result = computeAppointmentTransitionData(
      scheduled,
      { action: "outcome", kind: "NO_SHOW_CLOSE" },
      ASSIGNEE_ACTOR,
      now,
      "u1",
      null
    );
    expect(result.data).toMatchObject({ status: "CLOSED", outcome: "NO_SHOW" });
  });

  it("NEW_APPOINTMENT : ne clôture pas, retour à VALIDATED sans date", () => {
    const result = computeAppointmentTransitionData(
      scheduled,
      { action: "outcome", kind: "NEW_APPOINTMENT" },
      ASSIGNEE_ACTOR,
      now,
      "u1",
      null
    );
    expect(result.data).toEqual({ status: "VALIDATED", scheduledFor: null, scheduledById: null, scheduledAt: null });
    expect(result.data.outcome).toBeUndefined();
  });

  it("NO_SHOW_REPLAN : ne clôture pas, retour à VALIDATED sans date", () => {
    const result = computeAppointmentTransitionData(
      scheduled,
      { action: "outcome", kind: "NO_SHOW_REPLAN" },
      ASSIGNEE_ACTOR,
      now,
      "u1",
      null
    );
    expect(result.data.status).toBe("VALIDATED");
    expect(result.data.scheduledFor).toBeNull();
  });
});

describe("handback", () => {
  it("réservé à l'accompagnant en charge (pas au référent)", () => {
    expect(() =>
      computeAppointmentTransitionData(
        state({ status: "VALIDATED", assignedToId: "profile-1" }),
        { action: "handback", reason: "Indisponible" },
        REFERENT,
        now,
        "u1",
        null
      )
    ).toThrow("accompagnant en charge");
  });

  it("refuse un accompagnant dessaisi", () => {
    expect(() =>
      computeAppointmentTransitionData(
        state({ status: "VALIDATED", assignedToId: "profile-1" }),
        { action: "handback", reason: "Indisponible" },
        DESSAISI,
        now,
        "u1",
        null
      )
    ).toThrow("accompagnant en charge");
  });

  it("exige VALIDATED ou SCHEDULED", () => {
    expect(() =>
      computeAppointmentTransitionData(state(), { action: "handback", reason: "Indisponible" }, ASSIGNEE_ACTOR, now, "u1", null)
    ).toThrow("Transition invalide");
  });

  it("repasse à PENDING, efface toute affectation, notifie tous les référents", () => {
    const result = computeAppointmentTransitionData(
      state({ status: "SCHEDULED", assignedMemberId: "user-member-1", scheduledFor: future }),
      { action: "handback", reason: "Ne peut plus assurer le suivi" },
      ASSIGNEE_ACTOR,
      now,
      "user-member-1",
      null
    );
    expect(result.data.status).toBe("PENDING");
    expect(result.data.assignedMemberId).toBeNull();
    expect(result.data.assignedToId).toBeNull();
    expect(result.data.scheduledFor).toBeNull();
    expect(result.notifyReferents).toBe(true);
  });
});

describe("invariant d'affectation exclusive", () => {
  it("validate ne renseigne jamais assignedToId et assignedMemberId à la fois", () => {
    const toProfile = computeAppointmentTransitionData(
      state(),
      { action: "validate", assignee: { kind: "PROFILE", id: "profile-1" } },
      REFERENT,
      now,
      "u1",
      profileAssignee
    );
    expect(toProfile.data.assignedToId && toProfile.data.assignedMemberId).toBeFalsy();

    const toMember = computeAppointmentTransitionData(
      state(),
      { action: "validate", assignee: { kind: "MEMBER", id: "user-member-1" } },
      REFERENT,
      now,
      "u1",
      memberAssignee
    );
    expect(toMember.data.assignedToId && toMember.data.assignedMemberId).toBeFalsy();
  });
});
