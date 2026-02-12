import React, { useEffect, useRef, useState } from 'react';

/** Pixels per second for constant velocity scrolling. */
const SCROLL_SPEED = 10;

interface TicketFooterLeftProps {
  isActive: boolean;
  currentValue: string;
  optionList: string[];
  betContainerClassName: string;
  onGuessChange: (newGuess: string) => void;
}

export const TicketFooterLeft: React.FC<TicketFooterLeftProps> = React.memo(({
  isActive,
  currentValue,
  optionList,
  betContainerClassName,
  onGuessChange,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const spanRef = useRef<HTMLSpanElement>(null);
  const [isOverflowing, setIsOverflowing] = useState(false);
  const [scrollStyle, setScrollStyle] = useState<React.CSSProperties>({});

  useEffect(() => {
    const checkOverflow = () => {
      if (containerRef.current && spanRef.current) {
        const style = getComputedStyle(containerRef.current);
        const paddingLeft = parseFloat(style.paddingLeft) || 0;
        const paddingRight = parseFloat(style.paddingRight) || 0;
        const availableWidth = containerRef.current.clientWidth - paddingLeft - paddingRight;
        const textWidth = spanRef.current.scrollWidth;
        const overflowAmount = textWidth - availableWidth;

        if (overflowAmount > 0) {
          setIsOverflowing(true);
          const duration = overflowAmount / SCROLL_SPEED;
          setScrollStyle({
            '--scroll-duration': `${duration + 2}s`,
            '--scroll-distance': `-${overflowAmount}px`,
          } as React.CSSProperties);
        } else {
          setIsOverflowing(false);
          setScrollStyle({});
        }
      }
    };
    checkOverflow();
    window.addEventListener('resize', checkOverflow);
    return () => window.removeEventListener('resize', checkOverflow);
  }, [currentValue]);

  const readonlyClassName = ['bet-dropdown-readonly', isOverflowing && 'is-overflowing']
    .filter(Boolean)
    .join(' ');

  return (
    <div className="ticket-bet-options">
      <div className={betContainerClassName}>
        {isActive ? (
          <select
            className="bet-dropdown"
            value={currentValue}
            onChange={(e) => onGuessChange(e.target.value)}
          >
            {optionList.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        ) : (
          <div
            ref={containerRef}
            className={readonlyClassName}
            style={scrollStyle}
            aria-disabled="true"
            role="textbox"
            tabIndex={-1}
          >
            <span ref={spanRef}>{currentValue || 'No guess'}</span>
          </div>
        )}
      </div>
    </div>
  );
});
