/**
 * Test de non-régression (ex-`agenda/requests/__tests__/public-captcha.test.ts`, spec 052) :
 * la route publique consomme `verifyTurnstile` depuis `@/lib/turnstile`. Plus de jour préféré
 * dans le corps (retiré du dépôt, spec 052).
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

// `submitAppointmentRequest` est importé depuis l'index du module `@/modules/care` (ADR-0011),
// qui réexporte `auth.ts` — next-auth doit donc être mocké ici même si cette route publique
// n'utilise elle-même aucune garde de session (même besoin que pour tout autre test de route
// important un module via son index).
vi.mock("next-auth", () => ({
  default: () => ({ auth: vi.fn(), handlers: {}, signIn: vi.fn(), signOut: vi.fn() }),
}));

const { POST } = await import("../route");

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
  turnstileToken: "tok",
};

function post(body: unknown, ip: string) {
  return new Request("http://localhost/api/care/requests/public", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify(body),
  });
}

describe("POST /api/care/requests/public — CAPTCHA", () => {
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

  it("accepte un jeton valide", async () => {
    mockVerifyTurnstile.mockResolvedValue(true);

    const res = await POST(post(validBody, "198.51.100.2"));

    expect(res.status).toBe(201);
    expect(mockVerifyTurnstile).toHaveBeenCalledWith("tok", "198.51.100.2");
    expect(prismaMock.appointmentRequest.create).toHaveBeenCalledOnce();
  });

  it("rejette un jour préféré éventuel — le champ n'existe plus (spec 052)", async () => {
    mockVerifyTurnstile.mockResolvedValue(true);

    const res = await POST(post({ ...validBody, preferredDay: "Mardi" }, "198.51.100.3"));

    // Zod ignore silencieusement les clés inconnues : la création réussit toujours,
    // mais `preferredDays` n'est jamais écrit (vérifié ci-dessous).
    expect(res.status).toBe(201);
    const createCall = prismaMock.appointmentRequest.create.mock.calls.at(-1)?.[0];
    expect(createCall.data.preferredDays).toBeUndefined();
  });
});
