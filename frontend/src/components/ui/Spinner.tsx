import clsx from "clsx";
import { Loader2 } from "lucide-react";

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={clsx("h-4 w-4 animate-spin", className)} aria-label="Loading" />;
}
