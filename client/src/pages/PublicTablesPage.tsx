// import React from 'react';
import './styles/PublicTablesPage.css';

export const PublicTablesPage: React.FC = () => {
  return (
    <div className="container">
      <div className="coming-soon-container">
        <div className="coming-soon-content">
          <h1 className="coming-soon-title">Coming Soon</h1>
          <div className="coming-soon-divider"></div>
          <p className="coming-soon-teaser">
            Get Ready to Take on the Public! Real stakes, real competition. 
            Public tables and more ways to bet are coming soon to P2Picks!
          </p>
          <div className="coming-soon-icon">
            <i className="coming-soon-pulse"></i>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PublicTablesPage;