"use client";

import { ReactNode, useEffect, useRef } from "react";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}

export default function Modal({ open, onClose, title, children }: ModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open) {
      dialog.showModal();
    } else {
      dialog.close();
    }
  }, [open]);

  if (!open) return null;

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      className="rounded-none md:rounded-xl shadow-xl p-0 backdrop:bg-black/50 w-full h-full md:h-auto md:max-w-lg md:w-full border-0 md:border-2 border-icc-violet/20 m-0 md:m-auto max-h-full md:max-h-[85vh] overflow-y-auto"
    >
      <div className="p-4 md:p-6 min-h-full md:min-h-0">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-icc-violet">{title}</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-xl leading-none min-h-[44px] min-w-[44px] flex items-center justify-center md:min-h-0 md:min-w-0"
          >
            &times;
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}
