import clsx from "clsx";
import type { HTMLAttributes } from "react";

/** The standard dark card: zinc-900, zinc-800 border, rounded-xl. */
export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={clsx("rounded-xl border border-zinc-800 bg-zinc-900", className)} {...props} />;
}
