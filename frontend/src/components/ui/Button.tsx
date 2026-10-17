import clsx from "clsx";
import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-sky-600 text-white shadow-lg shadow-sky-500/20 hover:bg-sky-500",
  secondary: "border border-white/10 bg-white/[0.05] text-zinc-200 hover:border-white/20 hover:bg-white/10",
  ghost: "text-zinc-300 hover:bg-white/[0.07] hover:text-zinc-100",
  danger: "border border-red-500/40 bg-red-500/10 text-red-300 hover:bg-red-500/20",
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
        "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/60 disabled:cursor-not-allowed disabled:opacity-50",
        size === "sm" ? "h-8 px-2.5 text-xs" : "h-9 px-3 text-sm",
        VARIANTS[variant],
        className,
      )}
      {...props}
    />
  );
}
