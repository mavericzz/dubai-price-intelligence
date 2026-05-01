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

// ─── Constants ────────────────────────────────────────────────────────────────

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

// ─── Form state type ──────────────────────────────────────────────────────────

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
  };
}

// ─── Shared UI primitives ─────────────────────────────────────────────────────

function Spinner() {
  return (
    <div className="h-5 w-5 animate-spin rounded-full border-2 border-[#1F1F2E] border-t-[#6366F1]" />
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label className="text-xs font-medium text-slate-400">{children}</label>;
}

function TextInput({
  value,
  onChange,
  placeholder,
  type = 'text',
  required,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  required?: boolean;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      required={required}
      className="w-full rounded-lg border border-[#1F1F2E] bg-[#09090E] px-3 py-2 text-sm text-slate-100 placeholder-slate-600 outline-none focus:border-[#6366F1] transition-colors"
    />
  );
}

function SelectInput({
  value,
  onChange,
  options,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { label: string; value: string }[];
  placeholder?: string;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-lg border border-[#1F1F2E] bg-[#09090E] px-3 py-2 text-sm text-slate-300 outline-none focus:border-[#6366F1] transition-colors"
    >
      {placeholder && <option value="">{placeholder}</option>}
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

// ─── Areas multi-select ───────────────────────────────────────────────────────

function AreasSelect({
  value,
  onChange,
}: {
  value: string[];
  onChange: (v: string[]) => void;
}) {
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
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between rounded-lg border border-[#1F1F2E] bg-[#09090E] px-3 py-2 text-sm text-left outline-none focus:border-[#6366F1] transition-colors"
      >
        <span className={value.length === 0 ? 'text-slate-600' : 'text-slate-300'}>{label}</span>
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          className={`h-4 w-4 flex-shrink-0 text-slate-500 transition-transform ${open ? 'rotate-180' : ''}`}
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="absolute z-50 mt-1 w-full max-h-56 overflow-y-auto rounded-lg border border-[#1F1F2E] bg-[#111118] py-1 shadow-xl">
          {DUBAI_AREAS.map((area) => (
            <label
              key={area}
              className="flex cursor-pointer items-center gap-2.5 px-3 py-1.5 hover:bg-[#1F1F2E] text-sm text-slate-300"
            >
              <input
                type="checkbox"
                checked={value.includes(area)}
                onChange={() => toggle(area)}
                className="accent-[#6366F1] h-3.5 w-3.5 flex-shrink-0"
              />
              {area}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Login form ───────────────────────────────────────────────────────────────

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
    if (authError) {
      setError(authError.message);
    } else {
      setSent(true);
    }
  }

  if (sent) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4 bg-[#09090E]">
        <div className="w-full max-w-sm rounded-xl border border-[#1F1F2E] bg-[#111118] p-8 text-center">
          <p className="mb-4 text-4xl" aria-hidden="true">✉️</p>
          <h2 className="mb-2 text-xl font-semibold text-slate-100">Check your email</h2>
          <p className="text-sm text-slate-400">
            We sent a magic link to{' '}
            <strong className="text-slate-200">{email}</strong>. Click it to sign in.
          </p>
          <button
            className="mt-6 text-sm text-[#6366F1] hover:underline"
            onClick={() => setSent(false)}
          >
            Use a different email
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4 bg-[#09090E]">
      <div className="w-full max-w-sm rounded-xl border border-[#1F1F2E] bg-[#111118] p-8">
        <h1 className="mb-1 text-2xl font-bold text-slate-100">My Watchlists</h1>
        <p className="mb-6 text-sm text-slate-400">
          Sign in with a magic link to manage your price-drop alerts.
        </p>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <input
            type="email"
            placeholder="your@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full rounded-lg border border-[#1F1F2E] bg-[#09090E] px-4 py-2.5 text-sm text-slate-100 placeholder-slate-600 outline-none focus:border-[#6366F1] transition-colors"
          />
          {error && <p className="text-xs text-red-400">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="rounded-lg bg-[#6366F1] px-4 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {loading ? 'Sending…' : 'Send magic link'}
          </button>
        </form>
      </div>
    </div>
  );
}

// ─── Criteria summary chips ───────────────────────────────────────────────────

function CriteriaSummary({ w }: { w: Watchlist }) {
  const chips: string[] = [];

  if (w.areas && w.areas.length > 0) {
    const shown = w.areas.slice(0, 2).join(', ');
    const extra = w.areas.length > 2 ? ` +${w.areas.length - 2}` : '';
    chips.push(shown + extra);
  }

  if (w.property_type) chips.push(w.property_type);

  if (w.beds_min !== null || w.beds_max !== null) {
    const lo = w.beds_min !== null ? (w.beds_min === 0 ? 'Studio' : `${w.beds_min}BR`) : '';
    const hi = w.beds_max !== null ? (w.beds_max === 0 ? 'Studio' : `${w.beds_max}BR`) : '';
    chips.push(lo && hi && lo !== hi ? `${lo}–${hi}` : lo || hi);
  }

  if (w.max_price !== null) chips.push(`≤ AED ${w.max_price.toLocaleString()}`);
  if (w.min_drop_percent !== null) chips.push(`Drop ≥ ${w.min_drop_percent}%`);
  if (w.min_yield !== null) chips.push(`Yield ≥ ${w.min_yield}%`);
  if (w.motivation_filter) chips.push(`${w.motivation_filter} motivation`);

  if (chips.length === 0) {
    return <p className="text-xs text-slate-600">No criteria set — matches all listings</p>;
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {chips.map((chip) => (
        <span
          key={chip}
          className="rounded-full bg-[#09090E] px-2 py-0.5 text-xs text-slate-400 border border-[#1F1F2E]"
        >
          {chip}
        </span>
      ))}
    </div>
  );
}

// ─── Watchlist card ───────────────────────────────────────────────────────────

function WatchlistCard({
  watchlist,
  onEdit,
  onDelete,
}: {
  watchlist: Watchlist;
  onEdit: (w: Watchlist) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <article className="flex flex-col gap-3 rounded-xl border border-[#1F1F2E] bg-[#111118] p-4">
      <h3 className="font-semibold text-slate-100 leading-snug">{watchlist.name}</h3>

      <CriteriaSummary w={watchlist} />

      <div className="flex items-center gap-4 text-xs">
        <span className={watchlist.email_enabled ? 'text-emerald-400' : 'text-slate-600'}>
          {watchlist.email_enabled ? '✓' : '✗'} Email
        </span>
        <span className={watchlist.whatsapp_enabled ? 'text-emerald-400' : 'text-slate-600'}>
          {watchlist.whatsapp_enabled ? '✓' : '✗'} WhatsApp
        </span>
      </div>

      <div className="flex items-center justify-end gap-2 border-t border-[#1F1F2E] pt-3">
        <button
          onClick={() => onEdit(watchlist)}
          className="rounded-lg border border-[#1F1F2E] px-3 py-1.5 text-xs text-slate-300 transition-colors hover:border-[#6366F1]/50 hover:text-[#6366F1]"
        >
          Edit
        </button>
        <button
          onClick={() => onDelete(watchlist.id)}
          className="rounded-lg border border-[#1F1F2E] px-3 py-1.5 text-xs text-slate-300 transition-colors hover:border-red-500/50 hover:text-red-400"
        >
          Delete
        </button>
      </div>
    </article>
  );
}

// ─── Create / Edit form modal ─────────────────────────────────────────────────

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
      setNameError('Watchlist name is required');
      return;
    }
    onSave(form);
  }

  const bedsOptions = BEDS.map((b) => ({
    label: b === 0 ? 'Studio' : `${b} BR`,
    value: String(b),
  }));

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 px-4 py-8"
      onClick={(e) => e.target === e.currentTarget && onCancel()}
    >
      <div className="w-full max-w-lg rounded-xl border border-[#1F1F2E] bg-[#111118] shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#1F1F2E] px-6 py-4">
          <h2 className="text-lg font-semibold text-slate-100">
            {isEdit ? 'Edit Watchlist' : 'Create Watchlist'}
          </h2>
          <button
            type="button"
            onClick={onCancel}
            className="rounded p-1 text-slate-500 hover:text-slate-300 transition-colors"
            aria-label="Close"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="h-5 w-5" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-5 p-6">
          {/* Name */}
          <div className="flex flex-col gap-1.5">
            <FieldLabel>Name *</FieldLabel>
            <TextInput
              value={form.name}
              onChange={(v) => { set('name', v); setNameError(''); }}
              placeholder="e.g. Dubai Marina Apartments"
              required
            />
            {nameError && <p className="text-xs text-red-400">{nameError}</p>}
          </div>

          {/* Areas */}
          <div className="flex flex-col gap-1.5">
            <FieldLabel>Areas</FieldLabel>
            <AreasSelect value={form.areas} onChange={(v) => set('areas', v)} />
          </div>

          {/* Property type */}
          <div className="flex flex-col gap-1.5">
            <FieldLabel>Property Type</FieldLabel>
            <SelectInput
              value={form.property_type}
              onChange={(v) => set('property_type', v)}
              options={PROPERTY_TYPES.map((t) => ({ label: t, value: t }))}
              placeholder="Any type"
            />
          </div>

          {/* Beds range */}
          <div className="flex flex-col gap-1.5">
            <FieldLabel>Beds</FieldLabel>
            <div className="grid grid-cols-2 gap-2">
              <SelectInput
                value={form.beds_min}
                onChange={(v) => set('beds_min', v)}
                options={bedsOptions}
                placeholder="Min beds"
              />
              <SelectInput
                value={form.beds_max}
                onChange={(v) => set('beds_max', v)}
                options={bedsOptions}
                placeholder="Max beds"
              />
            </div>
          </div>

          {/* Max price */}
          <div className="flex flex-col gap-1.5">
            <FieldLabel>Max Price (AED)</FieldLabel>
            <input
              type="number"
              value={form.max_price}
              onChange={(e) => set('max_price', e.target.value)}
              placeholder="e.g. 2000000"
              min={0}
              className="w-full rounded-lg border border-[#1F1F2E] bg-[#09090E] px-3 py-2 text-sm text-slate-100 placeholder-slate-600 outline-none focus:border-[#6366F1] transition-colors tabular-nums"
            />
          </div>

          {/* Drop % and yield % */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <FieldLabel>Min Drop %</FieldLabel>
              <input
                type="number"
                value={form.min_drop_percent}
                onChange={(e) => set('min_drop_percent', e.target.value)}
                placeholder="e.g. 5"
                min={0}
                max={100}
                step={0.1}
                className="w-full rounded-lg border border-[#1F1F2E] bg-[#09090E] px-3 py-2 text-sm text-slate-100 placeholder-slate-600 outline-none focus:border-[#6366F1] transition-colors tabular-nums"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <FieldLabel>Min Yield %</FieldLabel>
              <input
                type="number"
                value={form.min_yield}
                onChange={(e) => set('min_yield', e.target.value)}
                placeholder="e.g. 7"
                min={0}
                max={100}
                step={0.1}
                className="w-full rounded-lg border border-[#1F1F2E] bg-[#09090E] px-3 py-2 text-sm text-slate-100 placeholder-slate-600 outline-none focus:border-[#6366F1] transition-colors tabular-nums"
              />
            </div>
          </div>

          {/* Motivation filter */}
          <div className="flex flex-col gap-1.5">
            <FieldLabel>Motivation</FieldLabel>
            <SelectInput
              value={form.motivation_filter}
              onChange={(v) => set('motivation_filter', v)}
              options={[
                { label: 'HIGH', value: 'HIGH' },
                { label: 'MEDIUM', value: 'MEDIUM' },
                { label: 'LOW', value: 'LOW' },
              ]}
              placeholder="Any"
            />
          </div>

          {/* Notifications */}
          <div className="flex flex-col gap-3 rounded-lg border border-[#1F1F2E] bg-[#09090E] p-4">
            <p className="text-xs font-medium text-slate-400">Notifications</p>

            <label className="flex cursor-pointer items-center gap-3">
              <input
                type="checkbox"
                checked={form.email_enabled}
                onChange={(e) => set('email_enabled', e.target.checked)}
                className="accent-[#6366F1] h-4 w-4 flex-shrink-0"
              />
              <span className="text-sm text-slate-300">Email alerts</span>
            </label>

            <div className="flex flex-col gap-2">
              <label className="flex cursor-pointer items-center gap-3">
                <input
                  type="checkbox"
                  checked={form.whatsapp_enabled}
                  onChange={(e) => set('whatsapp_enabled', e.target.checked)}
                  className="accent-[#6366F1] h-4 w-4 flex-shrink-0"
                />
                <span className="text-sm text-slate-300">WhatsApp alerts</span>
              </label>
              {form.whatsapp_enabled && (
                <div className="ml-7">
                  <TextInput
                    type="tel"
                    value={form.whatsapp_phone}
                    onChange={(v) => set('whatsapp_phone', v)}
                    placeholder="+971 50 000 0000"
                  />
                </div>
              )}
            </div>
          </div>

          {/* Footer actions */}
          <div className="flex items-center justify-end gap-3 border-t border-[#1F1F2E] pt-2">
            <button
              type="button"
              onClick={onCancel}
              className="rounded-lg border border-[#1F1F2E] px-4 py-2 text-sm text-slate-300 transition-colors hover:border-slate-500 hover:text-slate-100"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-lg bg-[#6366F1] px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90"
            >
              {isEdit ? 'Save Changes' : 'Create Watchlist'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function WatchlistPage() {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [watchlists, setWatchlists] = useState<Watchlist[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [globalError, setGlobalError] = useState('');

  // Form modal state
  const [showForm, setShowForm] = useState(false);
  const [editingWatchlist, setEditingWatchlist] = useState<Watchlist | null>(null);

  // Initialise auth — detect existing session and listen for changes
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

  // Fetch watchlists whenever user changes
  useEffect(() => {
    if (!user) {
      setWatchlists([]);
      return;
    }
    setListLoading(true);
    getWatchlists(user.id)
      .then(setWatchlists)
      .catch(() => setGlobalError('Failed to load watchlists.'))
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
      // Optimistic update
      const optimistic: Watchlist = { ...prev, ...payload };
      setWatchlists((list) => list.map((w) => (w.id === prev.id ? optimistic : w)));
      closeForm();

      updateWatchlist(prev.id, payload)
        .then((updated) => {
          setWatchlists((list) => list.map((w) => (w.id === updated.id ? updated : w)));
        })
        .catch(() => {
          setWatchlists((list) => list.map((w) => (w.id === prev.id ? prev : w)));
          setGlobalError('Failed to update watchlist. Please try again.');
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
        .then((created) => {
          setWatchlists((list) => list.map((w) => (w.id === tempId ? created : w)));
        })
        .catch(() => {
          setWatchlists((list) => list.filter((w) => w.id !== tempId));
          setGlobalError('Failed to create watchlist. Please try again.');
        });
    }
  }

  function handleDelete(id: string) {
    if (!confirm('Delete this watchlist? This cannot be undone.')) return;
    const removed = watchlists.find((w) => w.id === id);
    setWatchlists((list) => list.filter((w) => w.id !== id));
    setGlobalError('');

    deleteWatchlist(id).catch(() => {
      if (removed) setWatchlists((list) => [removed, ...list]);
      setGlobalError('Failed to delete watchlist. Please try again.');
    });
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#09090E]">
        <Spinner />
      </div>
    );
  }

  if (!user) return <LoginForm />;

  return (
    <>
      <div className="min-h-screen bg-[#09090E]">
        {/* Sticky header */}
        <header className="sticky top-0 z-10 border-b border-[#1F1F2E] bg-[#09090E]/90 backdrop-blur">
          <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
            <h1 className="text-lg font-bold text-slate-100">My Watchlists</h1>
            <div className="flex items-center gap-3">
              <span className="hidden text-xs text-slate-500 sm:block">{user.email}</span>
              <button
                onClick={handleSignOut}
                className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
              >
                Sign out
              </button>
              <button
                onClick={openCreate}
                className="rounded-lg bg-[#6366F1] px-3 py-1.5 text-sm font-semibold text-white hover:opacity-90 transition-opacity"
              >
                + Create watchlist
              </button>
            </div>
          </div>
        </header>

        {/* Global error banner */}
        {globalError && (
          <div className="mx-auto max-w-5xl px-4 pt-4">
            <div className="flex items-center justify-between rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-sm text-red-400">
              <span>{globalError}</span>
              <button
                onClick={() => setGlobalError('')}
                className="ml-4 text-red-400/60 hover:text-red-400 transition-colors"
                aria-label="Dismiss"
              >
                ✕
              </button>
            </div>
          </div>
        )}

        {/* Body */}
        <main className="mx-auto max-w-5xl px-4 py-8">
          {listLoading ? (
            <div className="flex items-center justify-center py-20">
              <Spinner />
            </div>
          ) : watchlists.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-center">
              <p className="mb-4 text-5xl" aria-hidden="true">🔔</p>
              <h2 className="mb-2 text-lg font-semibold text-slate-200">No watchlists yet</h2>
              <p className="mb-6 max-w-xs text-sm text-slate-500">
                Create a watchlist to get alerts when listings match your criteria.
              </p>
              <button
                onClick={openCreate}
                className="rounded-lg bg-[#6366F1] px-4 py-2 text-sm font-semibold text-white hover:opacity-90 transition-opacity"
              >
                Create your first watchlist
              </button>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {watchlists.map((w) => (
                <WatchlistCard
                  key={w.id}
                  watchlist={w}
                  onEdit={openEdit}
                  onDelete={handleDelete}
                />
              ))}
            </div>
          )}
        </main>
      </div>

      {showForm && (
        <WatchlistFormModal
          initial={editingWatchlist ? watchlistToForm(editingWatchlist) : EMPTY_FORM}
          isEdit={editingWatchlist !== null}
          onSave={handleSave}
          onCancel={closeForm}
        />
      )}
    </>
  );
}
