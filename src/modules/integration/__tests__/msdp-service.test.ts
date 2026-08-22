import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";

const mockSendEmail = vi.fn();
const mockAuth = vi.fn();

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/email", () => ({
  sendEmail: (...args: unknown[]) => mockSendEmail(...args),
}));
vi.mock("next-auth", () => ({
  default: () => ({
    auth: mockAuth,
    handlers: {},
    signIn: vi.fn(),
    signOut: vi.fn(),
  }),
}));

const { buildMsdpCounselorNotifEmail, notifyMsdpCounselorAssigned } = await import(
  "../services/msdp-service"
);

describe("buildMsdpCounselorNotifEmail", () => {
  it("inclut le nom du conseiller, le nom de la personne suivie et le lien vers le suivi", () => {
    const html = buildMsdpCounselorNotifEmail({
      counselorName: "Jean Dupont",
      personName: "Marie Curie",
      requestId: "req-123",
      appUrl: "https://koinonia.example",
    });

    expect(html).toContain("Jean Dupont");
    expect(html).toContain("Marie Curie");
    expect(html).toContain("https://koinonia.example/admin/integration/requests/req-123");
  });
});

describe("notifyMsdpCounselorAssigned", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSendEmail.mockResolvedValue(undefined);
  });

  it("envoie un email quand le conseiller a une adresse email", async () => {
    prismaMock.notification.create.mockResolvedValue({} as never);
    prismaMock.user.findUnique.mockResolvedValue({
      name: "Jean Dupont",
      email: "jean@example.com",
    } as never);

    await notifyMsdpCounselorAssigned({
      counselorId: "u1",
      followUpId: "f1",
      requestId: "req-123",
      personName: "Marie Curie",
      appUrl: "https://koinonia.example",
    });

    expect(prismaMock.notification.create).toHaveBeenCalledTimes(1);
    expect(mockSendEmail).toHaveBeenCalledTimes(1);
    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "jean@example.com" })
    );
  });

  it("n'envoie pas d'email si le conseiller n'a pas d'adresse email, mais crée la notification in-app", async () => {
    prismaMock.notification.create.mockResolvedValue({} as never);
    prismaMock.user.findUnique.mockResolvedValue({
      name: "Jean Dupont",
      email: null,
    } as never);

    await notifyMsdpCounselorAssigned({
      counselorId: "u1",
      followUpId: "f1",
      requestId: "req-123",
      personName: "Marie Curie",
      appUrl: "https://koinonia.example",
    });

    expect(prismaMock.notification.create).toHaveBeenCalledTimes(1);
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("ne lève pas d'exception si l'envoi de l'email échoue", async () => {
    prismaMock.notification.create.mockResolvedValue({} as never);
    prismaMock.user.findUnique.mockResolvedValue({
      name: "Jean Dupont",
      email: "jean@example.com",
    } as never);
    mockSendEmail.mockRejectedValue(new Error("SMTP down"));

    await expect(
      notifyMsdpCounselorAssigned({
        counselorId: "u1",
        followUpId: "f1",
        requestId: "req-123",
        personName: "Marie Curie",
        appUrl: "https://koinonia.example",
      })
    ).resolves.toBeUndefined();
  });
});
