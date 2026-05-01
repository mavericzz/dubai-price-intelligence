import dynamic from 'next/dynamic';
import { getListings } from '@/lib/queries';

// Mapbox GL requires browser APIs — disable SSR for the map component
const MapView = dynamic(() => import('./MapView'), {
  ssr: false,
  loading: () => (
    <div
      style={{
        background: '#09090E',
        height: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#6366F1',
        fontFamily: 'system-ui, sans-serif',
        fontSize: 14,
      }}
    >
      Loading map…
    </div>
  ),
});

export const metadata = {
  title: 'Map — Dubai Price Intelligence',
};

export default async function MapPage() {
  const listings = await getListings(
    { is_active: true },
    { field: 'drop_percent', direction: 'desc' },
    { page: 1, limit: 2000 },
  );

  return <MapView initialListings={listings} />;
}
