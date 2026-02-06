import dotenv from 'dotenv';
dotenv.config(); // Load env vars BEFORE importing service

import { getCompanySettings } from './src/services/supabaseService';

async function test() {
    console.log("Testing Supabase Connection...");
    try {
        const settings = await getCompanySettings();
        if (settings) {
            console.log("✅ Success! Settings fetched.");
            console.log("--------------------------------");
            console.log(`Agent Name: ${settings.agentName}`);
            console.log(`Company: ${settings.companyName}`);
            console.log(`Language: ${settings.language}`);
            console.log(`Services Count: ${settings.services?.length || 0}`);
            console.log("--------------------------------");
        } else {
            console.log("❌ Failed to fetch settings (returned null).");
        }
    } catch (e) {
        console.error("❌ Error during test:", e);
    }
}

test().catch(console.error);
