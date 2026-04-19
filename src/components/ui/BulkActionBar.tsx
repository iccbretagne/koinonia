"use client";

import Button from "@/components/ui/Button";

interface BulkActionBarProps {
  count: number;
  onEdit: () => void;
  onDelete: () => void;
  onClear: () => void;
}

export default function BulkActionBar({
  count,
  onEdit,
  onDelete,
  onClear,
}: BulkActionBarProps) {
  if (count === 0) return null;

  return (
    <div className="fixed bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 z-50 bg-white border border-gray-200 rounded-lg shadow-lg px-6 py-3 flex items-center gap-4">
      <span className="text-sm font-medium text-gray-700">
        {count} element{count > 1 ? "s" : ""} selectionne{count > 1 ? "s" : ""}
      </span>
      <Button variant="secondary" onClick={onEdit}>
        Modifier
      </Button>
      <Button variant="danger" onClick={onDelete}>
        Supprimer
      </Button>
      <button
        onClick={onClear}
        className="text-sm text-gray-500 hover:text-gray-700 underline"
      >
        Deselectionner
      </button>
    </div>
  );
}
