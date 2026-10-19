import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { FighterCard } from '../market/FighterCard';

jest.mock('next/image', () => ({
  __esModule: true,
  default: ({ fill: _fill, sizes: _sizes, placeholder, blurDataURL, ...props }: React.ImgHTMLAttributes<HTMLImageElement> & {
    fill?: boolean;
    sizes?: string;
    placeholder?: string;
    blurDataURL?: string;
  }) => <img {...props} data-placeholder={placeholder} data-blur-data-url={blurDataURL} />,
}));

describe('FighterCard image loading', () => {
  it('loads fighter images lazily with a blur placeholder', () => {
    render(<FighterCard name="Fighter" odds={5000} poolXlm={100} photoUrl="https://images.example/fighter.jpg" />);

    const image = screen.getByRole('img', { name: 'Fighter' });
    expect(image).toHaveAttribute('loading', 'lazy');
    expect(image).toHaveAttribute('data-placeholder', 'blur');
    expect(image.getAttribute('data-blur-data-url')).toContain('data:image/svg+xml');
  });
});