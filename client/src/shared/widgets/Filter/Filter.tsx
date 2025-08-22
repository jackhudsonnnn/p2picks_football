import './Filter.css';

export interface FilterOption {
  id: string;
  label: string;
  count?: number;
}

interface FilterBarProps {
  selectedFilter: string;
  onFilterChange: (filterId: string) => void;
  options: FilterOption[];
  className?: string;
}

const FilterBar = ({ selectedFilter, onFilterChange, options, className = "" }: FilterBarProps) => {
  return (
    <div className={`filter-bar ${className}`}>
      {options.map((option) => (
        <button
          key={option.id}
          className={`filter-btn ${selectedFilter === option.id ? "active" : ""}`}
          onClick={() => onFilterChange(option.id)}
        >
          {option.label}
          {option.count !== undefined && ` (${option.count})`}
        </button>
      ))}
    </div>
  );
};

export default FilterBar;
