'use client';

import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { useRouter } from 'next/navigation';
import type { ComputedListing, ListingFilters, MotivationLabel } from '@/types';

interface Props {
  initialListings: ComputedListing[];
}

const MOTIVATION_COLORS: Record<MotivationLabel, string> = {
  HIGH: '#ef4444',
  MEDIUM: '#f97316',
  LOW: '#14b8a6',
};

const DUBAI_CENTER: [number, number] = [55.2708, 25.2048];

function buildPopupHTML(listing: ComputedListing): string {
  const phone = process.env.NEXT_PUBLIC_AGENCY_WHATSAPP;
  const msg = encodeURIComponent(
    `Hi, I'm interested in: ${listing.title ?? 'a listing'}${listing.listing_url ? `\n${listing.listing_url}` : ''}`,
  );
  const waHref = phone ? `https://wa.me/${phone}?text=${msg}` : null;
  const motivationColor = MOTIVATION_COLORS[listing.motivation_score];

  return `
    <div class="map-popup-inner">
      <a href="/listing/${listing.id}" class="map-popup-title">${listing.title ?? 'Listing'}</a>
      <div class="map-popup-price">AED ${(listing.price ?? 0).toLocaleString()}</div>
      <div class="map-popup-badges">
        <span class="map-popup-drop">↓ ${(listing.drop_percent ?? 0).toFixed(1)}%</span>
        <span class="map-popup-motivation" style="background:${motivationColor}22;color:${motivationColor}">${listing.motivation_score}</span>
        ${listing.estimated_gross_yield ? `<span class="map-popup-yield">${listing.estimated_gross_yield.toFixed(1)}% yield</span>` : ''}
      </div>
      ${
        waHref
          ? `<a href="${waHref}" target="_blank" rel="noopener noreferrer" class="map-popup-wa">
               <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/></svg>
               Contact Agent
             </a>`
          : ''
      }
    </div>
  `;
}

function pinRadius(dropPercent: number | null): number {
  return Math.max(6, Math.min(16, 6 + (dropPercent ?? 0) * 0.4));
}

export default function MapView({ initialListings }: Props) {
  const router = useRouter();
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const popupRef = useRef<mapboxgl.Popup | null>(null);
  const geojsonRef = useRef<GeoJSON.FeatureCollection | null>(null);

  const [filters, setFilters] = useState<ListingFilters>({});
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [viewportListings, setViewportListings] = useState<ComputedListing[]>([]);
  const [mapReady, setMapReady] = useState(false);

  // Unique filter options derived from all listings
  const areas = useMemo(
    () => [...new Set(initialListings.map((l) => l.area).filter((a): a is string => Boolean(a)))].sort(),
    [initialListings],
  );
  const propertyTypes = useMemo(
    () =>
      [...new Set(initialListings.map((l) => l.property_type).filter((p): p is string => Boolean(p)))].sort(),
    [initialListings],
  );
  const bedOptions = useMemo(
    () => [...new Set(initialListings.map((l) => l.beds).filter((b): b is number => b !== null))].sort((a, b) => a - b),
    [initialListings],
  );

  // Client-side filtered listings
  const filteredListings = useMemo(() => {
    return initialListings.filter((l) => {
      if (filters.area && l.area !== filters.area) return false;
      if (filters.property_type && l.property_type !== filters.property_type) return false;
      if (filters.beds !== undefined && l.beds !== filters.beds) return false;
      if (
        filters.min_drop_percent !== undefined &&
        (l.drop_percent === null || l.drop_percent < filters.min_drop_percent)
      )
        return false;
      if (
        filters.min_yield !== undefined &&
        (l.estimated_gross_yield === null || l.estimated_gross_yield < filters.min_yield)
      )
        return false;
      if (filters.motivation && l.motivation_score !== filters.motivation) return false;
      return true;
    });
  }, [initialListings, filters]);

  // GeoJSON for the map source
  const geojson = useMemo<GeoJSON.FeatureCollection>(() => ({
    type: 'FeatureCollection',
    features: filteredListings
      .filter((l) => l.lat !== null && l.lng !== null)
      .map((l) => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [l.lng!, l.lat!] },
        properties: {
          id: l.id,
          title: l.title ?? '',
          price: l.price ?? 0,
          drop_percent: l.drop_percent ?? 0,
          motivation: l.motivation_score,
          color: MOTIVATION_COLORS[l.motivation_score],
          radius: pinRadius(l.drop_percent),
          listing_url: l.listing_url ?? '',
          estimated_gross_yield: l.estimated_gross_yield ?? 0,
        },
      })),
  }), [filteredListings]);

  geojsonRef.current = geojson;

  // Show popup for a listing
  const showPopup = useCallback((listing: ComputedListing) => {
    if (!mapRef.current || !listing.lat || !listing.lng) return;
    if (popupRef.current) popupRef.current.remove();
    popupRef.current = new mapboxgl.Popup({ closeButton: true, maxWidth: '280px', offset: 10 })
      .setLngLat([listing.lng, listing.lat])
      .setHTML(buildPopupHTML(listing))
      .addTo(mapRef.current);
  }, []);

  // Fly to listing and show popup (sidebar click)
  const flyToListing = useCallback(
    (listing: ComputedListing) => {
      if (!mapRef.current || !listing.lat || !listing.lng) return;
      mapRef.current.flyTo({ center: [listing.lng, listing.lat], zoom: 15, duration: 800 });
      // Show popup after fly completes
      mapRef.current.once('moveend', () => showPopup(listing));
      // On mobile, close sidebar so the map is visible
      if (window.innerWidth < 768) setSidebarOpen(false);
    },
    [showPopup],
  );

  // Initialize map once
  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return;

    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
    if (!token) {
      console.error('[MapView] NEXT_PUBLIC_MAPBOX_TOKEN is not set');
      return;
    }

    mapboxgl.accessToken = token;

    const map = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/dark-v11',
      center: DUBAI_CENTER,
      zoom: 11,
    });
    mapRef.current = map;

    map.addControl(new mapboxgl.NavigationControl(), 'top-right');

    map.on('load', () => {
      // Add GeoJSON source with clustering
      map.addSource('listings', {
        type: 'geojson',
        data: geojsonRef.current ?? { type: 'FeatureCollection', features: [] },
        cluster: true,
        clusterMaxZoom: 14,
        clusterRadius: 50,
      });

      // Cluster circles
      map.addLayer({
        id: 'clusters',
        type: 'circle',
        source: 'listings',
        filter: ['has', 'point_count'],
        paint: {
          'circle-color': '#6366F1',
          'circle-radius': ['step', ['get', 'point_count'], 20, 10, 28, 30, 36],
          'circle-opacity': 0.85,
          'circle-stroke-width': 2,
          'circle-stroke-color': '#4f46e5',
        },
      });

      // Cluster count labels
      map.addLayer({
        id: 'cluster-count',
        type: 'symbol',
        source: 'listings',
        filter: ['has', 'point_count'],
        layout: {
          'text-field': '{point_count_abbreviated}',
          'text-font': ['DIN Offc Pro Medium', 'Arial Unicode MS Bold'],
          'text-size': 12,
        },
        paint: { 'text-color': '#ffffff' },
      });

      // Individual pins (data-driven color and radius)
      map.addLayer({
        id: 'unclustered-point',
        type: 'circle',
        source: 'listings',
        filter: ['!', ['has', 'point_count']],
        paint: {
          'circle-color': ['get', 'color'],
          'circle-radius': ['get', 'radius'],
          'circle-opacity': 0.9,
          'circle-stroke-width': 2,
          'circle-stroke-color': 'rgba(255,255,255,0.25)',
        },
      });

      // Zoom into cluster on click
      map.on('click', 'clusters', (e) => {
        const features = map.queryRenderedFeatures(e.point, { layers: ['clusters'] });
        if (!features.length) return;
        const clusterId = features[0].properties?.cluster_id as number;
        const source = map.getSource('listings') as mapboxgl.GeoJSONSource;
        const coords = (features[0].geometry as GeoJSON.Point).coordinates as [number, number];
        source.getClusterExpansionZoom(clusterId, (err: Error | null | undefined, zoom: number | null | undefined) => {
          if (err || zoom == null) return;
          map.easeTo({ center: coords, zoom });
        });
      });

      // Pin click → popup
      map.on('click', 'unclustered-point', (e) => {
        const feature = e.features?.[0];
        if (!feature) return;
        const coords = (feature.geometry as GeoJSON.Point).coordinates as [number, number];
        const id = feature.properties?.id as string;
        const listing = geojsonRef.current?.features
          .find((f) => f.properties?.id === id);

        if (!listing) return;

        // Find full listing object for popup rendering
        const fullListing = initialListings.find((l) => l.id === id);
        if (!fullListing) return;

        if (popupRef.current) popupRef.current.remove();
        popupRef.current = new mapboxgl.Popup({ closeButton: true, maxWidth: '280px', offset: 10 })
          .setLngLat(coords)
          .setHTML(buildPopupHTML(fullListing))
          .addTo(map);

        // Handle popup title click (navigation)
        popupRef.current.on('open', () => {
          const link = document.querySelector<HTMLAnchorElement>('.map-popup-title');
          if (link) {
            link.addEventListener('click', (ev) => {
              ev.preventDefault();
              router.push(`/listing/${id}`);
            });
          }
        });
      });

      // Cursor pointers
      map.on('mouseenter', 'clusters', () => { map.getCanvas().style.cursor = 'pointer'; });
      map.on('mouseleave', 'clusters', () => { map.getCanvas().style.cursor = ''; });
      map.on('mouseenter', 'unclustered-point', () => { map.getCanvas().style.cursor = 'pointer'; });
      map.on('mouseleave', 'unclustered-point', () => { map.getCanvas().style.cursor = ''; });

      // Sync viewport listings list
      const syncViewport = () => {
        const bounds = map.getBounds();
        if (!bounds) return;
        const visible = initialListings.filter(
          (l) => l.lat !== null && l.lng !== null && bounds.contains([l.lng!, l.lat!]),
        );
        setViewportListings(visible.slice(0, 100));
      };
      map.on('moveend', syncViewport);
      syncViewport();

      setMapReady(true);
    });

    return () => {
      popupRef.current?.remove();
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update map source when filtered listings change
  useEffect(() => {
    if (!mapRef.current) return;
    const updateSource = () => {
      const source = mapRef.current?.getSource('listings') as mapboxgl.GeoJSONSource | undefined;
      source?.setData(geojson);
    };
    if (mapRef.current.isStyleLoaded()) {
      updateSource();
    } else {
      mapRef.current.once('load', updateSource);
    }
  }, [geojson]);

  // Re-sync visible list on filter change (use all filtered listings as baseline)
  useEffect(() => {
    if (!mapRef.current || !mapReady) return;
    const bounds = mapRef.current.getBounds();
    if (!bounds) return;
    const visible = filteredListings.filter(
      (l) => l.lat !== null && l.lng !== null && bounds.contains([l.lng!, l.lat!]),
    );
    setViewportListings(visible.slice(0, 100));
  }, [filteredListings, mapReady]);

  const resetFilters = () => setFilters({});

  const activeFilterCount = Object.values(filters).filter((v) => v !== undefined && v !== '').length;

  // Sidebar listing items: visible listings synced to viewport
  const sidebarItems = viewportListings.length > 0 ? viewportListings : filteredListings.slice(0, 50);

  return (
    <div className="relative flex h-[calc(100vh-53px)] w-screen overflow-hidden bg-[#09090E]">
      {/* Mobile sidebar overlay backdrop */}
      {sidebarOpen && (
        <div
          className="absolute inset-0 z-10 bg-black/50 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`absolute inset-y-0 left-0 z-20 flex w-80 flex-col bg-[#111118] border-r border-[#1F1F2E] transition-transform duration-300 md:relative md:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Sidebar header */}
        <div className="flex items-center justify-between border-b border-[#1F1F2E] px-4 py-3">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-slate-100">Listings</h2>
            {activeFilterCount > 0 && (
              <span className="rounded-full bg-[#6366F1] px-2 py-0.5 text-xs text-white">
                {activeFilterCount} filter{activeFilterCount > 1 ? 's' : ''}
              </span>
            )}
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            className="rounded p-1 text-slate-400 hover:text-slate-200 md:hidden"
            aria-label="Close sidebar"
          >
            ✕
          </button>
        </div>

        {/* Filters */}
        <div className="border-b border-[#1F1F2E] px-4 py-3 space-y-2">
          <select
            value={filters.area ?? ''}
            onChange={(e) => setFilters((f) => ({ ...f, area: e.target.value || undefined }))}
            className="w-full rounded-md border border-[#1F1F2E] bg-[#09090E] px-2 py-1.5 text-xs text-slate-300 focus:border-[#6366F1] focus:outline-none"
          >
            <option value="">All areas</option>
            {areas.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>

          <div className="flex gap-2">
            <select
              value={filters.property_type ?? ''}
              onChange={(e) => setFilters((f) => ({ ...f, property_type: e.target.value || undefined }))}
              className="flex-1 rounded-md border border-[#1F1F2E] bg-[#09090E] px-2 py-1.5 text-xs text-slate-300 focus:border-[#6366F1] focus:outline-none"
            >
              <option value="">Type</option>
              {propertyTypes.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>

            <select
              value={filters.beds ?? ''}
              onChange={(e) =>
                setFilters((f) => ({ ...f, beds: e.target.value ? Number(e.target.value) : undefined }))
              }
              className="flex-1 rounded-md border border-[#1F1F2E] bg-[#09090E] px-2 py-1.5 text-xs text-slate-300 focus:border-[#6366F1] focus:outline-none"
            >
              <option value="">Beds</option>
              {bedOptions.map((b) => (
                <option key={b} value={b}>{b} bed{b !== 1 ? 's' : ''}</option>
              ))}
            </select>
          </div>

          <div className="flex gap-2">
            <input
              type="number"
              min={0}
              max={100}
              placeholder="Min drop %"
              value={filters.min_drop_percent ?? ''}
              onChange={(e) =>
                setFilters((f) => ({ ...f, min_drop_percent: e.target.value ? Number(e.target.value) : undefined }))
              }
              className="flex-1 rounded-md border border-[#1F1F2E] bg-[#09090E] px-2 py-1.5 text-xs text-slate-300 placeholder:text-slate-600 focus:border-[#6366F1] focus:outline-none"
            />
            <input
              type="number"
              min={0}
              max={30}
              step={0.5}
              placeholder="Min yield %"
              value={filters.min_yield ?? ''}
              onChange={(e) =>
                setFilters((f) => ({ ...f, min_yield: e.target.value ? Number(e.target.value) : undefined }))
              }
              className="flex-1 rounded-md border border-[#1F1F2E] bg-[#09090E] px-2 py-1.5 text-xs text-slate-300 placeholder:text-slate-600 focus:border-[#6366F1] focus:outline-none"
            />
          </div>

          <div className="flex items-center gap-2">
            <select
              value={filters.motivation ?? ''}
              onChange={(e) =>
                setFilters((f) => ({ ...f, motivation: (e.target.value as MotivationLabel) || undefined }))
              }
              className="flex-1 rounded-md border border-[#1F1F2E] bg-[#09090E] px-2 py-1.5 text-xs text-slate-300 focus:border-[#6366F1] focus:outline-none"
            >
              <option value="">All motivation</option>
              <option value="HIGH">HIGH</option>
              <option value="MEDIUM">MEDIUM</option>
              <option value="LOW">LOW</option>
            </select>

            {activeFilterCount > 0 && (
              <button
                onClick={resetFilters}
                className="rounded-md border border-[#1F1F2E] px-2 py-1.5 text-xs text-slate-400 hover:border-slate-500 hover:text-slate-200"
              >
                Reset
              </button>
            )}
          </div>
        </div>

        {/* Listing count */}
        <div className="px-4 py-2 text-xs text-slate-500">
          {sidebarItems.length} listing{sidebarItems.length !== 1 ? 's' : ''} in view
          {filteredListings.length !== initialListings.length && (
            <span className="ml-1 text-[#6366F1]">({filteredListings.length} filtered)</span>
          )}
        </div>

        {/* Listing list */}
        <div className="flex-1 overflow-y-auto">
          {sidebarItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-12 text-slate-500">
              <span className="text-3xl">🗺️</span>
              <p className="text-sm">No listings in view</p>
            </div>
          ) : (
            sidebarItems.map((listing) => (
              <SidebarListItem
                key={listing.id}
                listing={listing}
                onClick={() => flyToListing(listing)}
              />
            ))
          )}
        </div>

        {/* Legend */}
        <div className="border-t border-[#1F1F2E] px-4 py-3">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Motivation</span>
            <div className="flex gap-3">
              {(['HIGH', 'MEDIUM', 'LOW'] as MotivationLabel[]).map((m) => (
                <span key={m} className="flex items-center gap-1">
                  <span
                    className="inline-block h-2 w-2 rounded-full"
                    style={{ background: MOTIVATION_COLORS[m] }}
                  />
                  {m}
                </span>
              ))}
            </div>
          </div>
        </div>
      </aside>

      {/* Map container */}
      <div className="relative flex-1">
        {/* Sidebar toggle (mobile + desktop collapse) */}
        <button
          onClick={() => setSidebarOpen((o) => !o)}
          className="absolute left-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-lg bg-[#111118] border border-[#1F1F2E] text-slate-300 shadow-lg hover:border-[#6366F1] hover:text-[#6366F1] transition-colors md:hidden"
          aria-label="Toggle sidebar"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>

        {/* No token warning */}
        {!process.env.NEXT_PUBLIC_MAPBOX_TOKEN && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#09090E]">
            <p className="text-sm text-slate-400">
              Set <code className="rounded bg-[#1F1F2E] px-1 py-0.5 text-[#6366F1]">NEXT_PUBLIC_MAPBOX_TOKEN</code> to
              enable the map.
            </p>
          </div>
        )}

        <div ref={mapContainer} className="absolute inset-0" />
      </div>
    </div>
  );
}

// ─── Sidebar list item ──────────────────────────────────────────────────────

function SidebarListItem({
  listing,
  onClick,
}: {
  listing: ComputedListing;
  onClick: () => void;
}) {
  const motivationColor = MOTIVATION_COLORS[listing.motivation_score];

  return (
    <button
      onClick={onClick}
      className="w-full border-b border-[#1F1F2E] px-4 py-3 text-left transition-colors hover:bg-[#1a1a24] focus:outline-none focus:bg-[#1a1a24]"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="line-clamp-2 text-xs font-medium text-slate-200 leading-tight">
          {listing.title ?? 'Untitled'}
        </p>
        <span
          className="mt-0.5 shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold"
          style={{ background: `${motivationColor}22`, color: motivationColor }}
        >
          {listing.motivation_score}
        </span>
      </div>

      <div className="mt-1.5 flex items-center gap-2 text-[11px] text-slate-400">
        {listing.area && <span>{listing.area}</span>}
        {listing.beds !== null && <span>· {listing.beds}br</span>}
      </div>

      <div className="mt-1 flex items-center gap-2">
        <span className="text-xs font-semibold text-slate-200">
          AED {(listing.price ?? 0).toLocaleString()}
        </span>
        {listing.drop_percent !== null && listing.drop_percent > 0 && (
          <span className="rounded-full bg-red-500/15 px-1.5 py-0.5 text-[10px] font-medium text-red-400">
            ↓ {listing.drop_percent.toFixed(1)}%
          </span>
        )}
        {listing.estimated_gross_yield !== null && listing.estimated_gross_yield > 0 && (
          <span className="rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-medium text-emerald-400">
            {listing.estimated_gross_yield.toFixed(1)}%
          </span>
        )}
      </div>
    </button>
  );
}
