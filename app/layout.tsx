import type { Metadata } from 'next';
import dynamic from 'next/dynamic';
import './globals.css';

const AlmanacShell = dynamic(
  () => import('@/components/AlmanacShell').then((m) => m.AlmanacShell),
  { ssr: false },
);

export const metadata: Metadata = {
  title: 'The DXB Almanac — A register of price corrections in Dubai property',
  description: 'A quiet, editorial register of price drops and corrections in Dubai real estate.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AlmanacShell>{children}</AlmanacShell>
      </body>
    </html>
  );
}
