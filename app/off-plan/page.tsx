import type { Metadata } from 'next';
import { getOffPlanAreas } from '@/lib/queries';

export const dynamic = 'force-dynamic';
import { OffPlanFeed } from './OffPlanFeed';

export const metadata: Metadata = {
  title: 'Off-Plan Register — The DXB Almanac',
  description: 'Off-plan properties — developer marks, payment plans, and handovers, filed daily.',
};

export default async function OffPlanPage() {
  let areas: string[] = [];
  try {
    areas = await getOffPlanAreas();
  } catch {
    // Graceful degradation — feed still works without the area filter options
  }

  return (
    <main className="almanac-page">
      <div className="section-bar">
        <h3>
          The <em>Off-Plan</em> Register
        </h3>
        <div className="section-bar-meta">
          New launches · payment plans · handovers
          <br />
          Filed daily, save Fridays
        </div>
      </div>
      <OffPlanFeed initialAreas={areas} />
    </main>
  );
}
