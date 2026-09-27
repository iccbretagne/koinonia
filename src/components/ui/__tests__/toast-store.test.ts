import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createToastStore,
  toastDuration,
  TOAST_DURATION_MS,
  TOAST_WITH_ACTION_DURATION_MS,
  type ToastStore,
} from "../toast-store";

describe("toastDuration", () => {
  it("4 s par défaut, 6 s avec une action, durée explicite prioritaire", () => {
    expect(toastDuration()).toBe(TOAST_DURATION_MS);
    expect(TOAST_DURATION_MS).toBe(4000);
    expect(toastDuration({ action: { label: "Annuler", onClick: () => {} } })).toBe(
      TOAST_WITH_ACTION_DURATION_MS,
    );
    expect(TOAST_WITH_ACTION_DURATION_MS).toBe(6000);
    expect(toastDuration({ duration: 1500 })).toBe(1500);
  });
});

describe("createToastStore", () => {
  let store: ToastStore;

  beforeEach(() => {
    vi.useFakeTimers();
    store = createToastStore({
      setTimeout: (fn, ms) => setTimeout(fn, ms),
      clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
      now: () => Date.now(),
    });
  });

  it("affiche un toast puis le retire après 4 s", () => {
    const listener = vi.fn();
    store.subscribe(listener);
    store.show("success", "Absence enregistrée");

    expect(store.getSnapshot()).toMatchObject({ tone: "success", message: "Absence enregistrée" });
    expect(listener).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(3999);
    expect(store.getSnapshot()).not.toBeNull();
    vi.advanceTimersByTime(1);
    expect(store.getSnapshot()).toBeNull();
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("un seul toast à la fois : le suivant remplace le précédent et repart pour sa durée", () => {
    const first = store.show("success", "Demande validée");
    vi.advanceTimersByTime(3000);
    const second = store.show("error", "Enregistrement impossible");

    expect(second).not.toBe(first);
    expect(store.getSnapshot()).toMatchObject({ id: second, tone: "error" });

    // La minuterie du premier ne ferme pas le second.
    vi.advanceTimersByTime(1000);
    expect(store.getSnapshot()?.id).toBe(second);
    vi.advanceTimersByTime(3000);
    expect(store.getSnapshot()).toBeNull();
  });

  it("garde un toast avec action 6 s", () => {
    store.show("success", "STAR retiré", { action: { label: "Annuler", onClick: () => {} } });
    vi.advanceTimersByTime(5999);
    expect(store.getSnapshot()).not.toBeNull();
    vi.advanceTimersByTime(1);
    expect(store.getSnapshot()).toBeNull();
  });

  it("suspend la minuterie au survol et reprend avec le temps restant", () => {
    store.show("success", "Absence enregistrée");
    vi.advanceTimersByTime(3000);
    store.pause();
    vi.advanceTimersByTime(60_000);
    expect(store.getSnapshot()).not.toBeNull();

    store.resume();
    vi.advanceTimersByTime(999);
    expect(store.getSnapshot()).not.toBeNull();
    vi.advanceTimersByTime(1);
    expect(store.getSnapshot()).toBeNull();
  });

  it("un toast arrivé pendant le survol attend la fin du survol puis dure sa durée complète", () => {
    store.show("success", "Premier");
    store.pause();
    store.show("success", "Second");
    vi.advanceTimersByTime(10_000);
    expect(store.getSnapshot()?.message).toBe("Second");

    store.resume();
    vi.advanceTimersByTime(3999);
    expect(store.getSnapshot()).not.toBeNull();
    vi.advanceTimersByTime(1);
    expect(store.getSnapshot()).toBeNull();
  });

  it("dismiss(id) ignore un toast déjà remplacé", () => {
    const first = store.show("success", "Premier");
    store.show("info", "Second");
    store.dismiss(first);
    expect(store.getSnapshot()?.message).toBe("Second");
    store.dismiss();
    expect(store.getSnapshot()).toBeNull();
  });

  it("se désabonne proprement", () => {
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    unsubscribe();
    store.show("success", "Absence enregistrée");
    expect(listener).not.toHaveBeenCalled();
  });
});
