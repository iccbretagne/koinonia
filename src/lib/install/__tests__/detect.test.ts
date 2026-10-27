import { describe, it, expect } from "vitest";
import {
  detectBrowser,
  detectPlatform,
  installHint,
  installTarget,
  isInstallOffered,
  isNativePrompt,
  type InstallTarget,
} from "../detect";

const UA = {
  iphoneSafari:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
  iphoneChrome:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.6478.54 Mobile/15E148 Safari/604.1",
  iphoneFirefox:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/127.0 Mobile/15E148 Safari/605.1.15",
  iphoneWhatsApp:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 WhatsApp/24.12.78",
  ipadAsMac:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15",
  androidChrome:
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.6478.71 Mobile Safari/537.36",
  androidSamsung:
    "Mozilla/5.0 (Linux; Android 14; SM-S911B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0.0.0 Mobile Safari/537.36",
  androidWhatsApp:
    "Mozilla/5.0 (Linux; Android 14; SM-S911B; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/126.0.6478.71 Mobile Safari/537.36",
  androidFacebook:
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.6478.71 Mobile Safari/537.36 [FBAN/EMA;FBLC/fr_FR;FBAV/400.0.0.0;]",
  windowsChrome:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  windowsEdge:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.2592.68",
  macSafari:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15",
  firefox: "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:127.0) Gecko/20100101 Firefox/127.0",
};

function target(ua: string, opts: { touch?: number; standalone?: boolean; canPrompt?: boolean } = {}): InstallTarget {
  return installTarget({
    platform: detectPlatform(ua, opts.touch ?? 0),
    browser: detectBrowser(ua),
    standalone: opts.standalone ?? false,
    canPrompt: opts.canPrompt ?? false,
  });
}

describe("installation de l'application (spec 070)", () => {
  it.each([
    ["iPhone Safari", UA.iphoneSafari, {}, "ios-safari"],
    ["iPhone Chrome", UA.iphoneChrome, {}, "ios-open-in-safari"],
    ["iPhone Firefox", UA.iphoneFirefox, {}, "ios-open-in-safari"],
    ["iPhone WhatsApp", UA.iphoneWhatsApp, {}, "ios-open-in-safari"],
    ["iPad présenté comme un Mac", UA.ipadAsMac, { touch: 5 }, "ios-safari"],
    ["Android Chrome avec installation native", UA.androidChrome, { canPrompt: true }, "android-prompt"],
    ["Android Chrome sans installation native", UA.androidChrome, {}, "android-manual"],
    ["Android Samsung Internet", UA.androidSamsung, {}, "android-manual"],
    ["Android WhatsApp (WebView)", UA.androidWhatsApp, {}, "android-open-in-chrome"],
    ["Android Facebook", UA.androidFacebook, {}, "android-open-in-chrome"],
    ["Windows Chrome avec installation native", UA.windowsChrome, { canPrompt: true }, "desktop-prompt"],
    ["Windows Edge sans installation native", UA.windowsEdge, {}, "desktop-manual"],
    ["macOS Safari", UA.macSafari, {}, "unsupported"],
    ["Firefox", UA.firefox, {}, "unsupported"],
    ["application déjà installée", UA.androidChrome, { standalone: true, canPrompt: true }, "installed"],
    ["application installée sur iPhone", UA.iphoneSafari, { standalone: true }, "installed"],
  ] as const)("%s → %s", (_label, ua, opts, expected) => {
    expect(target(ua, opts)).toBe(expected);
  });

  it("navigateurs reconnus", () => {
    expect(detectBrowser(UA.windowsEdge)).toBe("edge");
    expect(detectBrowser(UA.androidSamsung)).toBe("samsung");
    expect(detectBrowser(UA.iphoneChrome)).toBe("ios-other");
    expect(detectBrowser(UA.iphoneWhatsApp)).toBe("in-app");
  });

  it("installation proposée sauf si installée ou impossible", () => {
    expect(isInstallOffered("installed")).toBe(false);
    expect(isInstallOffered("unsupported")).toBe(false);
    expect(isInstallOffered("ios-open-in-safari")).toBe(true);
    expect(isInstallOffered("desktop-manual")).toBe(true);
  });

  it("fenêtre native seulement quand le navigateur la propose", () => {
    expect(isNativePrompt("android-prompt")).toBe(true);
    expect(isNativePrompt("desktop-prompt")).toBe(true);
    expect(isNativePrompt("android-manual")).toBe(false);
    expect(isNativePrompt("ios-safari")).toBe(false);
  });

  it("sous-titre du menu du compte selon l'appareil", () => {
    expect(installHint("ios-safari")).toBe("Sur l'écran d'accueil de votre iPhone");
    expect(installHint("android-prompt")).toBe("En un appui sur ce téléphone");
    expect(installHint("desktop-manual")).toBe("Sur cet ordinateur");
  });
});
