import { describe, it, expect, vi } from "vitest";
import { handleIntegrationSubmitted } from "../services/intake";

function makeTx() {
  return {
    appointmentRequest: { upsert: vi.fn().mockResolvedValue({ id: "appt-1" }) },
    msdpFollowUp: { upsert: vi.fn().mockResolvedValue({ id: "followup-1" }) },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

const basePayload = {
  requestId: "integration-req-1",
  churchId: "church-1",
  firstName: "Jean",
  lastName: "Dupont",
  phone: "0600000000",
  email: "jean@example.org",
  personJourneyId: "journey-1",
};

describe("handleIntegrationSubmitted", () => {
  it("appel au salut (sans soin pastoral) crée un suivi, pas de demande de RDV", async () => {
    const tx = makeTx();
    await handleIntegrationSubmitted(tx, { ...basePayload, salvationCall: true, pastoralCare: null });

    expect(tx.msdpFollowUp.upsert).toHaveBeenCalledOnce();
    expect(tx.appointmentRequest.upsert).not.toHaveBeenCalled();

    const call = tx.msdpFollowUp.upsert.mock.calls[0][0];
    expect(call.where).toEqual({ requestId: "integration-req-1" });
    expect(call.create.firstName).toBe("Jean");
    expect(call.create.personJourneyId).toBe("journey-1");
  });

  it("soin pastoral (sans appel au salut) crée une demande de RDV, pas de suivi", async () => {
    const tx = makeTx();
    await handleIntegrationSubmitted(tx, {
      ...basePayload,
      salvationCall: false,
      pastoralCare: { message: "Besoin d'un accompagnement." },
    });

    expect(tx.appointmentRequest.upsert).toHaveBeenCalledOnce();
    expect(tx.msdpFollowUp.upsert).not.toHaveBeenCalled();

    const call = tx.appointmentRequest.upsert.mock.calls[0][0];
    expect(call.where).toEqual({ sourceIntegrationRequestId: "integration-req-1" });
    expect(call.create.message).toBe("Besoin d'un accompagnement.");
    expect(call.create.personJourneyId).toBe("journey-1");
  });

  it("appel au salut ET soin pastoral crée les deux, rattachés au même dossier de parcours", async () => {
    const tx = makeTx();
    await handleIntegrationSubmitted(tx, {
      ...basePayload,
      salvationCall: true,
      pastoralCare: { message: "Besoin d'un accompagnement." },
    });

    expect(tx.appointmentRequest.upsert).toHaveBeenCalledOnce();
    expect(tx.msdpFollowUp.upsert).toHaveBeenCalledOnce();
  });

  it("ni appel au salut ni soin pastoral ne crée rien", async () => {
    const tx = makeTx();
    await handleIntegrationSubmitted(tx, { ...basePayload, salvationCall: false, pastoralCare: null });

    expect(tx.appointmentRequest.upsert).not.toHaveBeenCalled();
    expect(tx.msdpFollowUp.upsert).not.toHaveBeenCalled();
  });

  it("idempotent : double émission interroge l'upsert avec le même identifiant unique et un update vide (une seule création en base)", async () => {
    const tx = makeTx();
    const payload = { ...basePayload, salvationCall: true, pastoralCare: { message: "Message." } };

    await handleIntegrationSubmitted(tx, payload);
    await handleIntegrationSubmitted(tx, payload);

    expect(tx.appointmentRequest.upsert).toHaveBeenCalledTimes(2);
    expect(tx.msdpFollowUp.upsert).toHaveBeenCalledTimes(2);
    for (const call of tx.appointmentRequest.upsert.mock.calls) {
      expect(call[0].where).toEqual({ sourceIntegrationRequestId: "integration-req-1" });
      expect(call[0].update).toEqual({});
    }
    for (const call of tx.msdpFollowUp.upsert.mock.calls) {
      expect(call[0].where).toEqual({ requestId: "integration-req-1" });
      expect(call[0].update).toEqual({});
    }
  });

  it("personJourneyId absent (dédup silencieux du dossier de parcours) n'empêche pas la création", async () => {
    const tx = makeTx();
    await handleIntegrationSubmitted(tx, {
      ...basePayload,
      personJourneyId: null,
      salvationCall: true,
      pastoralCare: null,
    });

    expect(tx.msdpFollowUp.upsert).toHaveBeenCalledOnce();
    expect(tx.msdpFollowUp.upsert.mock.calls[0][0].create.personJourneyId).toBeNull();
  });
});
