"use client";

import { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "danger" | "ghost" | "info" | "edit";
type Size = "sm" | "md";

const sizeClasses: Record<Size, string> = {
  sm: "px-2 py-1.5 md:px-2.5 md:py-1.5 min-h-[36px] text-xs",
  md: "px-3 py-2.5 md:px-4 md:py-2 min-h-[44px] text-sm",
};

const variantClasses: Record<Variant, string> = {
  primary:
    "bg-icc-violet text-white hover:bg-icc-jaune hover:text-icc-violet focus:ring-icc-violet",
  secondary:
    "bg-gray-200 text-gray-900 hover:bg-gray-300 focus:ring-gray-300",
  danger:
    "bg-icc-rouge text-white hover:bg-red-700 focus:ring-red-500",
  ghost:
    "bg-transparent text-icc-violet hover:bg-icc-violet-light focus:ring-icc-violet",
  info:
    "bg-icc-bleu text-white hover:bg-sky-600 focus:ring-icc-bleu",
  edit:
    "bg-icc-violet text-white hover:bg-icc-jaune hover:text-icc-violet focus:ring-icc-violet",
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

export default function Button({
  variant = "primary",
  size = "md",
  className = "",
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      className={`font-medium rounded-lg focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors ${sizeClasses[size]} ${variantClasses[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
