import { createClient, SupabaseClient } from '@supabase/supabase-js';

const url = process.env['NEXT_PUBLIC_SUPABASE_URL']!;
const serviceKey = process.env['SUPABASE_SERVICE_ROLE_KEY']!;

// Service role client bypasses RLS. For backend jobs only — never expose to the browser.
export const supabaseService: SupabaseClient = createClient(url, serviceKey);
