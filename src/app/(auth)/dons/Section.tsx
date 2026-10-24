"use client";

import type { ReactNode } from "react";
import { TriangleAlert } from "lucide-react";
import Switch from "./Switch";

/** Carte de réglages du paramétrage des dons, repliée quand son interrupteur est éteint. */
export default function Section({
  id,
  title,
  description,
  toggle,
  notice,
  children,
}: {
  readonly id?: string;
  readonly title: string;
  readonly description?: ReactNode;
  readonly toggle?: { readonly checked: boolean; readonly onChange: (next: boolean) => void };
  readonly notice?: string;
  readonly children?: ReactNode;
}) {
  const open = toggle ? toggle.checked : true;
  return (
    <section id={id} tabIndex={id ? -1 : undefined} className="scroll-mt-4 rounded-card border border-line bg-surface p-5 outline-none">
      <div className="flex items-start gap-4">
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-[17px] font-semibold leading-6 text-ink">{title}</h2>
          {description && <p className="mt-0.5 text-[13px] leading-[18px] text-ink-muted">{description}</p>}
        </div>
        {toggle && <Switch checked={toggle.checked} onChange={toggle.onChange} label={`Afficher : ${title}`} />}
      </div>
      {open && children && (
        <div className="mt-4 flex flex-col gap-4">
          {notice && (
            <p className="flex items-start gap-2 rounded-control bg-warning-soft px-3 py-2 text-[13px] leading-[18px] text-ink">
              <TriangleAlert aria-hidden="true" className="mt-px size-4 shrink-0 text-warning" />
              {notice}
            </p>
          )}
          {children}
        </div>
      )}
    </section>
  );
}
