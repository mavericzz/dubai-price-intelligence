'use client';

import { useEffect, useRef, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import {
  getWatchlists,
  createWatchlist,
  updateWatchlist,
  deleteWatchlist,
} from '@/lib/queries';
import type { Watchlist } from '@/types';

const DUBAI_AREAS = [
  'Al Barsha',
  'Al Quoz',
  'Business Bay',
  'Bur Dubai',
  'Deira',
  'Discovery Gardens',
  'Downtown Dubai',
  'Dubai Marina',
  'Dubai Silicon Oasis',
  'Dubai Sports City',
  'International City',
  'Jumeirah',
  'Jumeirah Beach Residence',
  'Jumeirah Lake Towers',
  'Jumeirah Village Circle',
  'Mirdif',
  'Palm Jumeirah',
  'The Springs',
] as const;

const PROPERTY_TYPES = ['Apartment', 'Villa', 'Townhouse', 'Penthouse', 'Studio'];
const BEDS = [0, 1, 2, 3, 4, 5, 6];

interface WatchlistFormData {
  name: string;
  areas: string[];
  property_type: string;
  beds_min: string;
  beds_max: string;
  max_price: string;
  min_drop_percent: string;
  min_yield: string;
  motivation_filter: string;
  email_enabled: boolean;
  whatsapp_enabled: boolean;
  whatsapp_phone: string;
}

const EMPTY_FORM: WatchlistFormData = {
  name: '',
  areas: [],
  property_type: '',
  beds_min: '',
  beds_max: '',
  max_price: '',
  min_drop_percent: '',
  min_yield: '',
  motivation_filter: '',
  email_enabled: true,
  whatsapp_enabled: false,
  whatsapp_phone: '',
};

function watchlistToForm(w: Watchlist): WatchlistFormData {
  return {
    name: w.name,
    areas: w.areas ?? [],
    property_type: w.property_type ?? '',
    beds_min: w.beds_min !== null ? String(w.beds_min) : '',
    beds_max: w.beds_max !== null ? String(w.beds_max) : '',
    max_price: w.max_price !== null ? String(w.max_price) : '',
    min_drop_percent: w.min_drop_percent !== null ? String(w.min_drop_percent) : '',
    min_yield: w.min_yield !== null ? String(w.min_yield) : '',
    motivation_filter: w.motivation_filter ?? '',
    email_enabled: w.email_enabled,
    whatsapp_enabled: w.whatsapp_enabled,
    whatsapp_phone: w.whatsapp_phone ?? '',
  };
}

function formToPayload(
  form: WatchlistFormData,
  userId: string,
): Omit<Watchlist, 'id' | 'created_at' | 'updated_at'> {
  return {
    user_id: userId,
    name: form.name.trim(),
    areas: form.areas.length > 0 ? form.areas : null,
    property_type: form.property_type || null,
    beds_min: form.beds_min !== '' ? Number(form.beds_min) : null,
    beds_max: form.beds_max !== '' ? Number(form.beds_max) : null,
    max_price: form.max_price !== '' ? Number(form.max_price) : null,
    min_drop_percent: form.min_drop_percent !== '' ? Number(form.min_drop_percent) : null,
    min_yield: form.min_yield !== '' ? Number(form.min_yield) : null,
    motivation_filter: form.motivation_filter || null,
    email_enabled: form.email_enabled,
    whatsapp_enabled: form.whatsapp_enabled,
    whatsapp_phone: form.whatsapp_enabled && form.whatsapp_phone ? form.whatsapp_phone : null,
    whatsapp_opted_in_at: null,
    whatsapp_opted_out_at: null,
  };
}

function ruleSummary(w: Watchlist): string {
  const parts: string[] = [];
  if (w.areas && w.areas.length > 0) {
    parts.push(w.areas.slice(0, 2).join(', ') + (w.areas.length > 2 ? ` +${w.areas.length - 2}` : ''));
  } else {
    parts.push('Any area');
  }
  if (w.property_type) parts.push(w.property_type);
  if (w.beds_min !== null || w.beds_max !== null) {
    const lo = w.beds_min !== null ? (w.beds_min === 0 ? 'Studio' : `${w.beds_min}br`) : '';
    const hi = w.beds_max !== null ? (w.beds_max === 0 ? 'Studio' : `${w.beds_max}br`) : '';
    parts.push(lo && hi && lo !== hi ? `${lo}–${hi}` : lo || hi);
  }
  if (w.max_price !== null) parts.push(`≤ AED ${w.max_price.toLocaleString()}`);
  if (w.min_drop_percent !== null) parts.push(`cut ≥ ${w.min_drop_percent}%`);
  if (w.min_yield !== null) parts.push(`yield ≥ ${w.min_yield}%`);
  if (w.motivation_filter) parts.push(w.motivation_filter);
  return parts.join(' · ');
}

function Spinner() {
  return (
    <div
      style={{
        width: 18,
        height: 18,
        border: '2px solid var(--rule-soft)',
        borderTopColor: 'var(--ink)',
        borderRadius: '50%',
        animation: 'spin 0.8s linear infinite',
      }}
    />
  );
}

function AreasSelect({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onOutside);
    return () => document.removeEventListener('mousedown', onOutside);
  }, []);

  function toggle(area: string) {
    onChange(value.includes(area) ? value.filter((a) => a !== area) : [...value, area]);
  }

  const label =
    value.length === 0
      ? 'Any area'
      : value.slice(0, 2).join(', ') + (value.length > 2 ? ` +${value.length - 2}` : '');

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="almanac-field"
        style={{ textAlign: 'left', cursor: 'pointer' }}
      >
        {label}
      </button>
      {open && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            zIndex: 50,
            maxHeight: 220,
            overflowY: 'auto',
            background: 'var(--paper)',
            border: '1px solid var(--rule)',
            padding: '6px 0',
          }}
        >
          {DUBAI_AREAS.map((area) => (
            <label
              key={area}
              style={{
                display: 'flex',
                gap: 10,
                padding: '6px 14px',
                cursor: 'pointer',
                fontFamily: 'var(--serif)',
                fontSize: 14,
              }}
            >
              <input
                type="checkbox"
                checked={value.includes(area)}
                onChange={() => toggle(area)}
                style={{ accentColor: 'var(--ink)' }}
              />
              {area}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

function LoginForm() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setLoading(true);
    setError('');
    const { error: authError } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: typeof window !== 'undefined' ? window.location.href : '' },
    });
    setLoading(false);
    if (authError) setError(authError.message);
    else setSent(true);
  }

  return (
    <div className="almanac-page" style={{ display: 'flex', justifyContent: 'center', paddingTop: 60 }}>
      <div className="almanac-card" style={{ maxWidth: 480, width: '100%' }}>
        <div className="eyebrow" style={{ color: 'var(--red)', marginBottom: 12 }}>
          The Subscriber&rsquo;s Ledger
        </div>
        {sent ? (
          <>
            <h2
              style={{
                fontFamily: 'var(--display)',
                fontSize: 36,
                lineHeight: 1,
                letterSpacing: '-0.02em',
                marginBottom: 14,
              }}
            >
              Word has been sent.
            </h2>
            <p
              style={{
                fontFamily: 'var(--display)',
                fontStyle: 'italic',
                fontSize: 18,
                color: 'var(--ink-2)',
                lineHeight: 1.5,
              }}
            >
              Look for a magic link in your inbox at <strong>{email}</strong>. The next edition cannot be filed
              without it.
            </p>
            <button
              type="button"
              onClick={() => setSent(false)}
              className="cta-secondary"
              style={{ marginTop: 24 }}
            >
              Use a different address
            </button>
          </>
        ) : (
          <>
            <h2
              style={{
                fontFamily: 'var(--display)',
                fontSize: 42,
                lineHeight: 1,
                letterSpacing: '-0.02em',
                marginBottom: 12,
              }}
            >
              Subscribe to <em style={{ fontStyle: 'italic' }}>the Ledger</em>.
            </h2>
            <p
              style={{
                fontFamily: 'var(--display)',
                fontStyle: 'italic',
                fontSize: 18,
                color: 'var(--ink-2)',
                marginBottom: 20,
                lineHeight: 1.45,
              }}
            >
              Standing orders and watched dossiers, sent by post or by wire when the next mark is filed.
            </p>
            <form onSubmit={handleSubmit}>
              <input
                type="email"
                placeholder="your@address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="almanac-field"
                style={{ marginBottom: 16 }}
              />
              {error && (
                <p style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--red)', marginBottom: 12 }}>
                  {error}
                </p>
              )}
              <button type="submit" disabled={loading} className="cta-stamp">
                {loading ? 'Filing…' : 'Send the magic link'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}

function WatchlistFormModal({
  initial,
  isEdit,
  onSave,
  onCancel,
}: {
  initial: WatchlistFormData;
  isEdit: boolean;
  onSave: (data: WatchlistFormData) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<WatchlistFormData>(initial);
  const [nameError, setNameError] = useState('');

  function set<K extends keyof WatchlistFormData>(key: K, value: WatchlistFormData[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) {
      setNameError('A standing order needs a name.');
      return;
    }
    onSave(form);
  }

  const labelStyle: React.CSSProperties = {
    fontFamily: 'var(--mono)',
    fontSize: 10,
    letterSpacing: '0.14em',
    textTransform: 'uppercase',
    color: 'var(--ink-3)',
    display: 'block',
    marginBottom: 4,
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        background: 'rgba(22, 20, 14, 0.42)',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        padding: '60px 16px',
        overflowY: 'auto',
      }}
      onClick={(e) => e.target === e.currentTarget && onCancel()}
    >
      <div
        style={{
          maxWidth: 560,
          width: '100%',
          background: 'var(--paper)',
          border: '1px solid var(--rule)',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '20px 28px',
            borderBottom: '1px solid var(--rule)',
          }}
        >
          <div>
            <div className="eyebrow" style={{ color: 'var(--red)' }}>
              {isEdit ? 'Edit Standing Order' : 'New Standing Order'}
            </div>
            <h3
              style={{
                fontFamily: 'var(--display)',
                fontSize: 26,
                marginTop: 4,
                letterSpacing: '-0.01em',
              }}
            >
              The particulars.
            </h3>
          </div>
          <button
            type="button"
            onClick={onCancel}
            style={{
              fontFamily: 'var(--mono)',
              fontSize: 11,
              letterSpacing: '0.14em',
              color: 'var(--ink-3)',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
            }}
          >
            CLOSE ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ padding: 28, display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div>
            <label style={labelStyle}>Name *</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => {
                set('name', e.target.value);
                setNameError('');
              }}
              placeholder="e.g. Two-bedroom Marina, under five"
              className="almanac-field"
              required
            />
            {nameError && (
              <p style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--red)', marginTop: 4 }}>
                {nameError}
              </p>
            )}
          </div>

          <div>
            <label style={labelStyle}>Areas</label>
            <AreasSelect value={form.areas} onChange={(v) => set('areas', v)} />
          </div>

          <div>
            <label style={labelStyle}>Property type</label>
            <select
              value={form.property_type}
              onChange={(e) => set('property_type', e.target.value)}
              className="almanac-field"
            >
              <option value="">Any type</option>
              {PROPERTY_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div>
              <label style={labelStyle}>Min beds</label>
              <select
                value={form.beds_min}
                onChange={(e) => set('beds_min', e.target.value)}
                className="almanac-field"
              >
                <option value="">Any</option>
                {BEDS.map((b) => (
                  <option key={b} value={String(b)}>
                    {b === 0 ? 'Studio' : `${b}`}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Max beds</label>
              <select
                value={form.beds_max}
                onChange={(e) => set('beds_max', e.target.value)}
                className="almanac-field"
              >
                <option value="">Any</option>
                {BEDS.map((b) => (
                  <option key={b} value={String(b)}>
                    {b === 0 ? 'Studio' : `${b}`}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label style={labelStyle}>Max price (AED)</label>
            <input
              type="number"
              value={form.max_price}
              onChange={(e) => set('max_price', e.target.value)}
              placeholder="e.g. 5,000,000"
              className="almanac-field"
              min={0}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div>
              <label style={labelStyle}>Min cut %</label>
              <input
                type="number"
                value={form.min_drop_percent}
                onChange={(e) => set('min_drop_percent', e.target.value)}
                placeholder="e.g. 10"
                className="almanac-field"
                min={0}
                max={100}
                step={0.1}
              />
            </div>
            <div>
              <label style={labelStyle}>Min yield %</label>
              <input
                type="number"
                value={form.min_yield}
                onChange={(e) => set('min_yield', e.target.value)}
                placeholder="e.g. 7"
                className="almanac-field"
                min={0}
                max={30}
                step={0.1}
              />
            </div>
          </div>

          <div>
            <label style={labelStyle}>Motivation</label>
            <select
              value={form.motivation_filter}
              onChange={(e) => set('motivation_filter', e.target.value)}
              className="almanac-field"
            >
              <option value="">Any</option>
              <option value="HIGH">HIGH</option>
              <option value="MEDIUM">MEDIUM</option>
              <option value="LOW">LOW</option>
            </select>
          </div>

          <div style={{ borderTop: '1px solid var(--rule-soft)', paddingTop: 18 }}>
            <div className="eyebrow" style={{ marginBottom: 10 }}>
              By what means
            </div>
            <label style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 10 }}>
              <input
                type="checkbox"
                checked={form.email_enabled}
                onChange={(e) => set('email_enabled', e.target.checked)}
                style={{ accentColor: 'var(--ink)' }}
              />
              <span style={{ fontFamily: 'var(--serif)', fontSize: 15 }}>By post (email)</span>
            </label>
            <label style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 10 }}>
              <input
                type="checkbox"
                checked={form.whatsapp_enabled}
                onChange={(e) => set('whatsapp_enabled', e.target.checked)}
                style={{ accentColor: 'var(--ink)' }}
              />
              <span style={{ fontFamily: 'var(--serif)', fontSize: 15 }}>By wire (WhatsApp)</span>
            </label>
            {form.whatsapp_enabled && (
              <input
                type="tel"
                value={form.whatsapp_phone}
                onChange={(e) => set('whatsapp_phone', e.target.value)}
                placeholder="+971 50 000 0000"
                className="almanac-field"
                style={{ marginLeft: 24, width: 'calc(100% - 24px)' }}
              />
            )}
          </div>

          <div
            style={{
              display: 'flex',
              gap: 12,
              borderTop: '1px solid var(--rule-soft)',
              paddingTop: 16,
              justifyContent: 'flex-end',
            }}
          >
            <button type="button" onClick={onCancel} className="cta-secondary" style={{ width: 'auto', padding: '10px 22px' }}>
              Cancel
            </button>
            <button type="submit" className="cta-stamp" style={{ width: 'auto', padding: '12px 26px' }}>
              {isEdit ? 'Amend the order' : 'File the order'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function WatchlistClient() {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [watchlists, setWatchlists] = useState<Watchlist[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [globalError, setGlobalError] = useState('');

  const [showForm, setShowForm] = useState(false);
  const [editingWatchlist, setEditingWatchlist] = useState<Watchlist | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setAuthLoading(false);
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) {
      setWatchlists([]);
      return;
    }
    setListLoading(true);
    getWatchlists(user.id)
      .then(setWatchlists)
      .catch(() => setGlobalError('Failed to load standing orders.'))
      .finally(() => setListLoading(false));
  }, [user]);

  function openCreate() {
    setEditingWatchlist(null);
    setShowForm(true);
  }
  function openEdit(w: Watchlist) {
    setEditingWatchlist(w);
    setShowForm(true);
  }
  function closeForm() {
    setShowForm(false);
    setEditingWatchlist(null);
  }

  function handleSave(formData: WatchlistFormData) {
    if (!user) return;
    const payload = formToPayload(formData, user.id);
    setGlobalError('');

    if (editingWatchlist) {
      const prev = editingWatchlist;
      const optimistic: Watchlist = { ...prev, ...payload };
      setWatchlists((list) => list.map((w) => (w.id === prev.id ? optimistic : w)));
      closeForm();
      updateWatchlist(prev.id, payload)
        .then((updated) =>
          setWatchlists((list) => list.map((w) => (w.id === updated.id ? updated : w))),
        )
        .catch(() => {
          setWatchlists((list) => list.map((w) => (w.id === prev.id ? prev : w)));
          setGlobalError('Failed to amend the order.');
        });
    } else {
      const tempId = `temp-${Date.now()}`;
      const placeholder: Watchlist = {
        id: tempId,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        ...payload,
      };
      setWatchlists((list) => [placeholder, ...list]);
      closeForm();
      createWatchlist(payload)
        .then((created) =>
          setWatchlists((list) => list.map((w) => (w.id === tempId ? created : w))),
        )
        .catch(() => {
          setWatchlists((list) => list.filter((w) => w.id !== tempId));
          setGlobalError('Failed to file the order.');
        });
    }
  }

  function handleDelete(id: string) {
    if (!confirm('Cancel this standing order? It cannot be restored.')) return;
    const removed = watchlists.find((w) => w.id === id);
    setWatchlists((list) => list.filter((w) => w.id !== id));
    setGlobalError('');
    deleteWatchlist(id).catch(() => {
      if (removed) setWatchlists((list) => [removed, ...list]);
      setGlobalError('Failed to cancel the order.');
    });
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
  }

  if (authLoading) {
    return (
      <div
        style={{
          padding: '80px 32px',
          textAlign: 'center',
          fontFamily: 'var(--display)',
          fontStyle: 'italic',
          color: 'var(--ink-3)',
        }}
      >
        — Loading the ledger —
      </div>
    );
  }

  if (!user) return <LoginForm />;

  return (
    <>
      <main className="almanac-page">
        <section style={{ padding: '40px 0 24px', borderBottom: '4px double var(--rule)' }}>
          <div className="eyebrow" style={{ color: 'var(--red)' }}>
            The Subscriber&rsquo;s Ledger
          </div>
          <h2
            className="almanac-display"
            style={{
              fontSize: 'clamp(48px, 6vw, 84px)',
              marginTop: 14,
              letterSpacing: '-0.025em',
              lineHeight: 1,
            }}
          >
            Properties you are <em style={{ fontStyle: 'italic' }}>quietly watching</em>.
          </h2>
          <p
            style={{
              fontFamily: 'var(--display)',
              fontStyle: 'italic',
              fontSize: 22,
              color: 'var(--ink-2)',
              marginTop: 14,
              maxWidth: 640,
            }}
          >
            We send word — by post or by wire — the moment any of these moves again.
          </p>
          <div
            style={{
              marginTop: 18,
              display: 'flex',
              gap: 18,
              alignItems: 'baseline',
              flexWrap: 'wrap',
              fontFamily: 'var(--mono)',
              fontSize: 11,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              color: 'var(--ink-3)',
            }}
          >
            <span>Subscriber · {user.email}</span>
            <button
              type="button"
              onClick={handleSignOut}
              style={{
                fontFamily: 'var(--mono)',
                fontSize: 11,
                letterSpacing: '0.1em',
                color: 'var(--ink-3)',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                textTransform: 'uppercase',
              }}
            >
              Sign out →
            </button>
          </div>
        </section>

        {globalError && (
          <div
            style={{
              marginTop: 20,
              padding: '10px 14px',
              border: '1px solid var(--red)',
              color: 'var(--red)',
              fontFamily: 'var(--mono)',
              fontSize: 12,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <span>{globalError}</span>
            <button
              type="button"
              onClick={() => setGlobalError('')}
              style={{ background: 'transparent', border: 'none', color: 'var(--red)', cursor: 'pointer' }}
            >
              ✕
            </button>
          </div>
        )}

        <div className="section-bar">
          <h3>
            <em>Standing</em> orders
          </h3>
          <div className="section-bar-meta">
            {watchlists.length} active · auto-checked daily
            <br />
            <button
              type="button"
              onClick={openCreate}
              style={{
                fontFamily: 'var(--display)',
                fontStyle: 'italic',
                fontSize: 16,
                color: 'var(--ink)',
                background: 'transparent',
                border: 'none',
                borderBottom: '1px solid var(--ink)',
                cursor: 'pointer',
                padding: '2px 0',
                marginTop: 6,
              }}
            >
              + File a new order
            </button>
          </div>
        </div>

        <div className="ledger">
          {listLoading ? (
            <div
              style={{
                padding: '40px 0',
                textAlign: 'center',
                fontFamily: 'var(--display)',
                fontStyle: 'italic',
                color: 'var(--ink-3)',
              }}
            >
              — Compiling the ledger —
            </div>
          ) : watchlists.length === 0 ? (
            <div
              style={{
                padding: '60px 32px',
                textAlign: 'center',
                background: 'var(--paper-2)',
                border: '1px solid var(--rule-soft)',
                marginTop: 24,
              }}
            >
              <div className="eyebrow">— No orders filed —</div>
              <p
                style={{
                  fontFamily: 'var(--display)',
                  fontStyle: 'italic',
                  fontSize: 24,
                  color: 'var(--ink-2)',
                  marginTop: 14,
                }}
              >
                File a standing order and our correspondent will notify you on the next mark.
              </p>
              <button
                type="button"
                onClick={openCreate}
                className="cta-stamp"
                style={{ width: 'auto', display: 'inline-block', marginTop: 22, padding: '12px 26px' }}
              >
                File the first order
              </button>
            </div>
          ) : (
            watchlists.map((w, i) => (
              <div className="ledger-row" key={w.id}>
                <div className="num">{String(i + 1).padStart(2, '0')}.</div>
                <div>
                  <div className="name">{w.name}</div>
                  <div className="rule-line">{ruleSummary(w)}</div>
                </div>
                <div className="stat-grid">
                  <div>
                    <div className="stat-label">Means</div>
                    <div
                      className="stat-val"
                      style={{ fontSize: 14, fontFamily: 'var(--mono)', textTransform: 'uppercase' }}
                    >
                      {[w.email_enabled && 'POST', w.whatsapp_enabled && 'WIRE']
                        .filter(Boolean)
                        .join(' · ') || '—'}
                    </div>
                  </div>
                  <div>
                    <div className="stat-label">Filed</div>
                    <div className="stat-val" style={{ fontSize: 14, fontFamily: 'var(--mono)' }}>
                      {new Date(w.created_at).toLocaleDateString('en-GB', {
                        day: 'numeric',
                        month: 'short',
                        year: '2-digit',
                      })}
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    type="button"
                    onClick={() => openEdit(w)}
                    className="toggle-stamp on"
                    style={{ background: 'transparent', color: 'var(--ink)' }}
                  >
                    Amend
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(w.id)}
                    className="toggle-stamp off"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </main>

      {showForm && (
        <WatchlistFormModal
          initial={editingWatchlist ? watchlistToForm(editingWatchlist) : EMPTY_FORM}
          isEdit={editingWatchlist !== null}
          onSave={handleSave}
          onCancel={closeForm}
        />
      )}

      <style jsx global>{`
        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }
      `}</style>
    </>
  );
}
