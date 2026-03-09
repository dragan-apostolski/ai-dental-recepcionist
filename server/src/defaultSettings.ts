import { Settings } from './types';

export const DEFAULT_SETTINGS: Settings = {
    onboarded: true,
    companyName: 'Denta Lux',
    address: 'Slovenian Address', // Should be dynamic based on language but for now hardcoded default
    phoneNumber: '+1234567890',
    services: [], // Needs to be populated from DB or hardcoded if empty
    workingHours: [
        { day: 'Monday', open: '08:00', close: '18:00', isClosed: false },
        { day: 'Tuesday', open: '08:00', close: '18:00', isClosed: false },
        { day: 'Wednesday', open: '08:00', close: '18:00', isClosed: false },
        { day: 'Thursday', open: '08:00', close: '18:00', isClosed: false },
        { day: 'Friday', open: '08:00', close: '18:00', isClosed: false },
        { day: 'Saturday', open: '09:00', close: '14:00', isClosed: false },
        { day: 'Sunday', open: '09:00', close: '14:00', isClosed: true },
    ],
    businessDescription: 'Dental Clinic',
    agentName: 'Dejan',
    language: 'mk',
    uiLanguage: 'mk',
    voiceName: 'Charon',
    aiProvider: 'gemini',
    openaiVoice: 'alloy',
    calendlyToken: process.env.VITE_CALENDLY_TOKEN || '', // Ideally should be in .env
    eventTypes: [],
    selectedEventTypeIds: []
};
