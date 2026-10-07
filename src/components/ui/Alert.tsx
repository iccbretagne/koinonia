import type { HTMLAttributes, ReactNode } from "react";
import { CircleAlert, CircleCheck, Info, TriangleAlert, type LucideIcon } from "lucide-react";

export type AlertTone = "warning" | "info" | "danger" | "success";

const toneClasses: Record<AlertTone, { box: string; icon: string; Icon: LucideIcon }> = {
  warning: { box: "bg-warning-soft", icon: "text-warning", Icon: TriangleAlert },
  info: { box: "bg-info-soft", icon: "text-info", Icon: Info },
  danger: { box: "bg-danger-soft", icon: "text-danger", Icon: CircleAlert },
  success: { box: "bg-success-soft", icon: "text-success", Icon: CircleCheck },
};

interface AlertProps extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
  readonly tone?: AlertTone;
  /** Première phrase en gras (« Clavier non couvert. »). */
  readonly title?: ReactNode;
  /** Remplace l'icône par défaut de la tonalité. */
  readonly icon?: LucideIcon;
  /** Action proposée (lien ou `Button` ghost), sous le texte. */
  readonly action?: ReactNode;
}

/**
 * Encadré de message dans le flux de la page (docs/design-system/components/Alert.md) : fond
 * `-soft`, icône de la couleur pleine, texte `ink`. Pour un retour après action, utiliser `Toast` ;
 * pour une erreur de champ, l'erreur du champ.
 */
export default function Alert({
  tone = "warning",
  title,
  icon,
  action,
  className = "",
  children,
  ...props
}: Readonly<AlertProps>) {
  const { box, icon: iconColor, Icon: DefaultIcon } = toneClasses[tone];
  const Icon = icon ?? DefaultIcon;

  return (
    <div
      className={`flex items-start gap-3 rounded-control px-4 py-3 text-[15px] leading-[22px] text-ink ${box} ${className}`}
      {...props}
    >
      <Icon aria-hidden="true" className={`mt-px size-5 shrink-0 ${iconColor}`} strokeWidth={1.75} />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        {(title || children) && (
          <div className="min-w-0 break-words">
            {title && <strong className="font-semibold">{title}</strong>}
            {title && children ? " " : null}
            {children}
          </div>
        )}
        {action && <div className="flex flex-wrap items-center gap-2">{action}</div>}
      </div>
    </div>
  );
}
