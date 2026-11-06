import Image from "next/image";
import { PERSONA_NAME, type AssistantExpression } from "@/modules/assistant/schemas";

export type AssistantPersonaKey = "NIA" | "KOI";

type ImageKey = AssistantExpression | "icone" | "repos-yeux-fermes";

/** Texte de remplacement, accordé au personnage. */
const EXPRESSION_LABEL: Record<AssistantPersonaKey, Record<AssistantExpression, string>> = {
  NIA: { repos: "souriante", bonjour: "dit bonjour", reflechit: "réfléchit", content: "est contente", desole: "est désolée" },
  KOI: { repos: "souriant", bonjour: "dit bonjour", reflechit: "réfléchit", content: "est content", desole: "est désolé" },
};

/** Image d'une expression, à la résolution juste supérieure à la taille affichée (×2 écran). */
export function assistantImage(persona: AssistantPersonaKey, expression: ImageKey, size: number) {
  const folder = persona === "KOI" ? "koi" : "nia";
  if (expression === "icone") {
    const px = size * 2 <= 64 ? 64 : size * 2 <= 128 ? 128 : 256;
    return `/assistant/${folder}/icone-${px}.webp`;
  }
  return `/assistant/${folder}/${expression}-${size * 2 <= 256 ? 256 : 512}.webp`;
}

function altText(persona: AssistantPersonaKey, expression: AssistantExpression | "icone") {
  const name = PERSONA_NAME[persona];
  return expression === "icone" ? name : `${name} ${EXPRESSION_LABEL[persona][expression]}`;
}

/**
 * Personnage de l'assistant (spec 075) : Nia (par défaut) ou Koï. Au repos, l'image « yeux
 * fermés » se superpose brièvement pour le clignement ; flottement léger ; fondu au changement
 * d'expression. Aucune animation sous `prefers-reduced-motion` (`globals.css`).
 */
export default function AssistantAvatar({
  persona,
  expression = "repos",
  size,
  decorative = false,
  float = true,
  className = "",
}: {
  readonly persona: AssistantPersonaKey;
  readonly expression?: AssistantExpression | "icone";
  readonly size: number;
  /** Image purement décorative (le nom est déjà écrit à côté). */
  readonly decorative?: boolean;
  readonly float?: boolean;
  readonly className?: string;
}) {
  const alt = decorative ? "" : altText(persona, expression);
  return (
    <span
      className={`relative inline-block shrink-0 ${float ? "k-assistant-float" : ""} ${className}`}
      style={{ width: size, height: size }}
      data-expression={expression}
      data-persona={persona}
    >
      <Image
        key={`${persona}-${expression}`}
        src={assistantImage(persona, expression, size)}
        alt={alt}
        width={size}
        height={size}
        unoptimized
        className="k-assistant-fade absolute inset-0 size-full"
      />
      {expression === "repos" && (
        <Image
          src={assistantImage(persona, "repos-yeux-fermes", size)}
          alt=""
          aria-hidden="true"
          width={size}
          height={size}
          unoptimized
          className="k-assistant-blink absolute inset-0 size-full"
        />
      )}
    </span>
  );
}
