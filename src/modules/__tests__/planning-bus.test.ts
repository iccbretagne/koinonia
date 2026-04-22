import { describe, it, expect, vi, beforeEach } from "vitest";
import { EventBus } from "@/core/event-bus";
import { planningBus } from "@/modules/planning";
import type { PlanningEvents } from "@/modules/planning";
import type { Prisma } from "@/generated/prisma/client";

/** Contexte minimal pour les tests — tx est un mock. */
function fakeCtx(churchId = "church-1", userId = "user-1") {
  return {
    tx: {} as Prisma.TransactionClient,
    churchId,
    userId,
  };
}

describe("planningBus", () => {
  beforeEach(() => {
    planningBus.clear();
  });

  it("est une instance de EventBus", () => {
    expect(planningBus).toBeInstanceOf(EventBus);
  });

  it("émet planning:event:created aux handlers enregistrés", async () => {
    const handler = vi.fn();
    planningBus.on("planning:event:created", handler);

    const payload: PlanningEvents["planning:event:created"] = {
      eventId: "evt-1",
      churchId: "church-1",
      title: "Culte du dimanche",
      type: "CULTE",
      createdById: "user-1",
      isRecurrenceParent: false,
    };

    const ctx = fakeCtx();
    await planningBus.emit("planning:event:created", ctx, payload);

    expect(handler).toHaveBeenCalledOnce();
    expect(handler).toHaveBeenCalledWith(ctx, payload);
  });

  it("émet planning:event:created avec childCount pour une série récurrente", async () => {
    const captured: PlanningEvents["planning:event:created"][] = [];
    planningBus.on("planning:event:created", async (_ctx, payload) => {
      captured.push(payload);
    });

    await planningBus.emit(
      "planning:event:created",
      fakeCtx(),
      {
        eventId: "evt-parent",
        churchId: "church-1",
        title: "Culte hebdo",
        type: "CULTE",
        createdById: "user-1",
        isRecurrenceParent: true,
        childCount: 51,
      }
    );

    expect(captured).toHaveLength(1);
    expect(captured[0].isRecurrenceParent).toBe(true);
    expect(captured[0].childCount).toBe(51);
  });

  it("émet planning:request:executed", async () => {
    const handler = vi.fn();
    planningBus.on("planning:request:executed", handler);

    await planningBus.emit(
      "planning:request:executed",
      fakeCtx(),
      {
        requestId: "req-1",
        requestType: "AJOUT_EVENEMENT",
        churchId: "church-1",
        executedById: "user-1",
        resourceId: "evt-2",
      }
    );

    expect(handler).toHaveBeenCalledOnce();
  });

  it("un handler qui throw interrompt la chaîne et remonte l'erreur", async () => {
    planningBus.on("planning:event:created", async () => {
      throw new Error("handler error");
    });
    const secondHandler = vi.fn();
    planningBus.on("planning:event:created", secondHandler);

    await expect(
      planningBus.emit("planning:event:created", fakeCtx(), {
        eventId: "e",
        churchId: "c",
        title: "T",
        type: "CULTE",
        createdById: "u",
        isRecurrenceParent: false,
      })
    ).rejects.toThrow("handler error");

    // Second handler not reached
    expect(secondHandler).not.toHaveBeenCalled();
  });

  it("listenerCount retourne 0 sans handlers enregistrés", () => {
    expect(planningBus.listenerCount("planning:event:created")).toBe(0);
  });

  it("listenerCount retourne le nombre correct après enregistrement", () => {
    planningBus.on("planning:event:created", vi.fn());
    planningBus.on("planning:event:created", vi.fn());
    expect(planningBus.listenerCount("planning:event:created")).toBe(2);
  });
});
