import { useCallback, useEffect, useState } from "react";

export type Page = "plant" | "prevent" | "team";

const HASH: Record<Page, string> = { plant: "#/", prevent: "#/prevent", team: "#/team" };
// Work orders became the Team page's "By incident" view: old links still land there.
export const LEGACY_WORK_ORDERS = "#/work-orders";

function read(): Page {
  const hash = window.location.hash;
  if (hash === LEGACY_WORK_ORDERS) return "team";
  return (Object.keys(HASH) as Page[]).find((p) => p !== "plant" && HASH[p] === hash) ?? "plant";
}

/** The current page, kept in the URL hash so back/forward and reloads work without a router. */
export function useRoute(): [Page, (p: Page) => void] {
  const [page, setPage] = useState<Page>(read);
  useEffect(() => {
    const onChange = () => setPage(read());
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  const go = useCallback((p: Page) => {
    if (read() !== p) window.location.hash = HASH[p];
  }, []);
  return [page, go];
}
