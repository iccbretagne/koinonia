import Link from "next/link";
import type { Role } from "@/generated/prisma/client";
import { ALL_ROLES, ROLE_LABELS, ROLE_DESCRIPTIONS, ROLE_CATEGORY, ROLE_CATEGORY_LABELS, ASSIGNABLE_BY_MINISTER, type RoleCategory } from "@/lib/roles";

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
    <div className="space-y-6">
      {CATEGORY_ORDER.map((category) => {
        const roles = visibleRoles.filter((r) => ROLE_CATEGORY[r] === category);
        if (roles.length === 0) return null;
        return (
          <div key={category}>
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">
              {ROLE_CATEGORY_LABELS[category]}
            </h2>
            <div className="space-y-2">
              {roles.map((role) => (
                <Link
                  key={role}
                  href={`/admin/access/roles/${role}`}
                  className="flex items-center justify-between gap-3 bg-white rounded-lg border border-gray-100 shadow-sm px-4 py-3 hover:border-icc-violet/30 transition-colors"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900">{ROLE_LABELS[role]}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{ROLE_DESCRIPTIONS[role]}</p>
                  </div>
                  <span className="shrink-0 text-xs font-medium bg-icc-violet/10 text-icc-violet border border-icc-violet/20 px-2.5 py-1 rounded-full">
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
