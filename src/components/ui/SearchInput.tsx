import type { InputHTMLAttributes } from "react";
import { Search } from "lucide-react";

interface SearchInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  /** Nom accessible du champ (pas de libellé visible). */
  readonly "aria-label": string;
}

/** Champ de recherche d'une liste (loupe, 44 px), sans libellé visible (spec 063, extrait spec 064). */
export default function SearchInput({ className = "", ...props }: SearchInputProps) {
  return (
    <div className={`relative ${className}`}>
      <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-subtle" />
      <input
        type="search"
        className="block min-h-11 w-full rounded-control border border-control-line bg-surface py-2 pl-9 pr-3 text-[15px] text-ink placeholder:text-ink-subtle focus:border-brand focus:outline-none"
        {...props}
      />
    </div>
  );
}
