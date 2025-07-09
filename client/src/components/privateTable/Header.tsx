import './Header.css';
import { ReactNode } from 'react';

export interface StatItem {
  value: string | number;
  label: string;
}

interface PageHeaderProps {
  title: string | ReactNode;
  stats?: StatItem[];
  className?: string;
  titleClassName?: string;
  statsClassName?: string;
  actionButton?: ReactNode; // Add support for an action button
}

const PageHeader = ({ 
  title, 
  stats, 
  className = "", 
  titleClassName = "", 
  statsClassName = "",
  actionButton // New prop for action button
}: PageHeaderProps) => {
  return (
    <div className={`page-header ${className}`}>
      <div className={`page-title ${titleClassName}`}>
        {typeof title === 'string' ? <h1>{title}</h1> : title}
      </div>
      
      {actionButton && (
        <div className="page-action">
          {actionButton}
        </div>
      )}
      
      {!actionButton && stats && stats.length > 0 && (
        <div className={`page-stats ${statsClassName}`}>
          {stats.map((stat, index) => (
            <div key={index} className="stat">
              <span className="stat-value">{stat.value}</span>
              <span className="stat-label">{stat.label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default PageHeader;