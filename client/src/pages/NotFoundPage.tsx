import React from 'react';
import { Link } from 'react-router-dom';
import './styles/NotFoundPage.css';

export const NotFoundPage: React.FC = () => {
  return (
    <div className="not-found-page">
      <h1>This is the Not Found page</h1>
      <p>The page you're looking for doesn't exist.</p>
      <Link to="/" className="back-link">Go back to the homepage</Link>
    </div>
  );
};