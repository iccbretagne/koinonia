import { describe, it, expect, vi, beforeEach } from "vitest";

const sendEmail = vi.fn();
vi.mock("@/lib/email", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/email")>();
  return { ...actual, sendEmail: (...args: unknown[]) => sendEmail(...args) };
});
const notifyUsersWithRole = vi.fn();
vi.mock("@/lib/notifications", () => ({
  notifyUsersWithRole: (...args: unknown[]) => notifyUsersWithRole(...args),
}));
const loggerError = vi.fn();
vi.mock("@/lib/logger", () => ({ logger: { error: (...args: unknown[]) => loggerError(...args) } }));

const { alertPaymentDetailsChange } = await import("../services/alerts");

const changes = [{ label: "IBAN", before: "FR76 3000 6000 0112 3456 7890 189", after: "DE89 3704 0044 0532 0130 00" }];
const actor = { id: "user-1", name: "Marie" };
const church = (accountingEmails: string | null) => ({ id: "church-1", name: "ICC Rennes", accountingEmails });

describe("alertPaymentDetailsChange (spec 065)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("envoie à la comptabilité les anciennes et nouvelles valeurs", async () => {
    await alertPaymentDetailsChange(church("compta@icc.fr, tresor@icc.fr"), changes, actor);
    expect(sendEmail).toHaveBeenCalledTimes(1);
    const mail = sendEmail.mock.calls[0][0];
    expect(mail.to).toEqual(["compta@icc.fr", "tresor@icc.fr"]);
    expect(mail.html).toContain("FR76 3000 6000 0112 3456 7890 189");
    expect(mail.html).toContain("DE89 3704 0044 0532 0130 00");
    expect(mail.html).toContain("Marie");
    expect(notifyUsersWithRole).not.toHaveBeenCalled();
  });

  it("sans adresse comptable, notifie les Admins dans le domaine giving", async () => {
    await alertPaymentDetailsChange(church(null), changes, actor);
    expect(sendEmail).not.toHaveBeenCalled();
    expect(notifyUsersWithRole).toHaveBeenCalledWith(
      "church-1",
      "ADMIN",
      expect.objectContaining({ domain: "giving", type: "GIVING_PAYMENT_DETAILS_CHANGED", link: "/dons" }),
      expect.objectContaining({ email: expect.objectContaining({ subject: expect.any(String) }) })
    );
  });

  it("ne propage pas un échec d'envoi", async () => {
    sendEmail.mockRejectedValueOnce(new Error("SMTP down"));
    await expect(alertPaymentDetailsChange(church("compta@icc.fr"), changes, actor)).resolves.toBeUndefined();
    expect(loggerError).toHaveBeenCalled();
  });

  it("rien à signaler : aucun envoi", async () => {
    await alertPaymentDetailsChange(church("compta@icc.fr"), [], actor);
    expect(sendEmail).not.toHaveBeenCalled();
    expect(notifyUsersWithRole).not.toHaveBeenCalled();
  });
});
