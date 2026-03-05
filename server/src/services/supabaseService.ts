import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Settings } from '../types';

let supabase: SupabaseClient | null = null;

const getSupabaseClient = () => {
    if (supabase) return supabase;

    // Use environment variables directly. 
    const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
    const SUPABASE_KEY = process.env.VITE_SUPABASE_SECRET_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

    if (SUPABASE_URL && SUPABASE_KEY) {
        try {
            supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
        } catch (e) {
            console.error('Failed to initialize Supabase client:', e);
        }
    } else {
        // Only warn once
        if (!process.env.SUPABASE_WARN_SHOWN) {
            console.warn('Missing Supabase credentials in environment variables.');
            process.env.SUPABASE_WARN_SHOWN = 'true';
        }
    }
    return supabase;
};

/**
 * Fetches the company settings from the database.
 * Assumes a single-tenant setup or fetches the first available configuration.
 */
export const getCompanySettings = async (): Promise<Settings | null> => {
    const client = getSupabaseClient();
    if (!client) {
        console.warn('Supabase client not initialized. Cannot fetch settings.');
        return null;
    }

    try {
        // We fetch the first row from 'clinic_config' table.
        const { data, error } = await client
            .from('clinic_config')
            .select('config')
            .limit(1)
            .single();

        if (error) {
            console.error('Error fetching settings from Supabase:', error);
            return null;
        }

        if (data && data.config) {
            return data.config as Settings;
        }
    } catch (err) {
        console.error('Unexpected error in getCompanySettings:', err);
    }

    return null;
};

/**
 * Updates the company settings in the database.
 * Updates the existing row if present, or creates a new one (if schema allows arbitrary insert).
 */
export const updateCompanySettings = async (settings: Settings): Promise<boolean> => {
    const client = getSupabaseClient();
    if (!client) {
        console.warn('Supabase client not initialized. Cannot save settings.');
        return false;
    }

    try {
        // 1. Check if a row exists
        const { data: existing } = await client
            .from('clinic_config')
            .select('id')
            .limit(1)
            .single();

        if (existing) {
            // Update existing row
            const { error } = await client
                .from('clinic_config')
                .update({
                    config: settings,
                    updated_at: new Date().toISOString()
                })
                .eq('id', existing.id);

            if (error) throw error;
        } else {
            // Insert new row (fallback, might need a generic ID or fail depending on schema constraints)
            // Assuming access to random UUID generation or letting DB handle it if possible, 
            // but we usually need an ID. Using a hardcoded ID for single-tenant fallback if needed
            // or letting the client auth logic handle creation. 
            // However, this is server-side override.
            console.warn("No existing config row found to update. Skipping insert to avoid ID conflicts.");
            return false;
        }

        return true;
    } catch (err) {
        console.error('Error updating settings in Supabase:', err);
        return false;
    }
};

export interface GeminiSessionLog {
    session_id: string;
    started_at: string;
    ended_at: string;
    duration_secs: number;
    input_audio_tokens?: number;
    output_audio_tokens?: number;
    input_text_tokens?: number;
    output_text_tokens?: number;
    total_tokens?: number;
    turn_count: number;
    error?: string;
}

/**
 * Persists a Gemini Live API session summary to the gemini_sessions table.
 */
export const logGeminiSession = async (log: GeminiSessionLog): Promise<void> => {
    const client = getSupabaseClient();
    if (!client) {
        console.warn('[SessionLog] Supabase client not available, skipping session log.');
        return;
    }

    const payload = {
        session_id: log.session_id,
        started_at: log.started_at,
        ended_at: log.ended_at,
        duration_secs: log.duration_secs,
        input_audio_tokens: log.input_audio_tokens ?? null,
        output_audio_tokens: log.output_audio_tokens ?? null,
        input_text_tokens: log.input_text_tokens ?? null,
        output_text_tokens: log.output_text_tokens ?? null,
        total_tokens: log.total_tokens ?? null,
        turn_count: log.turn_count,
        error: log.error ?? null,
    };

    console.log('[SessionLog] Writing session to gemini_sessions:', JSON.stringify(payload, null, 2));

    const { error } = await client.from('gemini_sessions').insert(payload);

    if (error) {
        console.error('[SessionLog] Insert failed:', {
            message: error.message,
            code: error.code,
            hint: error.hint,
            details: error.details,
        });
    } else {
        console.log(`[SessionLog] ✓ Session ${log.session_id} saved (${log.duration_secs}s | tokens: ${log.total_tokens ?? '?'} total, ${log.input_audio_tokens ?? '?'} in-audio, ${log.output_audio_tokens ?? '?'} out-audio | turns: ${log.turn_count})`);
    }
};
