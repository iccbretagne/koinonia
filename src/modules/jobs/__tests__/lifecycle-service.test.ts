import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";

const mockSendEmail = vi.fn();
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/email", () => ({
  sendEmail: (...args: unknown[]) => mockSendEmail(...args),
  buildJobOfferRenewalEmail: vi.fn().mockReturnValue({ subject: "s", html: "h" }),
}));

const { runJobOffersLifecycle } = await import("../services/lifecycle-service");

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000);

function offer(overrides: Record<string, unknown> = {}) {
  return {
    id: "o1",
    title: "Dev",
    company: "ACME",
    status: "PUBLISHED",
    deadline: null,
    renewalRequestedAt: null,
    updatedAt: daysAgo(90),
    authorId: "u1",
    author: { id: "u1", name: "Alice", displayName: null, email: "alice@example.com" },
    ...overrides,
  };
}

describe("runJobOffersLifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SMTP_HOST = "smtp.example.com";
    prismaMock.jobOffer.updateMany.mockResolvedValue({ count: 0 } as never);
    prismaMock.jobOffer.findMany.mockResolvedValue([] as never);
    prismaMock.jobOffer.update.mockResolvedValue({} as never);
    prismaMock.notification.create.mockResolvedValue({} as never);
  });

  it("passe 1 : archivage — cible les offres PUBLISHED relancées depuis >14j OU à deadline dépassée", async () => {
    await runJobOffersLifecycle("http://app");
    const where = prismaMock.jobOffer.updateMany.mock.calls[0][0].where;
    expect(where.status).toBe("PUBLISHED");
    expect(where.OR).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ renewalRequestedAt: expect.objectContaining({ lt: expect.any(Date) }) }),
        expect.objectContaining({ deadline: expect.objectContaining({ lt: expect.any(Date) }) }),
      ])
    );
    expect(prismaMock.jobOffer.updateMany.mock.calls[0][0].data).toEqual({ status: "ARCHIVED" });
  });

  it("passe 2 : ne relance pas une offre publiée depuis <60j (filtre updatedAt)", async () => {
    // findMany renvoie [] car la requête filtre updatedAt < now-60j : on vérifie le filtre.
    await runJobOffersLifecycle("http://app");
    const where = prismaMock.jobOffer.findMany.mock.calls[0][0].where;
    expect(where.status).toBe("PUBLISHED");
    expect(where.renewalRequestedAt).toBeNull();
    expect(where.updatedAt).toEqual(expect.objectContaining({ lt: expect.any(Date) }));
  });

  it("relance une offre inactive >60j : pose renewalRequestedAt, crée la notif, tente l'email", async () => {
    prismaMock.jobOffer.findMany.mockResolvedValue([offer()] as never);

    const res = await runJobOffersLifecycle("http://app");

    expect(prismaMock.jobOffer.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "o1" }, data: { renewalRequestedAt: expect.any(Date) } })
    );
    expect(prismaMock.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ userId: "u1", type: "JOB_OFFER_RENEWAL", link: "/jobs/o1" }) })
    );
    expect(mockSendEmail).toHaveBeenCalledTimes(1);
    expect(res).toEqual({ archived: 0, renewalsSent: 1, emailFailures: 0 });
  });

  it("un échec d'email n'interrompt pas la boucle et n'empêche pas la pose de renewalRequestedAt", async () => {
    prismaMock.jobOffer.findMany.mockResolvedValue([
      offer({ id: "o1", authorId: "u1" }),
      offer({ id: "o2", authorId: "u2", author: { id: "u2", name: "Bob", displayName: null, email: "bob@example.com" } }),
    ] as never);
    mockSendEmail.mockRejectedValueOnce(new Error("SMTP down"));

    const res = await runJobOffersLifecycle("http://app");

    expect(prismaMock.jobOffer.update).toHaveBeenCalledTimes(2); // les 2 offres marquées
    expect(mockSendEmail).toHaveBeenCalledTimes(2); // la 2e est bien tentée malgré l'échec de la 1re
    expect(res).toEqual({ archived: 0, renewalsSent: 2, emailFailures: 1 });
  });

  it("auteur sans email : notification créée quand même, aucun envoi", async () => {
    prismaMock.jobOffer.findMany.mockResolvedValue([
      offer({ author: { id: "u1", name: "Alice", displayName: null, email: null } }),
    ] as never);

    const res = await runJobOffersLifecycle("http://app");

    expect(prismaMock.notification.create).toHaveBeenCalledTimes(1);
    expect(mockSendEmail).not.toHaveBeenCalled();
    expect(res.renewalsSent).toBe(1);
  });

  it("les compteurs retournés reflètent les actions réelles", async () => {
    prismaMock.jobOffer.updateMany.mockResolvedValue({ count: 3 } as never);
    prismaMock.jobOffer.findMany.mockResolvedValue([offer(), offer({ id: "o2" })] as never);

    const res = await runJobOffersLifecycle("http://app");
    expect(res).toEqual({ archived: 3, renewalsSent: 2, emailFailures: 0 });
  });

  it("archivage exécuté avant relance : une offre déjà éligible à l'archivage n'est pas dans le lot de relance", async () => {
    // Vérifie l'ordre : updateMany (archivage) est appelé avant findMany (relance).
    const order: string[] = [];
    prismaMock.jobOffer.updateMany.mockImplementation(async () => { order.push("archive"); return { count: 1 } as never; });
    prismaMock.jobOffer.findMany.mockImplementation(async () => { order.push("renew"); return [] as never; });

    await runJobOffersLifecycle("http://app");
    expect(order).toEqual(["archive", "renew"]);
  });
});
