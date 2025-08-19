import './SearchBar.css';
import { ChangeEvent, ReactNode } from 'react';

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  inputClassName?: string;
  icon?: ReactNode;
  onSubmit?: () => void;
  ariaLabel?: string;
}

const SearchBar = ({ 
  value, 
  onChange, 
  placeholder = "Search...", 
  className = "",
  inputClassName = "",
  icon,
  onSubmit,
  ariaLabel = "Search input"
}: SearchBarProps) => {
  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    onChange(e.target.value);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (onSubmit && e.key === 'Enter') {
      onSubmit();
    }
  };

  return (
    <div className={`search-bar ${className}`}>
      {icon && <div className="search-icon">{icon}</div>}
      <input
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        className={`search-input ${inputClassName} ${icon ? 'with-icon' : ''}`}
        aria-label={ariaLabel}
      />
      {onSubmit && (
        <button 
          className="search-submit" 
          onClick={onSubmit}
          aria-label="Submit search"
        >
          Go
        </button>
      )}
    </div>
  );
};

export default SearchBar;
