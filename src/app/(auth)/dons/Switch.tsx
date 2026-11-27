"use client";

/** Interrupteur du paramétrage des dons (spec 065). */
export default function Switch({
  checked,
  onChange,
  label,
  disabled = false,
}: {
  readonly checked: boolean;
  readonly onChange: (next: boolean) => void;
  readonly label: string;
  readonly disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="group inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-control focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:cursor-not-allowed disabled:opacity-50"
    >
      {/* Piste de 24 px dans une zone tactile de 44 px. */}
      <span
        aria-hidden="true"
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-120 ${checked ? "bg-brand" : "bg-control-line"}`}
      >
        <span
          className={`inline-block size-4 rounded-full bg-surface transition-transform ${checked ? "translate-x-6" : "translate-x-1"}`}
        />
      </span>
    </button>
  );
}
