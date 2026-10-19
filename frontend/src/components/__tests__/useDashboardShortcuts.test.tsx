import { renderHook, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { useDashboardShortcuts } from '../../hooks/useDashboardShortcuts';

describe('useDashboardShortcuts', () => {
  const onHelp = jest.fn();
  const onCloseHelp = jest.fn();

  beforeEach(() => {
    onHelp.mockClear();
    onCloseHelp.mockClear();
    document.body.innerHTML = `
      <input id="market-search" />
      <div id="market-status-filter"><button role="tab">All</button></div>
    `;
  });

  it('focuses search and filters, and opens or closes shortcut help', () => {
    renderHook(() => useDashboardShortcuts({ onHelp, onCloseHelp }));
    const search = document.getElementById('market-search');
    const firstFilter = document.querySelector('[role="tab"]');

    fireEvent.keyDown(document, { key: '/' });
    expect(search).toHaveFocus();

    fireEvent.keyDown(document, { key: 'f' });
    expect(firstFilter).toHaveFocus();

    fireEvent.keyDown(document, { key: '?', shiftKey: true });
    expect(onHelp).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onCloseHelp).toHaveBeenCalledTimes(1);
  });

  it('does not intercept typing or modified browser shortcuts', () => {
    renderHook(() => useDashboardShortcuts({ onHelp, onCloseHelp }));
    const search = document.getElementById('market-search') as HTMLInputElement;

    fireEvent.keyDown(search, { key: 'f' });
    fireEvent.keyDown(document, { key: 'f', ctrlKey: true });
    fireEvent.keyDown(document, { key: '?', ctrlKey: true });

    expect(onHelp).not.toHaveBeenCalled();
    expect(onCloseHelp).not.toHaveBeenCalled();
    expect(search).not.toHaveFocus();
  });
});