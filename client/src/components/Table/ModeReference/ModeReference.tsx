import React, { useCallback, useState } from 'react';
import type { ModeOverview } from '@features/bets/types';
import './ModeReference.css';

interface ModeReferenceProps {
  overviews: ModeOverview[];
  loading: boolean;
  error: string | null;
  onRetry?: () => void;
}

export const ModeReference: React.FC<ModeReferenceProps> = ({ overviews, loading, error, onRetry }) => {
  const showSkeleton = loading && overviews.length === 0;
  const showError = Boolean(error) && !loading;
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(() => new Set());

  const toggleCard = useCallback((key: string) => {
    setExpandedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }, []);

  const handleKeyToggle = useCallback(
    (event: React.KeyboardEvent<HTMLElement>, key: string) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        toggleCard(key);
      }
    },
    [toggleCard],
  );

  return (
    <section className="mode-reference" aria-live="polite">
      {showSkeleton && (
        <div className="mode-reference__status" role="status">
          Loading bet modes…
        </div>
      )}
      {showError && (
        <div className="mode-reference__status" role="alert">
          <p>{error}</p>
          {onRetry && (
            <button type="button" className="mode-reference__retry" onClick={onRetry}>
              Try again
            </button>
          )}
        </div>
      )}
      {!showSkeleton && !showError && overviews.length === 0 && (
        <div className="mode-reference__status" role="status">
          No bet modes available yet.
        </div>
      )}
      <div className="mode-reference__grid">
        {overviews.map((overview) => (
          <article
            key={overview.key}
            className={`mode-card${expandedKeys.has(overview.key) ? ' is-expanded' : ''}`}
            role="button"
            tabIndex={0}
            aria-expanded={expandedKeys.has(overview.key)}
            aria-controls={`mode-card-${overview.key}-content`}
            onClick={() => toggleCard(overview.key)}
            onKeyDown={(event) => handleKeyToggle(event, overview.key)}
          >
            <header className="mode-card__header">
              <h2>{overview.label}</h2>
              <p className="mode-card__tag">{overview.tagline}</p>
            </header>
            {expandedKeys.has(overview.key) && (
              <div id={`mode-card-${overview.key}-content`} className="mode-card__body">
                <p className="mode-card__description">{overview.description}</p>
                <div className="mode-card__section">
                  <h3>Bet configuration</h3>
                  <ul>
                    {overview.proposerConfiguration.map((item, index) => (
                      <li key={index}>{item}</li>
                    ))}
                  </ul>
                </div>
                <div className="mode-card__section">
                  <h3>Participant choices</h3>
                  <ul>
                    {overview.participantChoices.map((choice, index) => (
                      <li key={index}>{choice}</li>
                    ))}
                  </ul>
                </div>
                <div className="mode-card__section">
                  <h3>Winning condition</h3>
                  <p className="mode-card__description">{overview.winningCondition}</p>
                </div>
                {overview.notes && overview.notes.length > 0 && (
                  <div className="mode-card__section">
                    <h3>Notes</h3>
                    <ul>
                      {overview.notes.map((note, index) => (
                        <li key={index}>{note}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {overview.example && (
                  <div className="mode-card__section">
                    <h3>{overview.example.title ?? 'Example'}</h3>
                    <p className="mode-card__description">{overview.example.description}</p>
                  </div>
                )}
              </div>
            )}
          </article>
        ))}
      </div>
      {loading && overviews.length > 0 && (
        <div className="mode-reference__footer" role="status">
          Updating…
        </div>
      )}
    </section>
  );
};
