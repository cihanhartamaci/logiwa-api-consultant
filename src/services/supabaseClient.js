import { createClient } from '@supabase/supabase-js';

const url = String(import.meta.env.VITE_SUPABASE_URL || '').trim();
const anonKey = String(import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim();

let client = null;

export function isSupabaseConfigured() {
  return Boolean(url && anonKey);
}

export function getTeamWriteSecret() {
  return String(import.meta.env.VITE_TEAM_WRITE_SECRET || '').trim();
}

export function getSupabaseClient() {
  if (!isSupabaseConfigured()) return null;
  if (!client) {
    client = createClient(url, anonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  }
  return client;
}
