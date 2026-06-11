import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Aliran — Autonomous Treasury OS',
  description:
    'One capped delegation to an AI CFO that redelegates stricter budgets to worker agents. Payments via ERC-7710.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
