import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/**
 * false under SSR och första hydreringen, true därefter — utan setState i en effect.
 * Ersätter mönstret `const [mounted, setMounted] = useState(false); useEffect(() => setMounted(true), [])`.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(subscribe, () => true, () => false);
}
