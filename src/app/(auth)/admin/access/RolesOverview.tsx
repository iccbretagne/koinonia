import Link from "next/link";
import type { Role } from "@/generated/prisma/client";
import { ALL_ROLES, ROLE_LABELS, ROLE_DESCRIPTIONS, ROLE_CATEGORY, ROLE_CATEGORY_LABELS, ASSIGNABLE_BY_MINISTER, type RoleCategory } from "@/lib/roles";
import { paths } from "@/lib/paths";

interface Props {
  readonly roleCounts: Record<string, number>;
  /** Un Ministre au périmètre restreint ne voit ni n'attribue aucun rôle transverse à l'église. */
  readonly hideTransverseRoles: boolean;
}

const CATEGORY_ORDER: RoleCategory[] = ["administration", "responsabilite", "fonction", "membre"];

export default function RolesOverview({ roleCounts, hideTransverseRoles }: Props) {
  const visibleRoles: readonly Role[] = hideTransverseRoles
    ? ALL_ROLES.filter((r) => ASSIGNABLE_BY_MINISTER.includes(r))
    : ALL_ROLES;

  return (
    <div className="flex flex-col gap-6">
      {CATEGORY_ORDER.map((category) => {
        const roles = visibleRoles.filter((r) => ROLE_CATEGORY[r] === category);
        if (roles.length === 0) return null;
        return (
          <div key={category}>
            <h2 className="mb-2 font-display text-[11px] font-bold uppercase leading-4 tracking-[0.08em] text-ink-subtle">
              {ROLE_CATEGORY_LABELS[category]}
            </h2>
            <div className="space-y-2">
              {roles.map((role) => (
                <Link
                  key={role}
                  href={paths.admin.accessRole(role)}
                  className="flex min-h-16 items-center justify-between gap-3 rounded-card border border-line bg-surface px-4 py-3 shadow-card transition-colors hover:bg-surface-sunken focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                >
                  <div className="min-w-0">
                    <p className="text-[15px] font-semibold leading-[22px] text-ink">{ROLE_LABELS[role]}</p>
                    <p className="text-[13px] leading-[18px] text-ink-muted">{ROLE_DESCRIPTIONS[role]}</p>
                  </div>
                  <span className="shrink-0 text-[15px] font-semibold tabular-nums text-ink-muted" aria-label={`${roleCounts[role] ?? 0} détenteur${(roleCounts[role] ?? 0) > 1 ? "s" : ""}`}>
                    {roleCounts[role] ?? 0}
                  </span>
                </Link>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
