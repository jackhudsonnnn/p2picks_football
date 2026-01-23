import React, { useCallback, useEffect, useState } from 'react';
import type { ModeOverview, League } from '@features/bets/types';
import { useModeCatalog } from '@features/bets/hooks/useModeCatalog';
import { fetchActiveLeagues } from '@features/bets/service';
import { Modal } from '@shared/widgets/Modal/Modal';
import './ModeReference.css';

const FALLBACK_LEAGUES: League[] = ['U2Pick'];

interface ModeReferenceProps {
  /** Initial league to display (defaults to NFL) */
  initialLeague?: League;
  /** Whether the component is enabled (e.g., user is logged in) */
  enabled?: boolean;
}

export const ModeReference: React.FC<ModeReferenceProps> = ({ 
  initialLeague = 'U2Pick',
  enabled = true,
}) => {
  const [activeLeagues, setActiveLeagues] = useState<League[]>(FALLBACK_LEAGUES);
  const [activeLeaguesLoading, setActiveLeaguesLoading] = useState(false);
  const [selectedLeague, setSelectedLeague] = useState<League>(initialLeague);
  const [selectedOverview, setSelectedOverview] = useState<ModeOverview | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setActiveLeaguesLoading(true);
    fetchActiveLeagues(controller.signal)
      .then((leagues) => {
        const list = leagues.length > 0 ? leagues : FALLBACK_LEAGUES;
        setActiveLeagues(list);
        setSelectedLeague((current) => (list.includes(current) ? current : list[0]));
      })
      .catch(() => {
        setActiveLeagues(FALLBACK_LEAGUES);
        setSelectedLeague((current) => (FALLBACK_LEAGUES.includes(current) ? current : FALLBACK_LEAGUES[0]));
      })
      .finally(() => setActiveLeaguesLoading(false));

    return () => controller.abort();
  }, []);

  const {
    overviews,
    loading,
    error,
    refresh,
  } = useModeCatalog({ league: selectedLeague, enabled });

  const showSkeleton = loading && overviews.length === 0;
  const showError = Boolean(error) && !loading;

  const openModal = useCallback((overview: ModeOverview) => {
    setSelectedOverview(overview);
    setIsModalOpen(true);
  }, []);

  const closeModal = useCallback(() => {
    setIsModalOpen(false);
  }, []);

  const handleKeyOpen = useCallback(
    (event: React.KeyboardEvent<HTMLElement>, overview: ModeOverview) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        openModal(overview);
      }
    },
    [openModal],
  );

  const handleLeagueChange = useCallback((event: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedLeague(event.target.value as League);
  }, []);

  return (
    <section className="mode-reference" aria-live="polite">
      <header className="mode-reference__header">
        <h2 className="mode-reference__title">Bet Modes</h2>
        <div className="mode-reference__league-selector">
          <label htmlFor="mode-league-select" className="visually-hidden">
            Select League
          </label>
          <select
            id="mode-league-select"
            className="mode-reference__select"
            value={selectedLeague}
            onChange={handleLeagueChange}
            disabled={loading || activeLeaguesLoading}
          >
            {activeLeagues.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </div>
      </header>

      {showSkeleton && (
        <div className="mode-reference__status" role="status">
          Loading bet modes…
        </div>
      )}
      {showError && (
        <div className="mode-reference__status" role="alert">
          <p>{"Something went wrong, please try again later."}</p>
          <button type="button" className="mode-reference__retry" onClick={() => refresh()}>
            Try again
          </button>
        </div>
      )}
      {!showSkeleton && !showError && overviews.length === 0 && (
        <div className="mode-reference__status" role="status">
          No bet modes available for {selectedLeague} yet.
        </div>
      )}
      <div className="mode-reference__grid">
        {overviews.map((overview) => (
          <article
            key={overview.key}
            className="mode-card"
            role="button"
            tabIndex={0}
            aria-haspopup="dialog"
            onClick={() => openModal(overview)}
            onKeyDown={(event) => handleKeyOpen(event, overview)}
          >
            <header className="mode-card__header">
              <h2 className="mode-card__title">{overview.label}</h2>
              <p className="mode-card__tag">{overview.tagline}</p>
            </header>
          </article>
        ))}
      </div>
      {loading && overviews.length > 0 && (
        <div className="mode-reference__footer" role="status">
          Updating…
        </div>
      )}
      <Modal
        isOpen={isModalOpen && Boolean(selectedOverview)}
        onClose={closeModal}
        title={selectedOverview?.label ?? 'Mode details'}
      >
        {selectedOverview && (
          <div className="mode-card__body">
            <p className="mode-card__description">{selectedOverview.description}</p>
            <div className="mode-card__section">
              <h3>Bet configuration</h3>
              <ul>
                {selectedOverview.proposerConfiguration.map((item, index) => (
                  <li key={index}>{item}</li>
                ))}
              </ul>
            </div>
            <div className="mode-card__section">
              <h3>Participant choices</h3>
              <ul>
                {selectedOverview.participantChoices.map((choice, index) => (
                  <li key={index}>{choice}</li>
                ))}
              </ul>
            </div>
            <div className="mode-card__section">
              <h3>Winning condition</h3>
              <p className="mode-card__description">{selectedOverview.winningCondition}</p>
            </div>
            {selectedOverview.notes && selectedOverview.notes.length > 0 && (
              <div className="mode-card__section">
                <h3>Notes</h3>
                <ul>
                  {selectedOverview.notes.map((note, index) => (
                    <li key={index}>{note}</li>
                  ))}
                </ul>
              </div>
            )}
            {selectedOverview.example && (
              <div className="mode-card__section">
                <h3>{selectedOverview.example.title ?? 'Example'}</h3>
                <p className="mode-card__description">{selectedOverview.example.description}</p>
              </div>
            )}
          </div>
        )}
      </Modal>
    </section>
  );
};
