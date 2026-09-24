import { describe, it, expect } from "vitest";
import {
  computeFollowupTransitionData,
  type FollowupActor,
  type FollowupState,
} from "../services/followup-state";
import type { ResolvedAssignee } from "../services/assignee";

const now = new Date("2026-06-01T10:00:00Z");

const REFERENT: FollowupActor = { isReferent: true, isCurrentAssignee: false };
const ASSIGNEE_ACTOR: FollowupActor = { isReferent: false, isCurrentAssignee: true };
const THIRD_PARTY: FollowupActor = { isReferent: false, isCurrentAssignee: false };

const profileAssignee: ResolvedAssignee = { kind: "PROFILE", id: "profile-1", userId: "user-profile-1", name: "Pasteur Jean", email: null };
const memberAssignee: ResolvedAssignee = { kind: "MEMBER", id: "user-member-1", userId: "user-member-1", name: "Alice", email: "alice@x.org" };

function state(overrides: Partial<FollowupState> = {}): FollowupState {
  return { status: "SUBMITTED", assignedProfileId: null, assignedConseillerMsdpId: null, ...overrides };
}

describe("assign", () => {
  it("réservé au référent", () => {
    expect(() =>
      computeFollowupTransitionData(state(), { action: "assign", assignee: { kind: "MEMBER", id: "u1" } }, THIRD_PARTY, now, "u1", memberAssignee)
    ).toThrow("référent");
  });

  it("exige SUBMITTED", () => {
    expect(() =>
      computeFollowupTransitionData(
        state({ status: "ASSIGNED" }),
        { action: "assign", assignee: { kind: "MEMBER", id: "u1" } },
        REFERENT,
        now,
        "u1",
        memberAssignee
      )
    ).toThrow("Transition invalide");
  });

  it("affecte au profil pastoral (assignedProfileId, pas assignedConseillerMsdpId)", () => {
    const result = computeFollowupTransitionData(
      state(),
      { action: "assign", assignee: { kind: "PROFILE", id: "profile-1" } },
      REFERENT,
      now,
      "u-referent",
      profileAssignee
    );
    expect(result.data).toMatchObject({ status: "ASSIGNED", assignedProfileId: "profile-1", assignedConseillerMsdpId: null });
    expect(result.notifyAssigned).toEqual(profileAssignee);
  });

  it("affecte au membre du MSDP (assignedConseillerMsdpId, pas assignedProfileId)", () => {
    const result = computeFollowupTransitionData(
      state(),
      { action: "assign", assignee: { kind: "MEMBER", id: "user-member-1" } },
      REFERENT,
      now,
      "u-referent",
      memberAssignee
    );
    expect(result.data).toMatchObject({ status: "ASSIGNED", assignedConseillerMsdpId: "user-member-1", assignedProfileId: null });
  });
});

describe("reassign", () => {
  it("réservé au référent, exige un statut actif", () => {
    expect(() =>
      computeFollowupTransitionData(
        state({ status: "ASSIGNED", assignedConseillerMsdpId: "u1" }),
        { action: "reassign", assignee: profileAssignee },
        ASSIGNEE_ACTOR,
        now,
        "u1",
        profileAssignee
      )
    ).toThrow("référent");
    expect(() =>
      computeFollowupTransitionData(state(), { action: "reassign", assignee: profileAssignee }, REFERENT, now, "u1", profileAssignee)
    ).toThrow("Transition invalide");
  });

  it("réaffecte sans changer le statut, notifie l'ancien et le nouvel accompagnant", () => {
    const result = computeFollowupTransitionData(
      state({ status: "CONTACTED", assignedConseillerMsdpId: "user-member-1" }),
      { action: "reassign", assignee: { kind: "PROFILE", id: "profile-1" } },
      REFERENT,
      now,
      "u-referent",
      profileAssignee
    );
    expect(result.data.status).toBeUndefined();
    expect(result.data.assignedProfileId).toBe("profile-1");
    expect(result.data.assignedConseillerMsdpId).toBeNull();
    expect(result.notifyPreviousAssignee).toBe(true);
  });
});

describe("étapes existantes — réservées à l'accompagnant en charge", () => {
  it("contact refuse un tiers ou le référent seul, accepte l'accompagnant", () => {
    const assigned = state({ status: "ASSIGNED", assignedConseillerMsdpId: "user-member-1" });
    expect(() => computeFollowupTransitionData(assigned, { action: "contact" }, THIRD_PARTY, now, "u1", null)).toThrow(
      "accompagnant en charge"
    );
    expect(() => computeFollowupTransitionData(assigned, { action: "contact" }, REFERENT, now, "u1", null)).toThrow(
      "accompagnant en charge"
    );
    expect(computeFollowupTransitionData(assigned, { action: "contact" }, ASSIGNEE_ACTOR, now, "u1", null).data.status).toBe(
      "CONTACTED"
    );
  });

  it("in_formation exige CONTACTED, réservé à l'accompagnant", () => {
    const contacted = state({ status: "CONTACTED", assignedConseillerMsdpId: "user-member-1" });
    expect(() => computeFollowupTransitionData(contacted, { action: "in_formation" }, THIRD_PARTY, now, "u1", null)).toThrow();
    expect(
      computeFollowupTransitionData(contacted, { action: "in_formation" }, ASSIGNEE_ACTOR, now, "u1", null).data.status
    ).toBe("IN_FORMATION");
  });

  it("complete exige IN_FORMATION, réservé à l'accompagnant", () => {
    const inFormation = state({ status: "IN_FORMATION", assignedConseillerMsdpId: "user-member-1" });
    expect(() => computeFollowupTransitionData(inFormation, { action: "complete" }, THIRD_PARTY, now, "u1", null)).toThrow();
    expect(
      computeFollowupTransitionData(inFormation, { action: "complete" }, ASSIGNEE_ACTOR, now, "u1", null).data.status
    ).toBe("COMPLETED");
  });
});

describe("abandon", () => {
  it("accepte l'accompagnant en charge ou le référent, refuse un tiers", () => {
    const assigned = state({ status: "ASSIGNED", assignedConseillerMsdpId: "user-member-1" });
    expect(() => computeFollowupTransitionData(assigned, { action: "abandon" }, THIRD_PARTY, now, "u1", null)).toThrow();
    expect(computeFollowupTransitionData(assigned, { action: "abandon" }, ASSIGNEE_ACTOR, now, "u1", null).data.status).toBe(
      "ABANDONED"
    );
    expect(computeFollowupTransitionData(assigned, { action: "abandon" }, REFERENT, now, "u1", null).data.status).toBe("ABANDONED");
  });

  it("refuse d'abandonner un suivi déjà terminé", () => {
    expect(() =>
      computeFollowupTransitionData(state({ status: "COMPLETED" }), { action: "abandon" }, REFERENT, now, "u1", null)
    ).toThrow("suivi terminé");
  });
});

describe("reopen", () => {
  it("réservé au référent, exige ABANDONED", () => {
    expect(() =>
      computeFollowupTransitionData(state({ status: "ABANDONED" }), { action: "reopen" }, ASSIGNEE_ACTOR, now, "u1", null)
    ).toThrow("référent");
    expect(() =>
      computeFollowupTransitionData(state({ status: "SUBMITTED" }), { action: "reopen" }, REFERENT, now, "u1", null)
    ).toThrow("abandonné");
    expect(
      computeFollowupTransitionData(state({ status: "ABANDONED" }), { action: "reopen" }, REFERENT, now, "u1", null).data.status
    ).toBe("SUBMITTED");
  });
});

describe("handback", () => {
  it("réservé à l'accompagnant en charge, notifie les référents", () => {
    const assigned = state({ status: "IN_FORMATION", assignedConseillerMsdpId: "user-member-1" });
    expect(() =>
      computeFollowupTransitionData(assigned, { action: "handback", reason: "Indisponible" }, REFERENT, now, "u1", null)
    ).toThrow("accompagnant en charge");

    const result = computeFollowupTransitionData(
      assigned,
      { action: "handback", reason: "Indisponible" },
      ASSIGNEE_ACTOR,
      now,
      "user-member-1",
      null
    );
    expect(result.data.status).toBe("SUBMITTED");
    expect(result.data.assignedConseillerMsdpId).toBeNull();
    expect(result.notifyReferents).toBe(true);
  });
});

describe("invariant d'affectation exclusive", () => {
  it("assign ne renseigne jamais assignedProfileId et assignedConseillerMsdpId à la fois", () => {
    const toProfile = computeFollowupTransitionData(
      state(),
      { action: "assign", assignee: { kind: "PROFILE", id: "profile-1" } },
      REFERENT,
      now,
      "u1",
      profileAssignee
    );
    expect(toProfile.data.assignedProfileId && toProfile.data.assignedConseillerMsdpId).toBeFalsy();
  });
});
