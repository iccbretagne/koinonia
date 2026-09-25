import { describe, it, expect } from "vitest";
import {
  resolveRequestReaderAccess,
  projectRequest,
  projectForScheduling,
  NEUTRAL_REQUEST_LABEL,
} from "../services/projection";

const item = {
  id: "req-1",
  firstName: "Jean",
  lastName: "Dupont",
  subject: "Oppressions",
  message: "J'ai besoin d'un entretien confidentiel.",
};

describe("resolveRequestReaderAccess", () => {
  it("le référent (canQualify) lit le contenu, quel que soit l'accompagnant", () => {
    const access = resolveRequestReaderAccess({
      canQualify: true,
      currentUserId: "user-referent",
      assignedToUserId: "user-other",
    });
    expect(access.canReadContent).toBe(true);
  });

  it("l'accompagnant en charge (userId du profil affecté = lecteur) lit le contenu", () => {
    const access = resolveRequestReaderAccess({
      canQualify: false,
      currentUserId: "user-companion",
      assignedToUserId: "user-companion",
    });
    expect(access.canReadContent).toBe(true);
  });

  it("un accompagnant dessaisi (assignedToUserId différent) ne lit pas le contenu", () => {
    const access = resolveRequestReaderAccess({
      canQualify: false,
      currentUserId: "user-companion",
      assignedToUserId: "user-someone-else",
    });
    expect(access.canReadContent).toBe(false);
  });

  it("un tiers sans droit ni affectation ne lit pas le contenu", () => {
    const access = resolveRequestReaderAccess({
      canQualify: false,
      currentUserId: "user-secretary",
      assignedToUserId: null,
    });
    expect(access.canReadContent).toBe(false);
  });

  it("la Secrétaire (care:view, pas canQualify) ne lit pas le contenu si non affectée", () => {
    const access = resolveRequestReaderAccess({
      canQualify: false,
      currentUserId: "user-secretary",
      assignedToUserId: undefined,
    });
    expect(access.canReadContent).toBe(false);
  });
});

describe("projectRequest", () => {
  it("renvoie la fiche complète si canReadContent", () => {
    const projected = projectRequest(item, { canReadContent: true });
    expect(projected.masked).toBe(false);
    expect(projected.subject).toBe("Oppressions");
    expect(projected.message).toBe("J'ai besoin d'un entretien confidentiel.");
  });

  it("masque subject et message si !canReadContent, avec un libellé neutre", () => {
    const projected = projectRequest(item, { canReadContent: false });
    expect(projected.masked).toBe(true);
    expect(projected.subject).toBe(NEUTRAL_REQUEST_LABEL);
    expect(projected.message).toBeNull();
  });

  it("conserve l'identité (firstName/lastName) même masqué", () => {
    const projected = projectRequest(item, { canReadContent: false });
    expect(projected.firstName).toBe("Jean");
    expect(projected.lastName).toBe("Dupont");
  });
});

describe("projectForScheduling", () => {
  it("ne renvoie jamais subject ni message, même pour un lecteur habilité par ailleurs", () => {
    const projected = projectForScheduling(item);
    expect(projected.subject).toBe(NEUTRAL_REQUEST_LABEL);
    expect("message" in projected).toBe(false);
    expect(projected.firstName).toBe("Jean");
  });
});
