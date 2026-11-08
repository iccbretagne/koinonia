"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowRight, X } from "lucide-react";
import IconButton from "@/components/ui/IconButton";
import { buttonClasses } from "@/components/ui/button-classes";
import { controlClasses } from "@/components/ui/field-classes";
import { useModalDialog } from "@/components/ui/use-modal-dialog";
import { PERSONA_NAME, QUESTION_MAX, type AskResponse, type AssistantExpression, type SuggestionRef } from "@/modules/assistant/schemas";
import AssistantAvatar, { type AssistantPersonaKey } from "./AssistantAvatar";
import { useKeyboardBox } from "./keyboard-box";

type Message =
  | { id: number; from: "me"; text: string }
  | { id: number; from: "bot"; question: string; response: AskResponse; feedback?: "helpful" | "notHelpful" };

/** Réponse qui peut être jugée « Utile » / « Pas utile ». */
const RATEABLE = new Set(["howto", "data", "fixed", "refused"]);
const SAD = new Set(["unknown", "refused"]);

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(String(res.status));
  return res.json() as Promise<T>;
}

function SuggestionButtons({ items, onAsk }: { readonly items: readonly SuggestionRef[]; readonly onAsk: (q: string) => void }) {
  return (
    <div className="flex flex-col gap-1.5">
      {items.map((s) => (
        <button
          key={s.key}
          type="button"
          onClick={() => onAsk(s.question)}
          className="min-h-11 rounded-control border border-line bg-surface px-3 py-2 text-left text-[15px] text-ink transition-colors
            duration-120 hover:bg-surface-sunken focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        >
          {s.question}
        </button>
      ))}
    </div>
  );
}

function OpenLink({ href, label }: { readonly href: string; readonly label: string }) {
  return (
    <Link href={href} className={`${buttonClasses("secondary", "sm")} self-start`}>
      {label}
      <ArrowRight aria-hidden="true" className="size-4" strokeWidth={1.75} />
    </Link>
  );
}

function BotAnswer({ response, onAsk }: { readonly response: AskResponse; readonly onAsk: (q: string) => void }) {
  switch (response.kind) {
    case "howto":
      return (
        <>
          <p className="font-semibold text-ink">{response.title}</p>
          <p className="whitespace-pre-line">{response.text}</p>
          {response.href && <OpenLink href={response.href} label={`Ouvrir ${response.hrefLabel ?? "l'écran"}`} />}
        </>
      );
    case "fixed":
    case "refused":
      return <p className="whitespace-pre-line">{response.text}</p>;
    case "data": {
      const data = response.data;
      return (
        <>
          <p className="font-semibold text-ink">{data?.title ?? response.title}</p>
          {!data && <p>{response.intro}</p>}
          {data && data.items.length === 0 && <p className="text-ink-muted">{data.empty ?? "Rien à afficher."}</p>}
          {data && data.items.length > 0 && (
            <ul className="divide-y divide-line overflow-hidden rounded-control border border-line">
              {data.items.map((item, i) => (
                <li key={`${item.label}-${i}`} className="flex flex-col px-3 py-2">
                  <span className="text-ink">{item.label}</span>
                  {item.detail && <span className="text-[13px] text-ink-muted">{item.detail}</span>}
                </li>
              ))}
            </ul>
          )}
          {data && data.total > data.items.length && (
            <p className="text-[13px] text-ink-muted">Et {data.total - data.items.length} de plus dans l&apos;écran complet.</p>
          )}
          {response.href && <OpenLink href={response.href} label={`Voir dans ${response.hrefLabel ?? "l'écran"}`} />}
        </>
      );
    }
    case "suggestions":
      return (
        <>
          <p>Vous voulez dire :</p>
          <SuggestionButtons items={response.suggestions} onAsk={onAsk} />
        </>
      );
    case "unknown":
      return (
        <>
          <p>Je n&apos;ai pas encore de réponse à cette question. Elle est transmise, sans votre nom, pour compléter l&apos;aide.</p>
          {response.suggestions.length > 0 && (
            <>
              <p className="text-[13px] font-semibold text-ink-muted">Questions proches</p>
              <SuggestionButtons items={response.suggestions} onAsk={onAsk} />
            </>
          )}
          <Link href={response.guideHref} className="font-semibold text-brand-text underline-offset-2 hover:underline">
            Ouvrir le guide d&apos;utilisation
          </Link>
        </>
      );
  }
}

/**
 * Panneau de l'assistant (spec 075) : à droite sur ordinateur, plein écran sur téléphone. Le fil
 * vit dans l'état du composant et disparaît à la fermeture : rien n'est conservé côté serveur.
 */
export default function AssistantPanel({
  persona,
  firstName,
  screen,
  onClose,
}: {
  readonly persona: AssistantPersonaKey;
  readonly firstName: string | null;
  readonly screen: string;
  readonly onClose: () => void;
}) {
  const dialogRef = useModalDialog(true, onClose);
  // Clavier ouvert sur téléphone : le panneau se cale sur la zone visible, en-tête compris.
  const keyboard = useKeyboardBox();
  const name = PERSONA_NAME[persona];
  const [messages, setMessages] = useState<Message[]>([]);
  const [suggestions, setSuggestions] = useState<SuggestionRef[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [expression, setExpression] = useState<AssistantExpression>("bonjour");
  const nextId = useRef(1);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => setExpression((e) => (e === "bonjour" ? "repos" : e)), 1500);
    fetch(`/api/assistant/suggestions?screen=${encodeURIComponent(screen)}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((items: SuggestionRef[]) => setSuggestions(items))
      .catch(() => setSuggestions([]));
    return () => clearTimeout(timer);
  }, [screen]);

  useEffect(() => {
    endRef.current?.scrollIntoView?.({ block: "end" });
  }, [messages, busy]);

  async function askQuestion(question: string) {
    const text = question.trim().slice(0, QUESTION_MAX);
    if (!text || busy) return;
    setInput("");
    setMessages((m) => [...m, { id: nextId.current++, from: "me", text }]);
    setBusy(true);
    setExpression("reflechit");
    let response: AskResponse;
    try {
      response = await postJson<AskResponse>("/api/assistant/ask", { question: text, screen });
    } catch {
      response = { kind: "fixed", key: "erreur", title: "", text: "Je n'arrive pas à répondre pour le moment. Réessayez dans un instant." };
    }
    setMessages((m) => [...m, { id: nextId.current++, from: "bot", question: text, response }]);
    setExpression(SAD.has(response.kind) ? "desole" : "repos");
    setBusy(false);
  }

  function rate(id: number, helpful: boolean) {
    const message = messages.find((m) => m.id === id);
    if (message?.from !== "bot" || message.feedback) return;
    setMessages((m) => m.map((x) => (x.id === id && x.from === "bot" ? { ...x, feedback: helpful ? "helpful" : "notHelpful" } : x)));
    if (helpful) setExpression("content");
    const entryKey = "key" in message.response ? message.response.key : undefined;
    postJson("/api/assistant/feedback", { question: message.question, helpful, entryKey, screen }).catch(() => undefined);
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void askQuestion(input);
  }

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      aria-label={`Assistant ${name}`}
      style={keyboard ? { height: keyboard.height, transform: `translateY(${keyboard.top}px)` } : undefined}
      className="m-0 ml-auto h-dvh max-h-none w-full max-w-none border-0 bg-bg p-0 text-ink shadow-overlay backdrop:bg-scrim
        md:w-[440px] md:border-l md:border-line"
    >
      <div className="flex h-full flex-col">
        <div className="flex items-center gap-3 border-b border-line bg-surface px-4 py-3">
          <AssistantAvatar persona={persona} expression={expression} size={44} decorative />
          <div className="min-w-0 flex-1">
            <p className="font-display text-[15px] font-semibold text-ink">{name}</p>
            <p className="text-xs text-ink-muted">Votre aide dans Koinonia</p>
          </div>
          <IconButton icon={X} aria-label={`Fermer ${name}`} onClick={onClose} />
        </div>

        <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-4" aria-live="polite">
          <p className="text-[15px] text-ink">
            Bonjour{firstName ? ` ${firstName}` : ""} ! Je suis {name}. Voici ce qu&apos;on me demande souvent ici :
          </p>
          {suggestions.length > 0 && <SuggestionButtons items={suggestions} onAsk={(q) => void askQuestion(q)} />}

          {messages.map((m) =>
            m.from === "me" ? (
              <p key={m.id} className="max-w-[80%] self-end rounded-card rounded-br-sm bg-brand px-3.5 py-2.5 text-[15px] text-on-brand">
                {m.text}
              </p>
            ) : (
              <div
                key={m.id}
                className="flex flex-col gap-2.5 rounded-card rounded-bl-sm border border-line bg-surface p-3.5 text-[15px] text-ink"
              >
                {m.response.church && <p className="text-[13px] text-ink-muted">Pour {m.response.church}</p>}
                <BotAnswer response={m.response} onAsk={(q) => void askQuestion(q)} />
                {RATEABLE.has(m.response.kind) && (
                  <div className="flex flex-wrap items-center gap-1.5 text-[13px] text-ink-muted">
                    <span>Cette réponse vous a aidé ?</span>
                    {(["helpful", "notHelpful"] as const).map((value) => (
                      <button
                        key={value}
                        type="button"
                        disabled={!!m.feedback}
                        aria-pressed={m.feedback === value}
                        onClick={() => rate(m.id, value === "helpful")}
                        className={`h-8 rounded-full border px-3 text-[13px] transition-colors duration-120 disabled:cursor-default
                          focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus ${
                            m.feedback === value ? "border-brand bg-brand-soft text-brand-text" : "border-control-line bg-surface text-ink"
                          }`}
                      >
                        {value === "helpful" ? "Utile" : "Pas utile"}
                        {m.feedback === value ? " ✓" : ""}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )
          )}
          {busy && (
            <p className="flex items-center gap-2 text-[13px] text-ink-muted">
              <AssistantAvatar persona={persona} expression="reflechit" size={32} decorative float={false} />
              {name} cherche…
            </p>
          )}
          <div ref={endRef} />
        </div>

        <form data-dialog-body onSubmit={onSubmit} className="flex flex-col gap-2 border-t border-line bg-surface px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3">
          <div className="flex gap-2">
            <label className="flex flex-1">
              <span className="sr-only">Votre question</span>
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                maxLength={QUESTION_MAX}
                placeholder="Posez votre question…"
                className={`${controlClasses(false)} h-11`}
                autoComplete="off"
              />
            </label>
            <button
              type="submit"
              disabled={busy || !input.trim()}
              aria-label="Envoyer"
              className={`${buttonClasses("primary")} size-11 shrink-0 px-0`}
            >
              <ArrowRight aria-hidden="true" className="size-5" strokeWidth={1.75} />
            </button>
          </div>
          <p className="text-xs text-ink-muted">
            Réponses selon votre rôle. Rien n&apos;est conservé à la fermeture.{" "}
            <Link href="/guide" className="font-semibold text-brand-text underline-offset-2 hover:underline">
              Guide d&apos;utilisation
            </Link>
          </p>
        </form>
      </div>
    </dialog>
  );
}
