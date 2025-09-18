import { useEffect } from 'react';

/**
 * Imperative DOM timer: updates element text without triggering React re-renders.
 * Pass an end time (Date or ISO string). If omitted, does nothing.
 * The format is coarse (m s) for minutes and seconds.
 */
export function useDomTimer(ref: React.RefObject<HTMLElement | null>, endTime?: string | Date | null) {
  useEffect(() => {
    if (!ref.current || !endTime) return;
    let active = true;
    let rafId: number | null = null;
    const end = new Date(endTime).getTime();

    const format = (ms: number) => {
      if (ms <= 0) return '0s';
      const totalSec = Math.ceil(ms / 1000);
      const m = Math.floor(totalSec / 60);
      const s = totalSec % 60;
      return m ? `${m}m ${s}s` : `${s}s`;
    };

    const tick = () => {
      if (!active || !ref.current) return;
      const remaining = end - Date.now();
      ref.current.textContent = format(remaining);
      if (remaining > 0) {
        rafId = requestAnimationFrame(tick);
      } else {
        rafId = null;
      }
    };

    tick();
    return () => {
      active = false;
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, [ref, endTime]);
}
