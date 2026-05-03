import type { Metadata } from 'next';
import dynamic from 'next/dynamic';
import './globals.css';

const NavBar = dynamic(() => import('@/components/NavBar').then((m) => m.NavBar), {
  ssr: false,
});

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
