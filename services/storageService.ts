
import { Settings } from '../types';
import { createClient, User, SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_CONFIG } from '../config';

const SUPABASE_URL = SUPABASE_CONFIG.url;
// Use publishableKey (formerly anon key) for safe client-side auth
// Fix: Removed access to non-existent anonKey property on SUPABASE_CONFIG
const SUPABASE_KEY = SUPABASE_CONFIG.publishableKey;

let supabase: SupabaseClient | null = null;

try {
  if (SUPABASE_URL && SUPABASE_KEY) {
    supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
  }
} catch (e) {
  console.error('Failed to initialize Supabase client:', e);
}

const DB_NAME = 'DentaLuxDB';
const STORE_NAME = 'Settings';

const openDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

export const auth = {
  signUp: async (email: string, password: string) => {
    if (!supabase) throw new Error('Supabase is not configured. Please provide details in config.ts.');
    return supabase.auth.signUp({ email, password });
  },
  signIn: async (email: string, password: string) => {
    if (!supabase) throw new Error('Supabase is not configured. Please provide details in config.ts.');
    return supabase.auth.signInWithPassword({ email, password });
  },
  signOut: async () => {
    if (!supabase) return;
    return supabase.auth.signOut();
  },
  onAuthStateChange: (callback: (user: User | null) => void) => {
    if (!supabase) {
      callback(null);
      return { data: { subscription: { unsubscribe: () => { } } } };
    }
    return supabase.auth.onAuthStateChange((_event, session) => {
      callback(session?.user ?? null);
    });
  },
  getUser: async () => {
    if (!supabase) return null;
    const { data } = await supabase.auth.getUser();
    return data.user;
  }
};

export const saveSettings = async (settings: Settings): Promise<void> => {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  tx.objectStore(STORE_NAME).put(settings, 'current');

  const user = await auth.getUser();
  if (user && supabase) {
    try {
      const { error } = await supabase
        .from('clinic_config')
        .upsert({
          id: user.id,
          config: settings,
          updated_at: new Date().toISOString()
        });
      if (error) throw error;
    } catch (error) {
      console.error('Background cloud sync failed:', error);
    }
  }

  return new Promise((resolve) => {
    tx.oncomplete = () => resolve();
  });
};

export const loadSettings = async (): Promise<Settings | null> => {
  const user = await auth.getUser();

  if (user && supabase) {
    try {
      const { data, error } = await supabase
        .from('clinic_config')
        .select('config')
        .eq('id', user.id)
        .single();

      if (error && error.code !== 'PGRST116') {
        console.warn('Supabase fetch error:', error);
      }

      if (data && data.config) {
        const db = await openDB();
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).put(data.config, 'current');
        return data.config as Settings;
      }
    } catch (error) {
      console.warn('Could not load from cloud, falling back to local storage.');
    }
  }

  const db = await openDB();
  const tx = db.transaction(STORE_NAME, 'readonly');
  const request = tx.objectStore(STORE_NAME).get('current');

  return new Promise((resolve) => {
    request.onsuccess = () => resolve(request.result || null);
  });
};