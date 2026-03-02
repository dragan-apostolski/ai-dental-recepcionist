import { CalendlyEvent, DayAvailability, BookingSlot } from '../types';

const CALCOM_API_BASE = 'https://api.cal.eu/v2';

// V2 API headers helper
const getHeaders = (token: string, apiVersion: string) => ({
    'Authorization': `Bearer ${token}`,
    'cal-api-version': apiVersion,
    'Content-Type': 'application/json'
});

// Helper to handle API responses
const handleResponse = async (res: Response, context: string) => {
    if (!res.ok) {
        const errorText = await res.text();
        console.error(`Cal.com API Error [${context}] (${res.status}): ${errorText}`);
        try {
            const json = JSON.parse(errorText);
            throw new Error(json.message || json.error || `HTTP ${res.status}`);
        } catch (e) {
            if (e instanceof Error && e.message.startsWith('HTTP')) throw e;
            throw new Error(`HTTP ${res.status}: ${errorText}`);
        }
    }
    return res.json();
};

export const getEventTypes = async (token: string): Promise<CalendlyEvent[]> => {
    try {
        const res = await fetch(`${CALCOM_API_BASE}/event-types`, {
            headers: getHeaders(token, '2024-06-14')
        });
        const data = await handleResponse(res, 'getEventTypes');

        // V2 response: { status: "success", data: [...] }
        const eventTypes = data.data || [];
        return eventTypes.map((et: any) => ({
            id: et.id.toString(),
            uri: et.id.toString(),
            title: et.title,
            slug: et.slug,
            description: et.description || '',
            duration: et.lengthInMinutes || et.length || 30,
            active: !et.hidden,
            locations: et.locations || []
        }));
    } catch (error) {
        console.error('Error fetching event types from Cal.com:', error);
        return [];
    }
};

// Cal.com V2 slot can be a string (default format) or object (range format)
type CalcomV2SlotRaw = string | { start: string; end?: string };

export const fetchAvailabilityRange = async (
    token: string,
    eventTypeUri: string, // This is the Cal.com numeric ID as string
    startDate: string,
    endDate: string,
    workingHours?: { day: string, open: string, close: string, isClosed: boolean }[],
    skipDetails: boolean = false
): Promise<DayAvailability[]> => {
    try {
        if (!eventTypeUri) throw new Error("Event type is required for Cal.com slots");

        // Cal.com V2 /slots expects YYYY-MM-DD format for start/end
        const start = startDate.split('T')[0];
        const end = endDate.split('T')[0];

        // V2 API: GET /v2/slots with Bearer auth and cal-api-version header
        // Using format=range to get { start, end } objects (default returns plain strings)
        const url = `${CALCOM_API_BASE}/slots?eventTypeId=${eventTypeUri}&start=${start}&end=${end}&timeZone=Europe/Skopje&format=range`;
        const res = await fetch(url, {
            headers: getHeaders(token, '2024-09-04')
        });
        const data = await handleResponse(res, 'getSlots');


        // V2 response with format=range: { status: "success", data: { "2024-03-01": [{ start: "...", end: "..." }] } }
        const slotsByDate: Record<string, CalcomV2SlotRaw[]> = data.data || {};

        const days: DayAvailability[] = [];
        const startD = new Date(startDate);
        const endD = new Date(endDate);

        for (let d = new Date(startD); d <= endD; d.setDate(d.getDate() + 1)) {
            const dateStr = d.toISOString().split('T')[0];
            const dayName = d.toLocaleDateString('en-US', { weekday: 'long' });

            // Check if day is closed based on workingHours
            const dayConfig = workingHours?.find(h => h.day === dayName);
            if (dayConfig?.isClosed) continue;

            const daySlots: BookingSlot[] = [];
            const availableSlotsForDay = slotsByDate[dateStr] || [];

            for (const slot of availableSlotsForDay) {
                // Slot can be a plain string (default format) or { start, end } object (range format)
                const startStr = typeof slot === 'string' ? slot : slot.start;
                const slotTime = new Date(startStr);

                const hour = slotTime.getHours();
                const openHour = dayConfig ? parseInt(dayConfig.open.split(':')[0], 10) : 0;
                const closeHour = dayConfig ? parseInt(dayConfig.close.split(':')[0], 10) : 24;

                if (hour >= openHour && hour < closeHour) {
                    daySlots.push({
                        time: slotTime.toLocaleTimeString('mk-MK', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Europe/Skopje' }),
                        isoTime: slotTime.toISOString(),
                        available: true
                    });
                }
            }

            if (daySlots.length > 0) {
                days.push({ date: dateStr, slots: daySlots });
            }
        }

        return days;

    } catch (error) {
        console.error(`Error checking availability range Cal.com:`, error);
        return [];
    }
};

export const checkAvailability = async (
    token: string,
    eventTypeUri: string,
    date: string,
    workingHours?: { day: string, open: string, close: string, isClosed: boolean }[]
): Promise<DayAvailability> => {
    const results = await fetchAvailabilityRange(token, eventTypeUri, date, date, workingHours, true);
    return results[0] || { date, slots: [] };
};

export interface BookingResult {
    success: boolean;
    error?: string;
    details?: any;
}

export const bookAppointment = async (
    token: string,
    eventTypeUri: string, // ID
    bookingData: {
        start: string;
        name: string;
        email: string;
        notes?: string;
    },
    locationConfig?: { kind: string, location?: string }
): Promise<BookingResult> => {
    try {
        const body: any = {
            eventTypeId: parseInt(eventTypeUri, 10),
            start: bookingData.start,
            attendee: {
                name: bookingData.name,
                email: bookingData.email,
                timeZone: 'Europe/Skopje',
                language: 'en'
            },
            metadata: {}
        };

        if (bookingData.notes) {
            body.notes = bookingData.notes;
        }

        if (locationConfig) {
            body.location = locationConfig.kind;
        }

        const res = await fetch(`${CALCOM_API_BASE}/bookings`, {
            method: 'POST',
            headers: getHeaders(token, '2024-08-13'),
            body: JSON.stringify(body)
        });

        if (!res.ok) {
            const errorText = await res.text();
            console.error(`Cal.com Booking Error (${res.status}): ${errorText}`);

            try {
                const json = JSON.parse(errorText);
                return { success: false, error: json.message || `HTTP ${res.status}` };
            } catch (e) {
                return { success: false, error: `HTTP ${res.status}: ${errorText}` };
            }
        }

        const data = await res.json();
        return { success: true, details: data };

    } catch (error: any) {
        console.error('Network Error during Cal.com booking:', error);
        return { success: false, error: error.message || 'Unknown network error' };
    }
};
