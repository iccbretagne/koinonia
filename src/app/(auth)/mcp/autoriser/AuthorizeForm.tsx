"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { Button } from "@/components/ui";

/**
 * Envoi de la décision en arrière-plan puis navigation vers l'adresse de retour de l'assistant
 * (spec 081) : un formulaire classique serait bloqué par la règle CSP `form-action` au moment de
 * la redirection vers une autre origine.
 */
export default function AuthorizeForm({
  params,
  children,
}: {
  readonly params: Record<string, string>;
  readonly children: ReactNode;
}) {
  const [busy, setBusy] = useState<"allow" | "deny" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function decide(event: FormEvent<HTMLFormElement>, decision: "allow" | "deny") {
    event.preventDefault();
    setBusy(decision);
    setError(null);
    const form = new FormData(event.currentTarget);
    const body = new URLSearchParams({ ...params, decision, church_id: String(form.get("church_id") ?? "") });
    if (form.get("allow_write") === "on") body.set("allow_write", "on");
    try {
      const res = await fetch("/api/mcp/oauth/authorize", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body,
      });
      const json = (await res.json().catch(() => ({}))) as { redirectTo?: string; error?: string };
      if (!res.ok || !json.redirectTo) throw new Error(json.error ?? "Autorisation impossible");
      globalThis.location.assign(json.redirectTo);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Autorisation impossible");
      setBusy(null);
    }
  }

  return (
    <form
      onSubmit={(e) => void decide(e, "allow")}
      className="bg-surface rounded-xl border border-line p-5 space-y-5"
    >
      {children}
      {error !== null && <p className="text-sm text-danger">{error}</p>}
      <div className="flex flex-wrap justify-end gap-2">
        <Button
          type="button"
          variant="secondary"
          disabled={busy !== null}
          onClick={(e) => {
            const form = e.currentTarget.form;
            if (form) void decide({ preventDefault() {}, currentTarget: form } as FormEvent<HTMLFormElement>, "deny");
          }}
        >
          {busy === "deny" ? "Refus…" : "Refuser"}
        </Button>
        <Button type="submit" variant="primary" disabled={busy !== null}>
          {busy === "allow" ? "Autorisation…" : "Autoriser"}
        </Button>
      </div>
    </form>
  );
}
