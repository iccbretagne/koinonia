/**
 * Test de non-regression — spec 030 : la route publique agenda consomme desormais
 * `verifyTurnstile` depuis `@/lib/turnstile` au lieu d'une copie locale. L'extraction devant
 * etre strictement iso-comportement, on verrouille ici son point le plus sensible : un jeton
 * refuse par Cloudflare bloque la soumission avant toute creation.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";

const mockVerifyTurnstile = vi.fn();
vi.mock("@/lib/turnstile", () => ({
  verifyTurnstile: (...args: unknown[]) => mockVerifyTurnstile(...args),
}));

const mockSendEmail = vi.fn();
vi.mock("@/lib/email", () => ({
  sendEmail: (...args: unknown[]) => mockSendEmail(...args),
  buildAppointmentConfirmationEmail: () => ({ subject: "Confirmation", html: "<p>ok</p>" }),
}));

vi.mock("@/lib/notifications", () => ({
  notifyUsersWithRole: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

const { POST } = await import("../public/route");

const validBody = {
  churchSlug: "icc-rennes",
  lastName: "Dupont",
  firstName: "Jean",
  gender: "Homme",
  phone: "0600000000",
  email: "jean@example.org",
  ageRange: "21-30 ans",
  membershipDuration: "1 à 2 ans",
  isStar: "Non",
  motifs: ["Renseignements"],
  preferredDay: "Mardi",
  turnstileToken: "tok",
};

function post(body: unknown, ip: string) {
  return new Request("http://localhost/api/agenda/requests/public", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify(body),
  });
}

describe("POST /api/agenda/requests/public — CAPTCHA mutualisé", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSendEmail.mockResolvedValue(undefined);
    prismaMock.church.findUnique.mockResolvedValue({ id: "church-1", name: "ICC Rennes" });
    prismaMock.appointmentRequest.create.mockResolvedValue({ id: "appt-1" });
  });

  it("refuse un jeton invalide sans rien créer", async () => {
    mockVerifyTurnstile.mockResolvedValue(false);

    const res = await POST(post(validBody, "198.51.100.1"));

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain("Vérification CAPTCHA échouée");
    expect(prismaMock.appointmentRequest.create).not.toHaveBeenCalled();
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("accepte un jeton valide comme avant la mutualisation", async () => {
    mockVerifyTurnstile.mockResolvedValue(true);

    const res = await POST(post(validBody, "198.51.100.2"));

    expect(res.status).toBe(201);
    expect(mockVerifyTurnstile).toHaveBeenCalledWith("tok", "198.51.100.2");
    expect(prismaMock.appointmentRequest.create).toHaveBeenCalledOnce();
  });
});
