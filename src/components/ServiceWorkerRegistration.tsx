"use client";

import { useEffect } from "react";
import { armInstallPrompt } from "@/lib/install/prompt-store";

export default function ServiceWorkerRegistration() {
  useEffect(() => {
    // Installation de l'application (spec 070) : l'événement natif n'est émis qu'une fois, tôt.
    armInstallPrompt();
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // SW registration failed — ignore silently
      });
    }
  }, []);

  return null;
}
