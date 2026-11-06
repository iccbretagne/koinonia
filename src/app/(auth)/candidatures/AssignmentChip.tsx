import { StatusChip, type StatusTone } from "@/components/ui";
import { ASSIGNMENT_STATUS_LABEL } from "@/modules/serving/schemas";

type Props = {
  readonly departmentName?: string;
  readonly status: keyof typeof ASSIGNMENT_STATUS_LABEL;
  readonly observationEndsAt: string | null;
  /** Calculé côté serveur : la date de fin est passée sans décision. */
  readonly overdue: boolean;
};

const TONE: Record<Props["status"], StatusTone> = {
  PENDING: "info",
  OBSERVATION: "brand",
  CONFIRMED: "success",
  SENT_BACK: "danger",
};

export function formatDay(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
}

/** Étape d'une affectation : « Observation jusqu'au … », « Échue » une fois la date passée. */
export default function AssignmentChip({ departmentName, status, observationEndsAt, overdue }: Props) {
  let label: string = ASSIGNMENT_STATUS_LABEL[status];
  let tone = TONE[status];
  if (status === "OBSERVATION" && observationEndsAt) {
    label = overdue ? "Observation échue" : `Observation jusqu'au ${formatDay(observationEndsAt)}`;
    if (overdue) tone = "warning";
  }
  return (
    <StatusChip tone={tone}>
      {departmentName ? `${departmentName} · ` : ""}
      {label}
    </StatusChip>
  );
}
