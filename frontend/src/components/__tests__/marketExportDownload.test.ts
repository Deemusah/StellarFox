import '@testing-library/jest-dom';
import { downloadMarketData } from '../../utils/marketExport';
import type { Market } from '../../types';

describe('market export downloads', () => {
  afterEach(() => {
    delete (URL as unknown as { createObjectURL?: unknown }).createObjectURL;
    delete (URL as unknown as { revokeObjectURL?: unknown }).revokeObjectURL;
    jest.restoreAllMocks();
  });

  it('downloads the generated CSV through a temporary object URL', () => {
    const createObjectURL = jest.fn(() => 'blob:market-export');
    const revokeObjectURL = jest.fn();
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectURL });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectURL });

    const anchor = document.createElement('a');
    const createElement = jest.spyOn(document, 'createElement').mockReturnValue(anchor);
    const click = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    const market = { market_id: 'market-1' } as Market;

    downloadMarketData([market], 'csv');

    expect(createElement).toHaveBeenCalledWith('a');
    expect(anchor.download).toMatch(/^markets-\d{4}-\d{2}-\d{2}\.csv$/);
    expect(anchor.href).toBe('blob:market-export');
    expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
    expect(click).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:market-export');
  });
});