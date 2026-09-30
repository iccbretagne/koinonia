"use client";

import { useEffect, useRef } from "react";

interface TurnstileApi {
  render: (el: HTMLElement, options: Record<string, unknown>) => string;
  reset: (widgetId: string) => void;
  remove: (widgetId: string) => void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js";

interface TurnstileWidgetProps {
  /** Clé publique lue côté serveur (`getTurnstileSiteKey`). */
  readonly siteKey: string;
  /** Jeton obtenu, ou `null` quand il expire / échoue / est réinitialisé. */
  readonly onToken: (token: string | null) => void;
  /** Incrémenter pour réinitialiser le widget (jeton à usage unique, après un refus serveur). */
  readonly resetSignal?: number;
}

/**
 * Widget Cloudflare Turnstile des formulaires publics (spec 030). Charge le script une seule
 * fois ; le jeton remonte par `onToken`.
 */
export default function TurnstileWidget({ siteKey, onToken, resetSignal = 0 }: TurnstileWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);
  const onTokenRef = useRef(onToken);
  useEffect(() => {
    onTokenRef.current = onToken;
  }, [onToken]);

  useEffect(() => {
    function init() {
      if (!containerRef.current || widgetId.current || !window.turnstile) return;
      widgetId.current = window.turnstile.render(containerRef.current, {
        sitekey: siteKey,
        callback: (token: string) => onTokenRef.current(token),
        "expired-callback": () => onTokenRef.current(null),
        "error-callback": () => onTokenRef.current(null),
      });
    }
    if (window.turnstile) {
      init();
    } else {
      let script = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT_SRC}"]`);
      if (!script) {
        script = document.createElement("script");
        script.src = SCRIPT_SRC;
        script.async = true;
        script.defer = true;
        document.head.appendChild(script);
      }
      script.addEventListener("load", init);
    }
    return () => {
      if (widgetId.current) window.turnstile?.remove(widgetId.current);
      widgetId.current = null;
    };
  }, [siteKey]);

  useEffect(() => {
    if (resetSignal > 0 && widgetId.current) {
      window.turnstile?.reset(widgetId.current);
      onTokenRef.current(null);
    }
  }, [resetSignal]);

  return <div ref={containerRef} />;
}
