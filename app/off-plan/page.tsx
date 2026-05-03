import type { Metadata } from 'next';
import { getOffPlanAreas } from '@/lib/queries';

export const dynamic = 'force-dynamic';
import { OffPlanFeed } from './OffPlanFeed';

export const metadata: Metadata = {
  title: 'Off-Plan Listings — Dubai Price Intelligence',
  description: 'Browse off-plan properties with developer pricing, payment plans, and completion dates',
};

export default async function OffPlanPage() {
  let areas: string[] = [];
  try {
    areas = await getOffPlanAreas();
  } catch {
    // Graceful degradation — feed still works without the area filter options
  }

  return (
    <main className="min-h-screen bg-[#09090E] text-slate-100">
      <div className="mx-auto max-w-[1400px] px-4 pb-16 pt-8 sm:px-6 lg:px-8">
        {/* Header */}
        <header className="mb-8">
          <div className="mb-1 flex items-center gap-2 text-xs text-slate-500">
            <span>Dubai Price Intelligence</span>
            <span>/</span>
            <span className="text-slate-400">Off-Plan</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-100">Off-Plan Properties</h1>
          <p className="mt-1 text-sm text-slate-500">
            New launches with developer pricing, payment plans, and completion dates
          </p>
        </header>

        {/* Feed */}
        <OffPlanFeed initialAreas={areas} />
      </div>
    </main>
  );
}
