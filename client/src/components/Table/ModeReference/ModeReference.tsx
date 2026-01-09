import React, { useCallback, useState } from 'react';
import type { ModeOverview } from '@features/bets/types';
import { Modal } from '@shared/widgets/Modal/Modal';
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
  const [selectedOverview, setSelectedOverview] = useState<ModeOverview | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

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

  return (
    <section className="mode-reference" aria-live="polite">
      {showSkeleton && (
        <div className="mode-reference__status" role="status">
          Loading bet modes…
        </div>
      )}
      {showError && (
        <div className="mode-reference__status" role="alert">
          <p>{"Something went wrong, please try again later."}</p>
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
