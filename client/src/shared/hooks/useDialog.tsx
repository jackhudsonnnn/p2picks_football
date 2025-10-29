import { useCallback, useState, type ReactNode } from 'react';
import Modal from '@shared/widgets/Modal/Modal';

type DialogType = 'alert' | 'confirm';

interface DialogOptions {
  title?: string;
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
}

interface DialogState extends DialogOptions {
  type: DialogType;
  resolve: (value: boolean) => void;
}

const DEFAULT_TITLES: Record<DialogType, string> = {
  alert: 'Notice',
  confirm: 'Confirm Action',
};

export function useDialog() {
  const [state, setState] = useState<DialogState | null>(null);

  const close = useCallback((result: boolean) => {
    setState((current) => {
      if (current) {
        current.resolve(result);
      }
      return null;
    });
  }, []);

  const showAlert = useCallback(
    ({ title, message, confirmLabel }: DialogOptions) =>
      new Promise<void>((resolve) => {
        setState({
          type: 'alert',
          title,
          message,
          confirmLabel,
          resolve: () => resolve(),
        });
      }),
    [],
  );

  const showConfirm = useCallback(
    ({ title, message, confirmLabel, cancelLabel }: DialogOptions) =>
      new Promise<boolean>((resolve) => {
        setState({
          type: 'confirm',
          title,
          message,
          confirmLabel,
          cancelLabel,
          resolve,
        });
      }),
    [],
  );

  const dialogNode = state ? (
    <Modal
      isOpen
      onClose={() => close(state.type === 'alert')}
      title={state.title ?? DEFAULT_TITLES[state.type]}
      footer={
        <div className="dialog-footer">
          {state.type === 'confirm' && (
            <button type="button" className="btn btn-secondary" onClick={() => close(false)}>
              {state.cancelLabel ?? 'Cancel'}
            </button>
          )}
          <button type="button" className="btn btn-primary" onClick={() => close(true)}>
            {state.confirmLabel ?? (state.type === 'confirm' ? 'Confirm' : 'OK')}
          </button>
        </div>
      }
    >
      <div className="dialog-message">{state.message}</div>
    </Modal>
  ) : null;

  return {
    showAlert,
    showConfirm,
    dialogNode,
  } as const;
}
