import clsx from "clsx";
import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-sky-600 text-white hover:bg-sky-500",
  secondary: "border border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700",
  ghost: "text-slate-300 hover:bg-slate-800",
  danger: "border border-red-900 bg-red-950/60 text-red-300 hover:bg-red-900/60",
};

export function Button({
  variant = "secondary",
  size = "md",
  className,
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: "sm" | "md" }) {
  return (
    <button
      type={type}
      className={clsx(
        "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        size === "sm" ? "h-8 px-2.5 text-xs" : "h-9 px-3 text-sm",
        VARIANTS[variant],
        className,
      )}
      {...props}
    />
  );
}
