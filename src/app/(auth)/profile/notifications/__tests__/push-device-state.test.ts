import { describe, it, expect } from "vitest";
import { detectIos, pushDeviceState, urlBase64ToUint8Array, type PushDeviceEnvironment } from "../push-device-state";

const desktop: PushDeviceEnvironment = {
  configured: true,
  hasServiceWorker: true,
  hasPushManager: true,
  isIos: false,
  isStandalone: false,
  permission: "default",
  subscribed: false,
};

describe("pushDeviceState (spec 068)", () => {
  it("non activées : navigateur compatible, pas encore abonné", () => {
    expect(pushDeviceState(desktop)).toBe("disabled");
  });
  it("activées : autorisation accordée et abonnement actif", () => {
    expect(pushDeviceState({ ...desktop, permission: "granted", subscribed: true })).toBe("enabled");
  });
  it("autorisation accordée mais abonnement perdu : à réactiver", () => {
    expect(pushDeviceState({ ...desktop, permission: "granted", subscribed: false })).toBe("disabled");
  });
  it("bloquées : autorisation refusée", () => {
    expect(pushDeviceState({ ...desktop, permission: "denied" })).toBe("blocked");
  });
  it("iPhone non installé : guide d'installation, même si Safari expose l'API", () => {
    expect(pushDeviceState({ ...desktop, isIos: true, isStandalone: false })).toBe("unavailable-ios-install");
  });
  it("iPhone installé : comme un autre appareil", () => {
    expect(pushDeviceState({ ...desktop, isIos: true, isStandalone: true })).toBe("disabled");
  });
  it("navigateur sans Push API", () => {
    expect(pushDeviceState({ ...desktop, hasPushManager: false })).toBe("unavailable-browser");
    expect(pushDeviceState({ ...desktop, permission: "unsupported" })).toBe("unavailable-browser");
  });
  it("instance sans clés VAPID", () => {
    expect(pushDeviceState({ ...desktop, configured: false })).toBe("unavailable-instance");
  });
});

describe("detectIos", () => {
  it("iPhone, iPad et iPadOS se présentant comme un Mac tactile", () => {
    expect(detectIos("Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X)", 5)).toBe(true);
    expect(detectIos("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", 5)).toBe(true);
    expect(detectIos("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", 0)).toBe(false);
    expect(detectIos("Mozilla/5.0 (Linux; Android 14)", 5)).toBe(false);
  });
});

describe("urlBase64ToUint8Array", () => {
  it("décode le base64url sans remplissage", () => {
    expect(Array.from(urlBase64ToUint8Array("AQID_-8"))).toEqual([1, 2, 3, 255, 239]);
  });
});
