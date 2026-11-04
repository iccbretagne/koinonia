"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui";

export default function PrintButton({ label = "Imprimer", onPrinted }: { readonly label?: string; readonly onPrinted?: () => void }) {
  return (
    <Button
      type="button"
      onClick={() => {
        window.print();
        onPrinted?.();
      }}
    >
      <Printer className="size-4" aria-hidden="true" /> {label}
    </Button>
  );
}
