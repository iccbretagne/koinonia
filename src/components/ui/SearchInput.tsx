import type { InputHTMLAttributes } from "react";
import { Search } from "lucide-react";

interface SearchInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  /** Nom accessible du champ (pas de libellé visible). */
  readonly "aria-label": string;
}

/** Champ de recherche d'une liste (loupe, 44 px), sans libellé visible (spec 063, extrait spec 064). */
export default function SearchInput({ className = "", ...props }: Readonly<SearchInputProps>) {
  return (
    <div className={`relative ${className}`}>
      <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-subtle" />
      <input
        type="search"
        className="block min-h-11 w-full rounded-control border border-control-line bg-surface py-2 pl-9 pr-3 text-base leading-6 text-ink placeholder:text-ink-subtle focus:border-focus focus:outline-none focus:ring-1 focus:ring-focus"
        {...props}
      />
    </div>
  );
}
