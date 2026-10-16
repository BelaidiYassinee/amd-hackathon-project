import clsx from "clsx";
import type { HTMLAttributes } from "react";

/** The standard dark card: slate-900, slate-800 border, rounded-xl. */
export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={clsx("rounded-xl border border-slate-800 bg-slate-900", className)} {...props} />;
}
