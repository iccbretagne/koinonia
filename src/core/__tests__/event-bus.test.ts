import { describe, it, expect, vi } from "vitest";
import { EventBus, type EventContext } from "../event-bus";

interface TestEvents extends Record<string, unknown> {
  "request.created": { requestId: string; type: string };
  "project.approved": { projectId: string };
}

const fakeCtx: EventContext = {
  tx: {} as EventContext["tx"],
  churchId: "church-1",
  userId: "user-1",
};

describe("EventBus", () => {
  it("invoque les handlers enregistrés dans l'ordre", async () => {
    const bus = new EventBus<TestEvents>();
    const calls: string[] = [];

    bus.on("request.created", async () => { calls.push("a"); });
    bus.on("request.created", async () => { calls.push("b"); });
    bus.on("request.created", async () => { calls.push("c"); });

    await bus.emit("request.created", fakeCtx, { requestId: "r1", type: "VISUEL" });
    expect(calls).toEqual(["a", "b", "c"]);
  });

  it("passe le payload typé au handler", async () => {
    const bus = new EventBus<TestEvents>();
    const handler = vi.fn(async () => {});
    bus.on("request.created", handler);

    await bus.emit("request.created", fakeCtx, { requestId: "r1", type: "VISUEL" });
    expect(handler).toHaveBeenCalledWith(fakeCtx, { requestId: "r1", type: "VISUEL" });
  });

  it("n'invoque aucun handler pour un événement sans listener", async () => {
    const bus = new EventBus<TestEvents>();
    // ne throw pas
    await expect(
      bus.emit("project.approved", fakeCtx, { projectId: "p1" })
    ).resolves.toBeUndefined();
  });

  it("propage l'erreur d'un handler et interrompt l'émission", async () => {
    const bus = new EventBus<TestEvents>();
    const calls: string[] = [];

    bus.on("request.created", async () => { calls.push("a"); });
    bus.on("request.created", async () => { throw new Error("boom"); });
    bus.on("request.created", async () => { calls.push("c"); });

    await expect(
      bus.emit("request.created", fakeCtx, { requestId: "r1", type: "VISUEL" })
    ).rejects.toThrow("boom");
    expect(calls).toEqual(["a"]); // "c" n'est jamais appelé
  });

  it("listenerCount et clear", () => {
    const bus = new EventBus<TestEvents>();
    bus.on("request.created", async () => {});
    bus.on("request.created", async () => {});
    expect(bus.listenerCount("request.created")).toBe(2);
    expect(bus.listenerCount("project.approved")).toBe(0);

    bus.clear();
    expect(bus.listenerCount("request.created")).toBe(0);
  });
});
