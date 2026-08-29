/**
 * Tests — spec 030 : preuve d'humanite sur POST /api/integration/requests.
 *
 * Le critere central de la spec n'est pas seulement « la soumission est refusee », c'est
 * « refusee SANS effet de bord » : pas de geocodage externe, pas d'ecriture en base, pas
 * d'email vers une adresse choisie par l'appelant. Chaque cas de refus verifie donc ces
 * trois absences, et pas uniquement le code HTTP.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";

const mockVerifyTurnstile = vi.fn();
vi.mock("@/lib/turnstile", () => ({
  verifyTurnstile: (...args: unknown[]) => mockVerifyTurnstile(...args),
}));

const mockGeocodeAddress = vi.fn();
const mockFindFamilyByCoords = vi.fn();
vi.mock("@/lib/family-geo", () => ({
  geocodeAddress: (...args: unknown[]) => mockGeocodeAddress(...args),
  findFamilyByCoords: (...args: unknown[]) => mockFindFamilyByCoords(...args),
}));

const mockSendEmail = vi.fn();
vi.mock("@/lib/email", () => ({
  sendEmail: (...args: unknown[]) => mockSendEmail(...args),
}));

vi.mock("@/modules/integration", () => ({
  requireIntegrationAccess: vi.fn(),
  buildConfirmationEmail: () => "<p>ok</p>",
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

const { POST } = await import("../route");

const validBody = {
  firstName: "Jean",
  lastName: "Dupont",
  email: "jean@example.org",
  phone: "0600000000",
  address: "1 rue de l'Église, Rennes",
  ageRange: "ADULT",
  churchStatus: "VISITOR",
  pastoralCareRequested: false,
  salvationCall: false,
  churchId: "church-1",
  turnstileToken: "tok-valide",
};

function post(body: unknown, ip = "203.0.113.1") {
  return new Request("http://localhost/api/integration/requests", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify(body),
  });
}

function expectNoSideEffect() {
  expect(mockGeocodeAddress).not.toHaveBeenCalled();
  expect(mockSendEmail).not.toHaveBeenCalled();
  expect(prismaMock.familyIntegrationRequest.create).not.toHaveBeenCalled();
  expect(prismaMock.personJourney.create).not.toHaveBeenCalled();
  expect(prismaMock.appointmentRequest.create).not.toHaveBeenCalled();
}

describe("POST /api/integration/requests — CAPTCHA", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.church.findUnique.mockResolvedValue({ id: "church-1", name: "ICC Rennes" });
    mockGeocodeAddress.mockResolvedValue(null);
    mockSendEmail.mockResolvedValue(undefined);
    prismaMock.familyIntegrationRequest.create.mockResolvedValue({ id: "fir-1" });
    prismaMock.personJourney.create.mockResolvedValue({ id: "pj-1" });
  });

  it("refuse une soumission sans jeton, sans aucun effet de bord", async () => {
    const { turnstileToken: _omit, ...withoutToken } = validBody;
    const res = await POST(post(withoutToken, "203.0.113.10"));

    expect(res.status).toBe(400);
    expect(mockVerifyTurnstile).not.toHaveBeenCalled();
    expectNoSideEffect();
  });

  it("refuse un jeton invalide avec le message attendu, sans aucun effet de bord", async () => {
    mockVerifyTurnstile.mockResolvedValue(false);

    const res = await POST(post(validBody, "203.0.113.11"));

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain("Vérification CAPTCHA échouée");
    expectNoSideEffect();
  });

  it("verifie le jeton avant meme de chercher l'eglise", async () => {
    mockVerifyTurnstile.mockResolvedValue(false);

    await POST(post(validBody, "203.0.113.12"));

    expect(prismaMock.church.findUnique).not.toHaveBeenCalled();
  });

  it("laisse passer le parcours nominal quand le jeton est valide", async () => {
    mockVerifyTurnstile.mockResolvedValue(true);

    const res = await POST(post(validBody, "203.0.113.13"));

    expect(res.status).toBe(201);
    expect(mockVerifyTurnstile).toHaveBeenCalledWith("tok-valide", "203.0.113.13");
    expect(prismaMock.familyIntegrationRequest.create).toHaveBeenCalledOnce();
    expect(mockSendEmail).toHaveBeenCalledOnce();
  });
});
