import './globals.css';
import type { ReactNode } from 'react';

export const metadata = {
  title: 'WidgetAI — answers from your site',
  description: 'An embeddable site assistant that answers from your content and cites its sources.'
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}
