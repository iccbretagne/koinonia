import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";
import { createAdminSession, createSuperAdminSession, createSession } from "@/__mocks__/auth";
import { ApiError } from "@/lib/api-utils";

const mockRequireAuth = vi.fn();
const mockGetUserDepartmentScope = vi.fn();
vi.mock("@/lib/auth", () => ({
  requireAuth: (...args: unknown[]) => mockRequireAuth(...args),
  getUserDepartmentScope: (...args: unknown[]) => mockGetUserDepartmentScope(...args),
}));

const mockValidateChecklist = vi.fn();
const mockReportIssueWithoutDeclaration = vi.fn();
const mockCloseWithoutDeclaration = vi.fn();
const mockIsControlTeamMember = vi.fn();
vi.mock("@/modules/rooms", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/modules/rooms")>()),
  validateChecklist: (...args: unknown[]) => mockValidateChecklist(...args),
  reportIssueWithoutDeclaration: (...args: unknown[]) => mockReportIssueWithoutDeclaration(...args),
  closeWithoutDeclaration: (...args: unknown[]) => mockCloseWithoutDeclaration(...args),
  isControlTeamMember: (...args: unknown[]) => mockIsControlTeamMember(...args),
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

const { PATCH } = await import("../[id]/checklist/validate/route");

const reservation = { id: "res-1", churchId: "church-1" };

function patchRequest(body: unknown) {
  return new Request("http://localhost/api/room-reservations/res-1/checklist/validate", {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

describe("PATCH /api/room-reservations/[id]/checklist/validate — authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.roomReservation.findUnique.mockResolvedValue(reservation as never);
    mockGetUserDepartmentScope.mockReturnValue({ scoped: false });
  });

  it("returns 404 when the reservation does not exist", async () => {
    prismaMock.roomReservation.findUnique.mockResolvedValue(null);
    mockRequireAuth.mockResolvedValue(createAdminSession());

    const res = await PATCH(patchRequest({ action: "validate", validatedClosedProperly: true, validatedCleaned: true, validatedEquipmentOk: true }), {
      params: Promise.resolve({ id: "res-1" }),
    });

    expect(res.status).toBe(404);
  });

  it("returns 401 when not authenticated", async () => {
    mockRequireAuth.mockRejectedValue(new Error("UNAUTHORIZED"));

    const res = await PATCH(patchRequest({ action: "validate", validatedClosedProperly: true, validatedCleaned: true, validatedEquipmentOk: true }), {
      params: Promise.resolve({ id: "res-1" }),
    });

    expect(res.status).toBe(401);
  });

  it("returns 403 for a user without rooms:manage nor control-team department", async () => {
    mockRequireAuth.mockResolvedValue(createSession({ isSuperAdmin: false, churchRoles: [] }));
    mockGetUserDepartmentScope.mockReturnValue({ scoped: true, departmentIds: ["dept-other"] });
    mockIsControlTeamMember.mockResolvedValue(false);

    const res = await PATCH(patchRequest({ action: "validate", validatedClosedProperly: true, validatedCleaned: true, validatedEquipmentOk: true }), {
      params: Promise.resolve({ id: "res-1" }),
    });

    expect(res.status).toBe(403);
    expect(mockValidateChecklist).not.toHaveBeenCalled();
  });

  it("returns 400 for an invalid body", async () => {
    mockRequireAuth.mockResolvedValue(createSuperAdminSession());

    const res = await PATCH(patchRequest({ action: "report-issue" }), {
      params: Promise.resolve({ id: "res-1" }),
    });

    expect(res.status).toBe(400);
  });

  describe("action=validate", () => {
    it("allows rooms:manage (Admin) and calls validateChecklist", async () => {
      mockRequireAuth.mockResolvedValue(createAdminSession());
      mockValidateChecklist.mockResolvedValue({ status: "VALIDATED" });

      const res = await PATCH(
        patchRequest({ action: "validate", validatedClosedProperly: true, validatedCleaned: true, validatedEquipmentOk: true }),
        { params: Promise.resolve({ id: "res-1" }) }
      );

      expect(res.status).toBe(200);
      expect(mockValidateChecklist).toHaveBeenCalledWith(
        expect.objectContaining({ reservationId: "res-1", validatedEquipmentOk: true })
      );
    });

    it("propagates 409 when the closing has not been declared yet", async () => {
      mockRequireAuth.mockResolvedValue(createSuperAdminSession());
      mockValidateChecklist.mockRejectedValue(new ApiError(409, "Cette main courante n'a pas encore de fermeture déclarée"));

      const res = await PATCH(
        patchRequest({ action: "validate", validatedClosedProperly: true, validatedCleaned: true, validatedEquipmentOk: true }),
        { params: Promise.resolve({ id: "res-1" }) }
      );

      expect(res.status).toBe(409);
    });
  });

  describe("action=report-issue", () => {
    it("allows a control-team department member (Sécurité/Entretien)", async () => {
      mockRequireAuth.mockResolvedValue(createSession({ isSuperAdmin: false, churchRoles: [] }));
      mockGetUserDepartmentScope.mockReturnValue({ scoped: true, departmentIds: ["dept-securite"] });
      mockIsControlTeamMember.mockResolvedValue(true);
      mockReportIssueWithoutDeclaration.mockResolvedValue({ status: "ISSUE_REPORTED" });

      const res = await PATCH(patchRequest({ action: "report-issue", incidentNotes: "Salle laissée en désordre" }), {
        params: Promise.resolve({ id: "res-1" }),
      });

      expect(res.status).toBe(200);
      expect(mockReportIssueWithoutDeclaration).toHaveBeenCalledWith(
        expect.objectContaining({ reservationId: "res-1", incidentNotes: "Salle laissée en désordre" })
      );
    });

    it("propagates 409 when the reservation is not past due", async () => {
      mockRequireAuth.mockResolvedValue(createSuperAdminSession());
      mockReportIssueWithoutDeclaration.mockRejectedValue(new ApiError(409, "Cette réservation n'est pas encore terminée"));

      const res = await PATCH(patchRequest({ action: "report-issue", incidentNotes: "Salle laissée en désordre" }), {
        params: Promise.resolve({ id: "res-1" }),
      });

      expect(res.status).toBe(409);
    });
  });

  describe("action=close-manually", () => {
    it("allows Super Admin and does not require incident notes", async () => {
      mockRequireAuth.mockResolvedValue(createSuperAdminSession());
      mockCloseWithoutDeclaration.mockResolvedValue({ status: "VALIDATED" });

      const res = await PATCH(patchRequest({ action: "close-manually" }), {
        params: Promise.resolve({ id: "res-1" }),
      });

      expect(res.status).toBe(200);
      expect(mockCloseWithoutDeclaration).toHaveBeenCalledWith(expect.objectContaining({ reservationId: "res-1" }));
    });

    it("returns 403 for an unrelated user", async () => {
      mockRequireAuth.mockResolvedValue(createSession({ isSuperAdmin: false, churchRoles: [] }));
      mockGetUserDepartmentScope.mockReturnValue({ scoped: true, departmentIds: ["dept-other"] });
      mockIsControlTeamMember.mockResolvedValue(false);

      const res = await PATCH(patchRequest({ action: "close-manually" }), {
        params: Promise.resolve({ id: "res-1" }),
      });

      expect(res.status).toBe(403);
      expect(mockCloseWithoutDeclaration).not.toHaveBeenCalled();
    });
  });
});
