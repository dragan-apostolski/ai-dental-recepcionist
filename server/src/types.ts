
export interface CalendlyEvent {
  id: string;
  uri: string;
  title: string;
  slug: string;
  description?: string;
  duration: number;
  active: boolean;
  locations?: any[];
}

export interface BookingSlot {
  time: string;
  isoTime: string;
  available: boolean;
  bookedBy?: string;
  attendeeEmail?: string;
  serviceTitle?: string;
}

export interface DayAvailability {
  date: string;
  slots: BookingSlot[];
}

export interface Service {
  id: string;
  calendlyEventTypeUri: string; // Link to calendly event type uri
  category: string;
  name: string;
  price: string;
  duration: string;
  description?: string;
}

export interface WorkingHour {
  day: string;
  open: string;
  close: string;
  isClosed: boolean;
}

export interface Settings {
  onboarded: boolean;
  companyName: string;
  address: string;
  phoneNumber: string;
  services: Service[];
  workingHours: WorkingHour[];
  businessDescription: string;
  agentName: string;
  language: 'mk' | 'en' | 'sl'; // Agent spoken language
  uiLanguage: 'mk' | 'en' | 'sl'; // UI interface language
  voiceName: 'Charon' | 'Puck' | 'Kore' | 'Fenrir' | 'Zephyr';
  logoUrl?: string;
  calendlyToken: string;
  eventTypes: CalendlyEvent[];
  selectedEventTypeIds: string[]; // store URIs or IDs
  calcomToken?: string;
  activeCalendarProvider?: 'calendly' | 'calcom';
  aiProvider?: 'gemini' | 'openai';
  openaiVoice?: 'alloy' | 'ash' | 'ballad' | 'coral' | 'echo' | 'sage' | 'shimmer' | 'verse';
}

export interface TranscriptEntry {
  role: 'user' | 'model' | 'system';
  text: string;
  timestamp: number;
}
