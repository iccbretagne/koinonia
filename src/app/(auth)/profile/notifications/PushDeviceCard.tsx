"use client";

import { useEffect, useState } from "react";
import { BellRing, Smartphone } from "lucide-react";
import { Alert, Button, StatusChip, useToast } from "@/components/ui";
import type { StatusTone } from "@/components/ui";
import { detectIos, pushDeviceState, urlBase64ToUint8Array, type PushDeviceState } from "./push-device-state";

const CHIP: Record<PushDeviceState, { label: string; tone: StatusTone }> = {
  enabled: { label: "Activées", tone: "success" },
  disabled: { label: "Non activées", tone: "neutral" },
  blocked: { label: "Bloquées", tone: "danger" },
  "unavailable-ios-install": { label: "Indisponibles", tone: "warning" },
  "unavailable-browser": { label: "Indisponibles", tone: "warning" },
  "unavailable-instance": { label: "Indisponibles", tone: "warning" },
};

async function currentSubscription(): Promise<PushSubscription | null> {
  const registration = await navigator.serviceWorker.getRegistration();
  return (await registration?.pushManager.getSubscription()) ?? null;
}

/**
 * Notifications natives sur l'appareil courant (spec 068) : état, activation et désactivation.
 * L'autorisation n'est demandée qu'après un appui sur « Activer ».
 */
export default function PushDeviceCard({
  vapidPublicKey,
  initialDeviceCount,
}: {
  readonly vapidPublicKey: string | null;
  readonly initialDeviceCount: number;
}) {
  const toast = useToast();
  const [state, setState] = useState<PushDeviceState | null>(null);
  const [deviceCount, setDeviceCount] = useState(initialDeviceCount);
  const [busy, setBusy] = useState(false);

  async function readState(): Promise<PushDeviceState> {
    const hasServiceWorker = "serviceWorker" in navigator;
    const hasPushManager = "PushManager" in globalThis;
    const subscription = hasServiceWorker && hasPushManager ? await currentSubscription().catch(() => null) : null;
    return pushDeviceState({
      configured: vapidPublicKey !== null,
      hasServiceWorker,
      hasPushManager,
      isIos: detectIos(navigator.userAgent, navigator.maxTouchPoints ?? 0),
      isStandalone: globalThis.matchMedia?.("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true,
      permission: "Notification" in globalThis ? Notification.permission : "unsupported",
      subscribed: subscription !== null,
    });
  }

  async function refresh() {
    setState(await readState());
  }

  useEffect(() => {
    let active = true;
    readState().then((next) => {
      if (active) setState(next);
    });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- lecture unique de l'environnement au montage
  }, []);

  /** Nombre d'appareils relu après un changement (un réabonnement ne crée pas d'appareil de plus). */
  async function refreshDeviceCount() {
    const res = await fetch("/api/notifications/preferences").catch(() => null);
    if (res?.ok) setDeviceCount(((await res.json()) as { deviceCount: number }).deviceCount);
  }

  async function enable() {
    if (!vapidPublicKey) return;
    setBusy(true);
    try {
      // Demande d'autorisation dans le gestionnaire du clic (exigé par Safari).
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        await refresh();
        return;
      }
      const registration = await navigator.serviceWorker.ready;
      const subscription =
        (await registration.pushManager.getSubscription()) ??
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
        }));
      const json = subscription.toJSON();
      const res = await fetch("/api/notifications/push/subscriptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await refreshDeviceCount();
      toast.success("Notifications activées sur cet appareil");
    } catch {
      toast.error("Activation impossible. Réessayez dans un instant.");
    } finally {
      setBusy(false);
      await refresh();
    }
  }

  async function disable() {
    setBusy(true);
    try {
      const subscription = await currentSubscription();
      const endpoint = subscription?.endpoint;
      await subscription?.unsubscribe();
      await fetch("/api/notifications/push/subscriptions", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(endpoint ? { endpoint } : {}),
      });
      await refreshDeviceCount();
      toast.success("Notifications désactivées sur cet appareil");
    } catch {
      toast.error("Désactivation impossible. Réessayez dans un instant.");
    } finally {
      setBusy(false);
      await refresh();
    }
  }

  const chip = state ? CHIP[state] : null;

  return (
    <section aria-labelledby="push-device-title" className="flex flex-col gap-3">
      <h2 id="push-device-title" className="font-display text-[17px] font-semibold leading-6 text-ink">
        Notifications sur cet appareil
      </h2>
      <div className="flex flex-col gap-4 rounded-card border border-line bg-surface p-4 shadow-card sm:p-5">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-brand-soft text-brand-text">
            <Smartphone aria-hidden="true" className="size-5" strokeWidth={1.75} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-[15px] font-semibold leading-[22px] text-ink">Notifications natives</p>
              {chip && <StatusChip tone={chip.tone}>{chip.label}</StatusChip>}
            </div>
            <p className="text-[13px] leading-[18px] text-ink-muted">
              Un bandeau sur l&apos;écran de verrouillage ou dans le centre de notifications, qui ouvre directement
              le bon écran de Koinonia.
              {deviceCount > 0 &&
                ` ${deviceCount} appareil${deviceCount > 1 ? "s reçoivent" : " reçoit"} vos notifications.`}
            </p>
          </div>
        </div>

        {state === "disabled" && (
          <div>
            <Button onClick={enable} disabled={busy}>
              <BellRing aria-hidden="true" className="size-4" />
              {busy ? "Activation…" : "Activer les notifications sur cet appareil"}
            </Button>
          </div>
        )}
        {state === "enabled" && (
          <div>
            <Button variant="secondary" onClick={disable} disabled={busy}>
              {busy ? "Désactivation…" : "Désactiver sur cet appareil"}
            </Button>
          </div>
        )}
        {state === "blocked" && (
          <Alert tone="warning" title="Notifications bloquées pour Koinonia.">
            Vous avez refusé l&apos;autorisation. Pour la rétablir, ouvrez les réglages du navigateur (ou de
            l&apos;application sur le téléphone), autorisez les notifications pour Koinonia, puis revenez sur cette
            page.
          </Alert>
        )}
        {state === "unavailable-ios-install" && (
          <Alert tone="info" title="Installez Koinonia sur l'écran d'accueil.">
            Sur iPhone et iPad (iOS 16.4 ou plus récent), les notifications ne fonctionnent que dans
            l&apos;application installée : dans Safari, touchez Partager, puis « Sur l&apos;écran d&apos;accueil ».
            Ouvrez ensuite Koinonia depuis son icône et revenez sur cette page.
          </Alert>
        )}
        {state === "unavailable-browser" && (
          <Alert tone="info" title="Navigateur non compatible.">
            Ce navigateur ne permet pas les notifications natives. Utilisez Chrome, Edge, Firefox ou Safari à jour,
            ou installez Koinonia sur l&apos;écran d&apos;accueil de votre téléphone.
          </Alert>
        )}
        {state === "unavailable-instance" && (
          <Alert tone="info">Les notifications natives ne sont pas encore disponibles sur cette instance de Koinonia.</Alert>
        )}
      </div>
    </section>
  );
}
