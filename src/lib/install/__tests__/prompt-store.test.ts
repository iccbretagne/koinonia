import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  armInstallPrompt,
  getInstallPromptSnapshot,
  promptInstall,
  resetInstallPromptStore,
  subscribeInstallPrompt,
} from "../prompt-store";

function fakeWindow() {
  const handlers = new Map<string, (event: Event) => void>();
  return {
    addEventListener: vi.fn((type: string, handler: (event: Event) => void) => handlers.set(type, handler)),
    fire: (type: string, event: Event) => handlers.get(type)?.(event),
  };
}

function installEvent(outcome: "accepted" | "dismissed") {
  return Object.assign(new Event("beforeinstallprompt"), {
    preventDefault: vi.fn(),
    prompt: vi.fn().mockResolvedValue(undefined),
    userChoice: Promise.resolve({ outcome }),
  });
}

describe("fenêtre d'installation native (spec 070)", () => {
  beforeEach(() => resetInstallPromptStore());

  it("sans événement : rien à proposer", async () => {
    expect(getInstallPromptSnapshot()).toEqual({ canPrompt: false, installed: false });
    expect(await promptInstall()).toBe("unavailable");
  });

  it("capture l'événement, empêche la bannière du navigateur et prévient les abonnés", () => {
    const win = fakeWindow();
    armInstallPrompt(win as unknown as Window);
    const listener = vi.fn();
    subscribeInstallPrompt(listener);
    const event = installEvent("accepted");
    win.fire("beforeinstallprompt", event);
    expect(event.preventDefault).toHaveBeenCalled();
    expect(getInstallPromptSnapshot().canPrompt).toBe(true);
    expect(listener).toHaveBeenCalled();
  });

  it("installation acceptée", async () => {
    const win = fakeWindow();
    armInstallPrompt(win as unknown as Window);
    const event = installEvent("accepted");
    win.fire("beforeinstallprompt", event);
    expect(await promptInstall()).toBe("accepted");
    expect(event.prompt).toHaveBeenCalledTimes(1);
    expect(getInstallPromptSnapshot()).toEqual({ canPrompt: false, installed: true });
    expect(await promptInstall()).toBe("unavailable");
  });

  it("installation refusée : plus de fenêtre native, rien d'installé", async () => {
    const win = fakeWindow();
    armInstallPrompt(win as unknown as Window);
    win.fire("beforeinstallprompt", installEvent("dismissed"));
    expect(await promptInstall()).toBe("dismissed");
    expect(getInstallPromptSnapshot()).toEqual({ canPrompt: false, installed: false });
  });

  it("appinstalled marque l'application installée", () => {
    const win = fakeWindow();
    armInstallPrompt(win as unknown as Window);
    win.fire("beforeinstallprompt", installEvent("accepted"));
    win.fire("appinstalled", new Event("appinstalled"));
    expect(getInstallPromptSnapshot()).toEqual({ canPrompt: false, installed: true });
  });

  it("armement idempotent", () => {
    const win = fakeWindow();
    armInstallPrompt(win as unknown as Window);
    armInstallPrompt(win as unknown as Window);
    expect(win.addEventListener).toHaveBeenCalledTimes(2);
  });
});
