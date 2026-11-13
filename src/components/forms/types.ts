import type { QuestionType } from "@/modules/forms/schemas";

/** Formulaire tel que la page de réponse le reçoit (sérialisé). */
export interface FillerChoice {
  readonly id: string;
  readonly label: string;
  /** Places restantes, ou null si le choix n'est pas limité. */
  readonly remaining: number | null;
}

export interface FillerQuestion {
  readonly id: string;
  readonly position: number;
  readonly type: QuestionType;
  readonly label: string;
  readonly help: string | null;
  readonly required: boolean;
  readonly config: unknown;
  readonly conditionQuestionId: string | null;
  readonly conditionValue: string | null;
  readonly choices: readonly FillerChoice[];
}

export interface FillerForm {
  readonly id: string;
  readonly title: string;
  readonly description: string | null;
  readonly anonymous: boolean;
  readonly waitlistEnabled: boolean;
  readonly questions: readonly FillerQuestion[];
}

export type Answers = Record<string, unknown>;
