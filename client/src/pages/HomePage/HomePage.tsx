import React from 'react';
import './HomePage.css';

export const HomePage: React.FC = () => {
  return (
    <div className="home-container">
      <section className="hero-section">
        <div className="container">
          <h1><strong>Welcome to P2Picks</strong></h1>
          <p>
            A democratized, houseless sports entertainment platform
          </p>
        </div>
      </section>

      <section className="how-it-works-section container">
        <div className="how-it-works-container">
          <div className="steps-container">
            <div className="step container-primary">
              <h3>The house has been evicted</h3>
              <p>P2Picks puts the power back in your hands. No middleman, no house, just real competition between real people. Challenge friends or face off with the crowd.</p>
            </div>
            <div className="step container-primary">
              <h3>Sign using Google</h3>
              <p>Quick, easy, and secure sign in by using your Google account credentials. Press the login button in the top right corner to get started.</p>
            </div>
            <div className="step container-primary">
              <h3>Every pick matters</h3>
              <p>Winners split the pot, so bring your A-game. Bragging rights (and your wallet) are on the line.</p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};