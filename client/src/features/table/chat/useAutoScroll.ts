import { type DependencyList, useEffect, useRef } from 'react';

export function useAutoScroll(deps: DependencyList = []) {
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, deps);

  return bottomRef;
}
