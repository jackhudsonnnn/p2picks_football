import { useEffect, useRef } from 'react';

export function useAutoScroll(deps: any[]) {
  const bottomRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return bottomRef;
}
