import clsx from "clsx";
import type { HTMLAttributes } from "react";

/** The standard glass card, like the machine cards on the factory page. */
export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={clsx("glass rounded-2xl", className)} {...props} />;
}
