"use client";

import { useState } from "react";
import Link from "next/link";
import { Briefcase, ChevronRight, Laptop, Plus, UserRoundSearch, Wrench, type LucideIcon } from "lucide-react";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import type { PublicationKind } from "@/modules/jobs";

const CHOICES: readonly { kind: PublicationKind; href: string; title: string; description: string; icon: LucideIcon }[] = [
  { kind: "OFFER", href: "/jobs/new", title: "Une offre", description: "Emploi, stage ou alternance à pourvoir", icon: Briefcase },
  { kind: "MISSION", href: "/jobs/freelance/missions/new", title: "Une mission freelance", description: "Un travail à confier à un indépendant", icon: Wrench },
  { kind: "SEEKER", href: "/jobs/seekers/new", title: "Mon profil de recherche", description: "Je cherche un emploi, un stage ou une alternance", icon: UserRoundSearch },
  { kind: "FREELANCE", href: "/jobs/freelance/profiles/new", title: "Mes services de freelance", description: "Je propose mes compétences en indépendant", icon: Laptop },
];

/**
 * Bouton « Publier » unique de l'espace Offres (spec 064) : ouvre le choix du type de
 * publication, en feuille depuis le bas sur mobile. `only` restreint aux types d'un onglet.
 */
export default function PublishChooser({
  only,
  label = "Publier",
  variant = "primary",
}: {
  readonly only?: readonly PublicationKind[];
  readonly label?: string;
  readonly variant?: "primary" | "secondary";
}) {
  const [open, setOpen] = useState(false);
  const choices = only ? CHOICES.filter((c) => only.includes(c.kind)) : CHOICES;

  return (
    <>
      <Button variant={variant} onClick={() => setOpen(true)}>
        <Plus aria-hidden="true" className="size-4" />
        {label}
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Que voulez-vous publier ?" mobileLayout="sheet">
        <ul className="flex flex-col gap-2">
          {choices.map(({ kind, href, title, description, icon: Icon }) => (
            <li key={kind}>
              <Link
                href={href}
                className="flex min-h-11 items-center gap-3 rounded-control border border-line bg-surface px-4 py-3 transition-colors duration-120 hover:bg-surface-sunken
                  focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
              >
                <Icon aria-hidden="true" className="size-5 shrink-0 text-brand-text" strokeWidth={1.75} />
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-semibold leading-[22px] text-ink">{title}</span>
                  <span className="block text-sm leading-5 text-ink-muted">{description}</span>
                </span>
                <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-ink-subtle" />
              </Link>
            </li>
          ))}
        </ul>
      </Modal>
    </>
  );
}
