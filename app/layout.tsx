import type { Metadata } from 'next';
import './globals.css';
import { NavBar } from '@/components';

export const metadata: Metadata = {
  title: 'Dubai Price Intelligence',
  description: 'Track price drops and opportunities in Dubai real estate',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <NavBar />
        {children}
      </body>
    </html>
  );
}
