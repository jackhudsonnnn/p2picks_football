import { useEffect, useMemo, useRef, useState } from "react";
import "./Filter.css";

export interface FilterOption {
  id: string;
  label: string;
  count?: number;
}

interface FilterBarProps {
  options: FilterOption[];
  selectedFilters: string[];
  onFilterChange: (selectedFilterIds: string[]) => void;
  className?: string;
  placeholder?: string;
  label?: string;
}

const FilterBar = ({
  options,
  selectedFilters,
  onFilterChange,
  className = "",
  placeholder = "All options",
  label,
}: FilterBarProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const activeSelection = useMemo(() => {
    if (!selectedFilters.length) {
      return options.map((option) => option.id);
    }

    return selectedFilters;
  }, [options, selectedFilters]);

  const summaryText = useMemo(() => {
    if (!activeSelection.length || activeSelection.length === options.length) {
      return placeholder;
    }

    const selectedLabels = options
      .filter((option) => activeSelection.includes(option.id))
      .map((option) => option.label);

    if (selectedLabels.length <= 2) {
      return selectedLabels.join(", ");
    }

    return `${selectedLabels.length} selected`;
  }, [activeSelection, options, placeholder]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  const toggleOption = (optionId: string) => {
    const nextSelection = new Set(activeSelection);

    if (nextSelection.has(optionId)) {
      nextSelection.delete(optionId);
    } else {
      nextSelection.add(optionId);
    }

    if (nextSelection.size === options.length) {
      onFilterChange([]);
      return;
    }

    onFilterChange(Array.from(nextSelection));
  };

  return (
    <div className={`filter-dropdown ${className}`} ref={containerRef}>
      {label && <span className="filter-dropdown__label">{label}</span>}
      <button
        type="button"
        className={`filter-trigger ${isOpen ? "open" : ""}`}
        onClick={() => setIsOpen((prev) => !prev)}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        <span className="filter-trigger__text">{summaryText}</span>
        <span className="filter-trigger__icon" aria-hidden>
          ▼
        </span>
      </button>
      {isOpen && (
        <div className="filter-menu" role="listbox">
          {options.map((option) => {
            const checked = activeSelection.includes(option.id);
            return (
              <label key={option.id} className="filter-menu__option">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleOption(option.id)}
                />
                <span>{option.label}</span>
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default FilterBar;
