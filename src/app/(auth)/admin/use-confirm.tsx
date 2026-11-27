"use client";

import { useCallback, useRef, useState, type ReactNode } from "react";
import { ConfirmModal } from "@/components/ui";

export interface ConfirmOptions {
  /** La question (« Retirer ce rôle ? »). */
  readonly title: string;
  /** La conséquence de l'action. */
  readonly message: string;
  /** Répète le verbe (« Retirer le rôle »). */
  readonly confirmLabel: string;
  /** `danger` (défaut) pour une suppression ou un retrait. */
  readonly variant?: "danger" | "primary";
}

/**
 * Remplace `window.confirm()` par le `ConfirmModal` du design system (docs/design-system/components/Dialog.md) :
 * `const [confirmDialog, ask] = useConfirm()`, puis `if (!(await ask({...}))) return;` et
 * `{confirmDialog}` dans le rendu. Le dialogue se ferme dès la réponse ; l'action suit avec son
 * propre état « en cours » et son `Toast`.
 */
export function useConfirm(): [ReactNode, (options: ConfirmOptions) => Promise<boolean>] {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<((value: boolean) => void) | null>(null);

  const ask = useCallback((next: ConfirmOptions) => {
    resolver.current?.(false);
    setOptions(next);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  function answer(value: boolean) {
    resolver.current?.(value);
    resolver.current = null;
    setOptions(null);
  }

  const dialog = (
    <ConfirmModal
      open={options !== null}
      title={options?.title ?? ""}
      message={options?.message ?? ""}
      confirmLabel={options?.confirmLabel}
      variant={options?.variant ?? "danger"}
      onConfirm={() => answer(true)}
      onCancel={() => answer(false)}
    />
  );

  return [dialog, ask];
}
