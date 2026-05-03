import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default function NotFound() {
  return (
    <main className="flex min-h-[60vh] flex-col items-center justify-center bg-[#09090E] text-slate-100">
      <h1 className="text-4xl font-bold">404</h1>
      <p className="mt-2 text-slate-400">Page not found</p>
      <Link
        href="/"
        className="mt-6 rounded-md bg-[#6366F1] px-4 py-2 text-sm font-medium text-white hover:bg-[#5558E6]"
      >
        Back to Feed
      </Link>
    </main>
  );
}
