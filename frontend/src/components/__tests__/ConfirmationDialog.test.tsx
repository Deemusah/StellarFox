import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ConfirmationDialog } from '../ui/ConfirmationDialog';

describe('ConfirmationDialog', () => {
  it('shows a destructive-action confirmation and reports confirm or cancel', () => {
    const onConfirm = jest.fn();
    const onCancel = jest.fn();
    render(
      <ConfirmationDialog
        title="Confirm settlement"
        confirmLabel="Confirm & Pay"
        busyLabel="Settling..."
        busy={false}
        onConfirm={onConfirm}
        onCancel={onCancel}
      >
        Send payment for invoice INV-1001?
      </ConfirmationDialog>,
    );

    expect(screen.getByRole('dialog')).toHaveAttribute('aria-modal', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm & Pay' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('prevents dismissal and repeat confirmation while the action is pending', () => {
    render(
      <ConfirmationDialog
        title="Confirm settlement"
        confirmLabel="Confirm & Pay"
        busyLabel="Settling..."
        busy
        onConfirm={jest.fn()}
        onCancel={jest.fn()}
      >
        Send payment?
      </ConfirmationDialog>,
    );

    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Settling...' })).toBeDisabled();
  });
});