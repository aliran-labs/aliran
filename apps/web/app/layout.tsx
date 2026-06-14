import type { Metadata } from 'next';
import { Space_Grotesk, Inter, JetBrains_Mono } from 'next/font/google';
import './globals.css';
import { Providers } from './providers';
import { Shell } from './components/Shell';

const display = Space_Grotesk({ subsets: ['latin'], variable: '--font-display', display: 'swap' });
const sans = Inter({ subsets: ['latin'], variable: '--font-sans', display: 'swap' });
const mono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono', display: 'swap' });

export const metadata: Metadata = {
  title: 'Aliran — Autonomous Treasury OS',
  description:
    'One capped delegation to an AI CFO that redelegates stricter budgets to worker agents. Payments via ERC-7710.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${sans.variable} ${mono.variable}`}>
      <body>
        <Providers>
          <Shell>{children}</Shell>
        </Providers>
      </body>
    </html>
  );
}
