import React from 'react';
import './styles/HomePage.css';

export const HomePage: React.FC = () => {
  return (
    <div className="home-container">
      {/* Hero Section */}
      <section className="hero-section">
        <div className="container">
          <h1><strong>Welcome to P2Picks</strong></h1>
          <p>
            A democratized, houseless sports entertainment platform
          </p>
        </div>
      </section>

      {/* How It Works Section */}
      <section className="how-it-works-section container">
        <div className="steps-container">
          <div className="step container-primary">
            <h3>Sign using Google</h3>
            <p>Quick and easy—sign in with your Google account to get started.</p>
          </div>
          <div className="step container-primary">
            <h3>The house has been evicted</h3>
            <p>P2Picks puts the power back in your hands. No middleman, no house, just real competition between real people. Challenge friends or face off with the crowd.</p>
          </div>
          <div className="step container-primary">
            <h3>Every pick matters</h3>
            <p>Winners split the pot, so bring your A-game. Bragging rights (and your wallet) are on the line.</p>
          </div>
        </div>
      </section>
    </div>
  );
};