import { useState, useEffect, ReactNode } from "react";
import "./Card.css";

const useIsMobile = () => {
  const [isMobile, setIsMobile] = useState(false);
  
  useEffect(() => {
    const checkIsMobile = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    
    checkIsMobile();
    window.addEventListener('resize', checkIsMobile);
    
    return () => window.removeEventListener('resize', checkIsMobile);
  }, []);
  
  return isMobile;
};

export interface CardProps<T = any> {
  data: T;
  isExpanded?: boolean;
  renderHeader?: (data: T) => ReactNode;
  renderContent?: (data: T) => ReactNode;
  renderActions?: (data: T, isMobile: boolean) => ReactNode;
  renderFooterLeft?: (data: T) => ReactNode;
  renderFooterRight?: (data: T) => ReactNode;
  className?: string;
  stateClass?: string;
  idField?: string;
}

const Card = <T extends Record<string, any>>({
  data,
  renderHeader,
  renderContent,
  renderActions,
  renderFooterLeft,
  renderFooterRight,
}: CardProps<T>) => {
  const isMobile = useIsMobile();

  return (
    <div className={`card`}>
      {/* Card Header */}
      {renderHeader && (
        <div className="card-header">
          {renderHeader(data)}
        </div>
      )}
      
      {/* Card Content */}
      {renderContent && (
        <div className="card-content">
          {renderContent(data)}
        </div>
      )}
      
      {/* Card Actions */}
      {renderActions && (
        <div className="card-actions">
          {renderActions(data, isMobile)}
        </div>
      )}
      
      {/* Card Footer */}
      {(renderFooterLeft || renderFooterRight) && (
        <div className="card-footer">
          {renderFooterLeft && (
            <div className="card-footer-left">
              {renderFooterLeft(data)}
            </div>
          )}
          
          {renderFooterRight && (
            <div className="card-footer-right">
              {renderFooterRight(data)}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default Card;