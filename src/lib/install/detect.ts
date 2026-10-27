/**
 * Installer Koinonia sur son appareil (spec 070) : reconnaissance de l'appareil et du navigateur.
 * Fonctions pures, sans DOM : les signaux sont lus par l'appelant, ce qui les rend testables.
 */

export type InstallPlatform = "ios" | "android" | "desktop";

export type InstallBrowser =
  | "safari"
  | "chrome"
  | "edge"
  | "samsung"
  | "firefox"
  /** Navigateur intégré à une application (WhatsApp, Facebook, Instagram…). */
  | "in-app"
  /** Chrome, Firefox ou Edge sur iPhone : ils ne peuvent pas installer. */
  | "ios-other"
  | "other";

export type InstallTarget =
  | "installed"
  | "ios-safari"
  | "ios-open-in-safari"
  | "android-prompt"
  | "android-manual"
  | "android-open-in-chrome"
  | "desktop-prompt"
  | "desktop-manual"
  | "unsupported";

/** iPhone ou iPad, y compris l'iPad que Safari présente comme un Mac tactile. */
export function detectIos(userAgent: string, maxTouchPoints: number): boolean {
  return /iPhone|iPad|iPod/.test(userAgent) || (/Macintosh/.test(userAgent) && maxTouchPoints > 1);
}

export function detectPlatform(userAgent: string, maxTouchPoints: number): InstallPlatform {
  if (detectIos(userAgent, maxTouchPoints)) return "ios";
  if (/Android/i.test(userAgent)) return "android";
  return "desktop";
}

const IN_APP = /FBAN|FBAV|FB_IAB|Instagram|WhatsApp|Messenger|Line\/|Snapchat|TikTok|; wv\)/;

export function detectBrowser(userAgent: string): InstallBrowser {
  if (IN_APP.test(userAgent)) return "in-app";
  if (/CriOS|FxiOS|EdgiOS|OPiOS/.test(userAgent)) return "ios-other";
  if (/SamsungBrowser/.test(userAgent)) return "samsung";
  if (/Edg\//.test(userAgent)) return "edge";
  if (/Firefox\//.test(userAgent)) return "firefox";
  if (/OPR\//.test(userAgent)) return "other";
  if (/Chrome\//.test(userAgent)) return "chrome";
  if (/Safari\//.test(userAgent)) return "safari";
  return "other";
}

export interface InstallEnvironment {
  platform: InstallPlatform;
  browser: InstallBrowser;
  /** Koinonia déjà ouverte comme application installée. */
  standalone: boolean;
  /** Le navigateur a proposé l'installation native (`beforeinstallprompt`). */
  canPrompt: boolean;
}

/** Situation de l'appareil parmi celles de la spec, avec repli sur les étapes manuelles. */
export function installTarget({ platform, browser, standalone, canPrompt }: InstallEnvironment): InstallTarget {
  if (standalone) return "installed";
  if (platform === "ios") return browser === "safari" ? "ios-safari" : "ios-open-in-safari";
  if (platform === "android") {
    if (canPrompt) return "android-prompt";
    // Un navigateur intégré n'installe pas, même s'il prétend être Chrome.
    return browser === "in-app" ? "android-open-in-chrome" : "android-manual";
  }
  if (canPrompt) return "desktop-prompt";
  return browser === "chrome" || browser === "edge" ? "desktop-manual" : "unsupported";
}

/** L'installation a un sens sur cet appareil (carte d'Accueil, ligne du menu du compte). */
export function isInstallOffered(target: InstallTarget): boolean {
  return target !== "installed" && target !== "unsupported";
}

/** L'appui ouvre directement la fenêtre d'installation du système. */
export function isNativePrompt(target: InstallTarget): boolean {
  return target === "android-prompt" || target === "desktop-prompt";
}

/** Sous-titre de la ligne « Installer l'application » du menu du compte. */
export function installHint(target: InstallTarget): string {
  if (target === "ios-safari" || target === "ios-open-in-safari") return "Sur l'écran d'accueil de votre iPhone";
  if (target.startsWith("android")) return "En un appui sur ce téléphone";
  return "Sur cet ordinateur";
}

/** Adresse de la page d'installation, partageable. */
export const INSTALL_PATH = "/installer";
