import React from 'react';
import './HomePage.css';

const teasers = [
  {
    title: 'Evict the house',
    description:
      'P2Picks puts the power back in your hands. There is no house, middleman, or hidden fees; just a fair, zero-sum game. Instead of losing to DraftKings, you compete directly against friends, where every cent won comes straight from their pockets.',
  },
  {
    title: 'Google sign in',
    description:
      'Getting into the action shouldn\'t be a hassle. Sign in securely using your Google account, with no lengthy forms or setup required. Click the Login button up top, and you will be instantly ready to hop into a Table and start competing against your friends.',
  },
  {
    title: 'Split the pot',
    description:
      'Payouts are pooled, meaning the value of a win is tied to how many others agree with you. Following the crowd yields small returns, so the best strategy is to "fade the public". Outsmart your tablemates to take home a bigger slice of the total pot.',
  },
];

export const HomePage: React.FC = () => {
  const scrollingTeasers = [...teasers, ...teasers];

  return (
    <div>
      <section className="hero-section">
        <h1 className='hero-title'><strong>Welcome to P2Picks</strong></h1>
        <p className='hero-subtitle'>
          A democratized, houseless sports entertainment platform
        </p>
      </section>

      <div className="teaser-container" aria-live="polite">
        <div className="teaser-scroller">
          <div className="teaser-track">
            {scrollingTeasers.map((teaser, index) => (
              <div className="teaser-card" key={`${teaser.title}-${index}`}>
                <h3 className='teaser-title'>{teaser.title}</h3>
                <p className='teaser-description'>{teaser.description}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};