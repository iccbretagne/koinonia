import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

const {
  declareOpening,
  declareClosing,
  validateChecklist,
  reportIssueWithoutDeclaration,
  closeWithoutDeclaration,
  isControlTeamMember,
} = await import("@/modules/rooms");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("declareOpening", () => {
  it("refuse si l'utilisateur n'est pas le créateur de la réservation", async () => {
    prismaMock.roomReservation.findUnique.mockResolvedValue({
      id: "res-1",
      createdById: "user-owner",
      checklist: { id: "chk-1", status: "PENDING" },
    } as never);

    await expect(
      declareOpening({ reservationId: "res-1", userId: "someone-else" })
    ).rejects.toThrow("créateur");
  });

  it("passe la main courante à OPENED pour le créateur", async () => {
    prismaMock.roomReservation.findUnique.mockResolvedValue({
      id: "res-1",
      createdById: "user-owner",
      checklist: { id: "chk-1", status: "PENDING" },
    } as never);
    prismaMock.roomChecklist.update.mockResolvedValue({ status: "OPENED" } as never);

    await declareOpening({ reservationId: "res-1", userId: "user-owner", keyReceivedFromName: "Jean" });

    expect(prismaMock.roomChecklist.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { reservationId: "res-1" },
        data: expect.objectContaining({ status: "OPENED", keyReceivedFromName: "Jean" }),
      })
    );
  });
});

describe("declareClosing", () => {
  it("refuse si l'utilisateur n'est pas le créateur", async () => {
    prismaMock.roomReservation.findUnique.mockResolvedValue({
      id: "res-1",
      createdById: "user-owner",
      checklist: { id: "chk-1", status: "OPENED" },
    } as never);

    await expect(
      declareClosing({
        reservationId: "res-1",
        userId: "someone-else",
        closedProperly: true,
        cleaned: true,
        equipmentOk: true,
      })
    ).rejects.toThrow("créateur");
  });

  it("passe la main courante à CLOSED_DECLARED", async () => {
    prismaMock.roomReservation.findUnique.mockResolvedValue({
      id: "res-1",
      createdById: "user-owner",
      checklist: { id: "chk-1", status: "OPENED" },
    } as never);
    prismaMock.roomChecklist.update.mockResolvedValue({ status: "CLOSED_DECLARED" } as never);

    await declareClosing({
      reservationId: "res-1",
      userId: "user-owner",
      closedProperly: true,
      cleaned: false,
      equipmentOk: false,
      equipmentNotes: "Vidéoprojecteur en panne",
    });

    expect(prismaMock.roomChecklist.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "CLOSED_DECLARED",
          closedProperly: true,
          cleaned: false,
          equipmentOk: false,
          equipmentNotes: "Vidéoprojecteur en panne",
        }),
      })
    );
  });
});

describe("validateChecklist", () => {
  function mockReservation(status: string, endAt: Date = new Date("2020-01-01T12:00:00Z")) {
    prismaMock.roomReservation.findUnique.mockResolvedValue({
      id: "res-1",
      churchId: "church-1",
      title: "Culte du dimanche",
      createdById: "user-owner",
      endAt,
      checklist: { id: "chk-1", status },
    } as never);
  }

  it("refuse si la fermeture n'a pas encore été déclarée", async () => {
    mockReservation("OPENED");

    await expect(
      validateChecklist({
        reservationId: "res-1",
        validatorId: "control-1",
        validatedClosedProperly: true,
        validatedCleaned: true,
        validatedEquipmentOk: true,
      })
    ).rejects.toThrow();
  });

  it("passe à VALIDATED quand le constat concorde avec la déclaration", async () => {
    mockReservation("CLOSED_DECLARED");
    prismaMock.roomChecklist.findUnique.mockResolvedValue({
      closedProperly: true,
      cleaned: true,
      equipmentOk: true,
    } as never);
    prismaMock.roomChecklist.update.mockResolvedValue({ status: "VALIDATED" } as never);

    await validateChecklist({
      reservationId: "res-1",
      validatorId: "control-1",
      validatedClosedProperly: true,
      validatedCleaned: true,
      validatedEquipmentOk: true,
    });

    expect(prismaMock.roomChecklist.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "VALIDATED" }) })
    );
    expect(prismaMock.notification.create).not.toHaveBeenCalled();
  });

  it("passe à ISSUE_REPORTED et notifie le créateur en cas d'écart", async () => {
    mockReservation("CLOSED_DECLARED");
    prismaMock.roomChecklist.findUnique.mockResolvedValue({
      closedProperly: true,
      cleaned: true,
      equipmentOk: true,
    } as never);
    prismaMock.roomChecklist.update.mockResolvedValue({ status: "ISSUE_REPORTED" } as never);

    await validateChecklist({
      reservationId: "res-1",
      validatorId: "control-1",
      validatedClosedProperly: false,
      validatedCleaned: true,
      validatedEquipmentOk: true,
    });

    expect(prismaMock.roomChecklist.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "ISSUE_REPORTED" }) })
    );
    expect(prismaMock.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ userId: "user-owner", type: "ROOM_CHECKLIST_ISSUE" }) })
    );
  });

  it("passe à ISSUE_REPORTED en cas d'écart uniquement sur l'état du matériel", async () => {
    mockReservation("CLOSED_DECLARED");
    prismaMock.roomChecklist.findUnique.mockResolvedValue({
      closedProperly: true,
      cleaned: true,
      equipmentOk: true,
    } as never);
    prismaMock.roomChecklist.update.mockResolvedValue({ status: "ISSUE_REPORTED" } as never);

    await validateChecklist({
      reservationId: "res-1",
      validatorId: "control-1",
      validatedClosedProperly: true,
      validatedCleaned: true,
      validatedEquipmentOk: false,
    });

    expect(prismaMock.roomChecklist.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "ISSUE_REPORTED" }) })
    );
  });
});

describe("reportIssueWithoutDeclaration", () => {
  function mockReservation(status: string, endAt: Date) {
    prismaMock.roomReservation.findUnique.mockResolvedValue({
      id: "res-1",
      churchId: "church-1",
      title: "Réunion de prière",
      createdById: "user-owner",
      endAt,
      checklist: { id: "chk-1", status },
    } as never);
  }

  it("refuse si la main courante a déjà été déclarée fermée", async () => {
    mockReservation("CLOSED_DECLARED", new Date("2020-01-01T12:00:00Z"));

    await expect(
      reportIssueWithoutDeclaration({ reservationId: "res-1", validatorId: "control-1", incidentNotes: "Salle sale" })
    ).rejects.toThrow();
  });

  it("refuse si la réservation n'est pas encore terminée", async () => {
    mockReservation("PENDING", new Date(Date.now() + 60 * 60 * 1000));

    await expect(
      reportIssueWithoutDeclaration({ reservationId: "res-1", validatorId: "control-1", incidentNotes: "Salle sale" })
    ).rejects.toThrow();
  });

  it("signale l'écart et notifie le créateur pour une réservation passée non déclarée", async () => {
    mockReservation("PENDING", new Date("2020-01-01T12:00:00Z"));
    prismaMock.roomChecklist.update.mockResolvedValue({ status: "ISSUE_REPORTED" } as never);

    await reportIssueWithoutDeclaration({
      reservationId: "res-1",
      validatorId: "control-1",
      incidentNotes: "Salle laissée en désordre",
    });

    expect(prismaMock.roomChecklist.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "ISSUE_REPORTED",
          closedWithoutDeclaration: true,
          incidentNotes: "Salle laissée en désordre",
        }),
      })
    );
    expect(prismaMock.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ userId: "user-owner", type: "ROOM_CHECKLIST_ISSUE" }) })
    );
  });
});

describe("closeWithoutDeclaration", () => {
  function mockReservation(status: string, endAt: Date) {
    prismaMock.roomReservation.findUnique.mockResolvedValue({
      id: "res-1",
      churchId: "church-1",
      title: "Réunion de prière",
      createdById: "user-owner",
      endAt,
      checklist: { id: "chk-1", status },
    } as never);
  }

  it("refuse si la réservation n'est pas encore terminée", async () => {
    mockReservation("OPENED", new Date(Date.now() + 60 * 60 * 1000));

    await expect(
      closeWithoutDeclaration({ reservationId: "res-1", validatorId: "control-1" })
    ).rejects.toThrow();
  });

  it("clôture sans signalement ni notification pour une réservation passée non déclarée", async () => {
    mockReservation("OPENED", new Date("2020-01-01T12:00:00Z"));
    prismaMock.roomChecklist.update.mockResolvedValue({ status: "VALIDATED" } as never);

    await closeWithoutDeclaration({ reservationId: "res-1", validatorId: "control-1" });

    expect(prismaMock.roomChecklist.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "VALIDATED", closedWithoutDeclaration: true }),
      })
    );
    expect(prismaMock.notification.create).not.toHaveBeenCalled();
  });
});

describe("isControlTeamMember", () => {
  it("retourne false sans département", async () => {
    expect(await isControlTeamMember([])).toBe(false);
    expect(prismaMock.department.count).not.toHaveBeenCalled();
  });

  it("vrai si l'un des départements a la fonction SECURITE ou ENTRETIEN", async () => {
    prismaMock.department.count.mockResolvedValue(1);
    expect(await isControlTeamMember(["dept-1"])).toBe(true);
  });

  it("faux si aucun département ne correspond", async () => {
    prismaMock.department.count.mockResolvedValue(0);
    expect(await isControlTeamMember(["dept-1"])).toBe(false);
  });
});
