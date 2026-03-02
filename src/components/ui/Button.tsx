"use client";

import { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "danger" | "ghost";

const variantClasses: Record<Variant, string> = {
  primary:
    "bg-icc-violet text-white hover:bg-icc-jaune hover:text-icc-violet focus:ring-icc-violet",
  secondary:
    "bg-gray-200 text-gray-900 hover:bg-gray-300 focus:ring-gray-300",
  danger:
    "bg-icc-rouge text-white hover:bg-red-700 focus:ring-red-500",
  ghost:
    "bg-transparent text-icc-violet hover:bg-icc-violet-light focus:ring-icc-violet",
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
}

export default function Button({
  variant = "primary",
  className = "",
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      className={`px-3 py-2.5 md:px-4 md:py-2 min-h-[44px] text-sm font-medium rounded-lg focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors ${variantClasses[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
