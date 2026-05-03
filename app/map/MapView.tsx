'use client';

import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { useRouter } from 'next/navigation';
import type { ComputedListing, ListingFilters, MotivationLabel } from '@/types';
import { fmtAED } from '@/lib/almanac';

interface Props {
  initialListings: ComputedListing[];
}

const MOTIVATION_COLORS: Record<MotivationLabel, string> = {
  HIGH: '#8A2E1F',
  MEDIUM: '#8C6A2A',
  LOW: '#2D4A2A',
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
        <span class="map-popup-motivation" style="color:${motivationColor}">${listing.motivation_score}</span>
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
      style: 'mapbox://styles/mapbox/light-v11',
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

      // Cluster circles — ink on paper
      map.addLayer({
        id: 'clusters',
        type: 'circle',
        source: 'listings',
        filter: ['has', 'point_count'],
        paint: {
          'circle-color': '#16140E',
          'circle-radius': ['step', ['get', 'point_count'], 20, 10, 28, 30, 36],
          'circle-opacity': 0.92,
          'circle-stroke-width': 2,
          'circle-stroke-color': '#F1ECE0',
        },
      });

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
        paint: { 'text-color': '#F1ECE0' },
      });

      map.addLayer({
        id: 'unclustered-point',
        type: 'circle',
        source: 'listings',
        filter: ['!', ['has', 'point_count']],
        paint: {
          'circle-color': ['get', 'color'],
          'circle-radius': ['get', 'radius'],
          'circle-opacity': 0.88,
          'circle-stroke-width': 1.5,
          'circle-stroke-color': '#F1ECE0',
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
    <div className="almanac-page" style={{ paddingBottom: 0 }}>
      <div className="section-bar">
        <h3>
          The <em>Yield Atlas</em>
        </h3>
        <div className="section-bar-meta">
          {filteredListings.length} entries plotted
          {activeFilterCount > 0 && <><br />{activeFilterCount} particular{activeFilterCount > 1 ? 's' : ''} applied</>}
        </div>
      </div>

      {/* Filters as Almanac filter bar */}
      <div className="filter-bar">
        <div className="filter-group">
          <span className="filter-label">Area</span>
          <select
            className="filter-select"
            value={filters.area ?? ''}
            onChange={(e) => setFilters((f) => ({ ...f, area: e.target.value || undefined }))}
          >
            <option value="">All</option>
            {areas.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        </div>
        <div className="filter-group">
          <span className="filter-label">Type</span>
          <select
            className="filter-select"
            value={filters.property_type ?? ''}
            onChange={(e) => setFilters((f) => ({ ...f, property_type: e.target.value || undefined }))}
          >
            <option value="">Any</option>
            {propertyTypes.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
        <div className="filter-group">
          <span className="filter-label">Beds</span>
          <select
            className="filter-select"
            value={filters.beds ?? ''}
            onChange={(e) =>
              setFilters((f) => ({ ...f, beds: e.target.value ? Number(e.target.value) : undefined }))
            }
          >
            <option value="">Any</option>
            {bedOptions.map((b) => (
              <option key={b} value={b}>{b}</option>
            ))}
          </select>
        </div>
        <div className="filter-group">
          <span className="filter-label">Min cut %</span>
          <input
            type="number"
            inputMode="decimal"
            placeholder="0"
            value={filters.min_drop_percent ?? ''}
            onChange={(e) =>
              setFilters((f) => ({ ...f, min_drop_percent: e.target.value ? Number(e.target.value) : undefined }))
            }
            className="filter-input"
            min={0}
            max={100}
            step={1}
          />
        </div>
        <div className="filter-group">
          <span className="filter-label">Min yield %</span>
          <input
            type="number"
            inputMode="decimal"
            placeholder="0"
            value={filters.min_yield ?? ''}
            onChange={(e) =>
              setFilters((f) => ({ ...f, min_yield: e.target.value ? Number(e.target.value) : undefined }))
            }
            className="filter-input"
            min={0}
            max={30}
            step={0.5}
          />
        </div>
        <div className="filter-group">
          <span className="filter-label">Motivation</span>
          <select
            className="filter-select"
            value={filters.motivation ?? ''}
            onChange={(e) =>
              setFilters((f) => ({ ...f, motivation: (e.target.value as MotivationLabel) || undefined }))
            }
          >
            <option value="">Any</option>
            <option value="HIGH">HIGH</option>
            <option value="MEDIUM">MEDIUM</option>
            <option value="LOW">LOW</option>
          </select>
          {activeFilterCount > 0 && (
            <button type="button" className="filter-opt" onClick={resetFilters}>
              reset
            </button>
          )}
        </div>
      </div>

      <div className="atlas">
        {/* MAP CANVAS */}
        <div className="atlas-canvas" style={{ aspectRatio: 'auto', height: 720 }}>
          {/* Mobile sidebar toggle */}
          <button
            onClick={() => setSidebarOpen((o) => !o)}
            type="button"
            style={{
              position: 'absolute',
              top: 12,
              left: 12,
              zIndex: 5,
              background: 'var(--paper)',
              border: '1px solid var(--rule)',
              padding: '6px 12px',
              fontFamily: 'var(--mono)',
              fontSize: 11,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              cursor: 'pointer',
            }}
            className="md:hidden"
          >
            {sidebarOpen ? 'Hide list' : 'Show list'}
          </button>

          {!process.env.NEXT_PUBLIC_MAPBOX_TOKEN && (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                zIndex: 5,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontFamily: 'var(--display)',
                fontStyle: 'italic',
                fontSize: 18,
                color: 'var(--ink-3)',
                background: 'var(--paper-2)',
                padding: 20,
                textAlign: 'center',
              }}
            >
              Set NEXT_PUBLIC_MAPBOX_TOKEN to compose the atlas.
            </div>
          )}

          <div ref={mapContainer} style={{ position: 'absolute', inset: 0 }} />
        </div>

        {/* SIDEBAR LIST */}
        <div
          className={sidebarOpen ? '' : 'hidden md:block'}
          style={{ display: sidebarOpen ? 'block' : undefined }}
        >
          <div className="eyebrow" style={{ marginBottom: 12 }}>
            Plotted entries · {sidebarItems.length} in view
            {filteredListings.length !== initialListings.length && (
              <> · {filteredListings.length} filtered</>
            )}
          </div>

          <div className="atlas-list">
            {sidebarItems.length === 0 ? (
              <div
                style={{
                  padding: '40px 16px',
                  fontFamily: 'var(--display)',
                  fontStyle: 'italic',
                  color: 'var(--ink-3)',
                  textAlign: 'center',
                }}
              >
                — Nothing in view —
              </div>
            ) : (
              sidebarItems.map((listing, i) => (
                <SidebarListItem
                  key={listing.id}
                  index={i + 1}
                  listing={listing}
                  onClick={() => flyToListing(listing)}
                />
              ))
            )}
          </div>

          <div
            style={{
              marginTop: 16,
              paddingTop: 12,
              borderTop: '1px solid var(--rule-soft)',
              fontFamily: 'var(--mono)',
              fontSize: 10,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              color: 'var(--ink-3)',
              display: 'flex',
              gap: 14,
              flexWrap: 'wrap',
            }}
          >
            <span>Motivation:</span>
            {(['HIGH', 'MEDIUM', 'LOW'] as MotivationLabel[]).map((m) => (
              <span key={m} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: MOTIVATION_COLORS[m],
                    display: 'inline-block',
                  }}
                />
                {m}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Sidebar list item ──────────────────────────────────────────────────────

function SidebarListItem({
  index,
  listing,
  onClick,
}: {
  index: number;
  listing: ComputedListing;
  onClick: () => void;
}) {
  return (
    <div className="atlas-item" onClick={onClick}>
      <div className="num">{String(index).padStart(2, '0')}.</div>
      <div>
        <div className="name">{listing.title ?? 'Untitled'}</div>
        <div className="meta">
          {listing.area ?? '—'}
          {listing.beds !== null ? ` · ${listing.beds}br` : ''}
          {listing.estimated_gross_yield !== null ? ` · ${listing.estimated_gross_yield.toFixed(1)}% yield` : ''}
        </div>
      </div>
      <div>
        <div className="price">{fmtAED(listing.price ?? 0)}</div>
        {listing.drop_percent !== null && listing.drop_percent > 0 && (
          <div className="drop">↓ {listing.drop_percent.toFixed(1)}%</div>
        )}
      </div>
    </div>
  );
}
