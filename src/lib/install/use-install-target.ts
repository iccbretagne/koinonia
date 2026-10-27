"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { detectBrowser, detectPlatform, installTarget, type InstallPlatform, type InstallTarget } from "./detect";
import { getInstallPromptSnapshot, getServerInstallPromptSnapshot, subscribeInstallPrompt } from "./prompt-store";

interface DeviceInfo {
  platform: InstallPlatform;
  browser: ReturnType<typeof detectBrowser>;
  standalone: boolean;
}

function readDevice(): DeviceInfo {
  const ua = navigator.userAgent;
  const standalone =
    globalThis.matchMedia?.("(display-mode: standalone)").matches === true ||
    (navigator as { standalone?: boolean }).standalone === true;
  return { platform: detectPlatform(ua, navigator.maxTouchPoints ?? 0), browser: detectBrowser(ua), standalone };
}

/**
 * Situation d'installation de l'appareil courant (spec 070). `null` tant que l'appareil n'est
 * pas lu : rien ne s'affiche au premier rendu, ce qui évite un écart d'hydratation.
 */
export function useInstallTarget(): { target: InstallTarget; platform: InstallPlatform } | null {
  const prompt = useSyncExternalStore(subscribeInstallPrompt, getInstallPromptSnapshot, getServerInstallPromptSnapshot);
  const [device, setDevice] = useState<DeviceInfo | null>(null);

  useEffect(() => {
    // Lecture de l'appareil après le montage, une seule fois (signaux propres au navigateur).
    // eslint-disable-next-line react-hooks/set-state-in-effect -- environnement client, lu une fois au montage
    setDevice(readDevice());
  }, []);

  if (!device) return null;
  return {
    platform: device.platform,
    target: installTarget({
      platform: device.platform,
      browser: device.browser,
      standalone: device.standalone || prompt.installed,
      canPrompt: prompt.canPrompt,
    }),
  };
}
