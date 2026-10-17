import { useEffect, useRef } from "react";

/** Publishes the header's height as --header-h on its parent, so map controls sit below it at any width. */
export function useHeaderHeight<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  useEffect(() => {
    const el = ref.current;
    const parent = el?.parentElement;
    if (!el || !parent) return;
    const observer = new ResizeObserver(() => parent.style.setProperty("--header-h", `${el.offsetHeight}px`));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return ref;
}
