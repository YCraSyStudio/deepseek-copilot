import { useEffect, useRef, useState } from "react";

/**
 * Collapsible activity blocks follow the round they belong to: they open while
 * the round streams and collapse once it ends, while a manual toggle always
 * wins until the next round boundary.
 */
export function useAutoCollapsePanel(isLive: boolean): [boolean, (open: boolean) => void] {
  const [open, setOpen] = useState(isLive);
  const wasLiveRef = useRef(isLive);

  useEffect(() => {
    if (isLive) {
      setOpen(true);
    } else if (wasLiveRef.current) {
      setOpen(false);
    }
    wasLiveRef.current = isLive;
  }, [isLive]);

  return [open, setOpen];
}
