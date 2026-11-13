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

export interface FillerLevel {
  readonly id: string;
  readonly code: string;
  readonly label: string | null;
  readonly isEntry: boolean;
  /** Places restantes. */
  readonly remaining: number;
}

export interface FillerSession {
  readonly id: string;
  readonly label: string;
  readonly startDate: string;
  readonly days: number;
  readonly levels: readonly FillerLevel[];
}

export interface FillerForm {
  readonly id: string;
  readonly title: string;
  readonly description: string | null;
  readonly anonymous: boolean;
  readonly waitlistEnabled: boolean;
  readonly questions: readonly FillerQuestion[];
  /** Inscription à sessions (lot 2). */
  readonly sessions?: readonly FillerSession[];
}

export type Answers = Record<string, unknown>;
