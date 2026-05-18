import './blog.css';
import { Playfair_Display } from 'next/font/google';

const playfair = Playfair_Display({
  subsets: ['latin'],
  weight: ['700', '900'],
  style: ['normal', 'italic'],
  variable: '--font-playfair',
  display: 'swap',
});

export default function BlogLayout({ children }: { children: React.ReactNode }) {
  return <div className={playfair.variable}>{children}</div>;
}
