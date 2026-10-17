import { useCallback, useEffect, useState } from "react";

export type Page = "plant" | "work-orders";

const HASH: Record<Page, string> = { plant: "#/", "work-orders": "#/work-orders" };

function read(): Page {
  return window.location.hash === HASH["work-orders"] ? "work-orders" : "plant";
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
