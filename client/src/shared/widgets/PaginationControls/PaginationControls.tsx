import React from 'react';
import './PaginationControls.css';
import { IoIosArrowBack, IoIosArrowForward } from 'react-icons/io';

export interface PaginationControlsProps {
  current: number;
  total: number;
  onPrevious: () => void;
  onNext: () => void;
  disablePrevious?: boolean;
  disableNext?: boolean;
  className?: string;
  infoFormatter?: (current: number, total: number) => React.ReactNode;
  previousLabel?: string;
  nextLabel?: string;
}

export const PaginationControls: React.FC<PaginationControlsProps> = ({
  current,
  total,
  onPrevious,
  onNext,
  disablePrevious = false,
  disableNext = false,
  className,
  infoFormatter,
  previousLabel = 'Previous page',
  nextLabel = 'Next page',
}) => {
  const infoContent = infoFormatter ? infoFormatter(current, total) : `${current} of ${total}`;

  return (
    <div className={["pagination-controls", className].filter(Boolean).join(' ')}>
      <button
        type="button"
        className="nav-button"
        onClick={onPrevious}
        disabled={disablePrevious}
        aria-label={previousLabel}
        title={previousLabel}
      >
        <IoIosArrowBack />
      </button>
      <span className="pagination-info">{infoContent}</span>
      <button
        type="button"
        className="nav-button"
        onClick={onNext}
        disabled={disableNext}
        aria-label={nextLabel}
        title={nextLabel}
      >
        <IoIosArrowForward />
      </button>
    </div>
  );
};
