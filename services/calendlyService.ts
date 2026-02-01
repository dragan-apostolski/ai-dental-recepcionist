
import { CalendlyEvent, DayAvailability, BookingSlot } from '../types';

const CALENDLY_API_BASE = 'https://api.calendly.com';

// Helper to handle API responses
const handleResponse = async (res: Response, context: string) => {
    if (!res.ok) {
        const errorText = await res.text();
        console.error(`Calendly API Error [${context}] (${res.status}): ${errorText}`);
        try {
            const json = JSON.parse(errorText);
            throw new Error(json.message || `HTTP ${res.status}`);
        } catch (e) {
            throw new Error(`HTTP ${res.status}: ${errorText}`);
        }
    }
    return res.json();
};

export const getEventTypes = async (token: string): Promise<CalendlyEvent[]> => {
    try {
        // First we need to get the current user to find their URI
        const userRes = await fetch(`${CALENDLY_API_BASE}/users/me`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const userData = await handleResponse(userRes, 'getMe');
        const userUri = userData.resource.uri;

        // Then fetch event types for this user
        const res = await fetch(`${CALENDLY_API_BASE}/event_types?user=${userUri}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await handleResponse(res, 'getEventTypes');

        return (data.collection || []).map((et: any) => ({
            id: et.uri.split('/').pop(), // Extract ID from URI
            uri: et.uri,
            title: et.name,
            slug: et.slug,
            description: et.description_plain || '',
            duration: et.duration,
            active: et.active,
            locations: et.locations || et.profile?.locations || [et.profile?.location] // Capture any location info
        })).filter((et: any) => et.active); // Only return active event types
    } catch (error) {
        console.error('Error fetching event types:', error);
        return [];
    }
};

interface BusyTime {
    type: 'calendar';
    start_time: string;
    end_time: string;
}

// Fetch busy times from Calendly, splitting into 7-day chunks if needed
const getBusyTimes = async (token: string, userUri: string, startDate: string, endDate: string): Promise<BusyTime[]> => {
    try {
        const start = new Date(startDate);
        const end = new Date(endDate);
        const MAX_RANGE_MS = 604800 * 1000 - 1000; // 7 days minus 1 second to be safe

        // If range is within limit, just fetch
        if (end.getTime() - start.getTime() <= MAX_RANGE_MS) {
            const res = await fetch(`${CALENDLY_API_BASE}/user_busy_times?user=${userUri}&start_time=${startDate}&end_time=${endDate}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await handleResponse(res, 'getBusyTimes');
            return data.collection || [];
        }

        // Otherwise, split into chunks
        const chunks: Promise<BusyTime[]>[] = [];
        let currentStart = new Date(start);

        while (currentStart < end) {
            let currentEnd = new Date(currentStart.getTime() + MAX_RANGE_MS);
            if (currentEnd > end) currentEnd = end;

            chunks.push(getBusyTimes(token, userUri, currentStart.toISOString(), currentEnd.toISOString()));

            // Move to next chunk (start slightly after end of previous to avoid overlaps if API is inclusive/exclusive, 
            // but standard ISO overlap handling usually usually ok. Let's just start at the exact end time of previous chunk)
            currentStart = currentEnd;
            // Safety break
            if (currentStart >= end) break;
        }

        const results = await Promise.all(chunks);
        return results.flat();
    } catch (error) {
        console.error('Error fetching busy times:', error);
        return [];
    }
}

// Interface for Scheduled Event
interface ScheduledEvent {
    uri: string;
    name: string;
    status: string;
    start_time: string;
    end_time: string;
    invitees_counter: {
        active: number;
        limit: number;
        total: number;
    };
}

// Fetch scheduled events for the range to get details (Event Type Name)
const getScheduledEvents = async (token: string, userUri: string, startDate: string, endDate: string): Promise<ScheduledEvent[]> => {
    try {
        // Fetch with a high count to cover the range (e.g. 100)
        // Adjust min_start_time and max_start_time
        const res = await fetch(`${CALENDLY_API_BASE}/scheduled_events?user=${userUri}&min_start_time=${startDate}&max_start_time=${endDate}&status=active&count=100`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await handleResponse(res, 'getScheduledEvents');
        return data.collection || [];
    } catch (error) {
        console.error('Error fetching scheduled events:', error);
        return [];
    }
};

// Fetch invitee details for a specific event (Customer Name)
const getEventInvitees = async (token: string, eventUri: string): Promise<string> => {
    try {
        const res = await fetch(`${eventUri}/invitees?status=active`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await handleResponse(res, 'getEventInvitees');
        const invitee = data.collection?.[0]; // Assuming single invitee for 1-on-1
        return invitee?.name || 'Unknown Client';
    } catch (error) {
        console.error('Error fetching invitees:', error);
        return '';
    }
};

export const fetchAvailabilityRange = async (
    token: string,
    eventTypeUri: string,
    startDate: string,
    endDate: string,
    workingHours?: { day: string, open: string, close: string, isClosed: boolean }[]
): Promise<DayAvailability[]> => {
    try {
        // 1. Get User URI (needed for busy times) - ideally we cache this or store in settings
        const userRes = await fetch(`${CALENDLY_API_BASE}/users/me`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const userData = await handleResponse(userRes, 'getMe');
        const userUri = userData.resource.uri;

        // 2. Get Busy Times & Scheduled Events (Parallel)
        const [busyTimes, scheduledEvents] = await Promise.all([
            getBusyTimes(token, userUri, startDate, endDate),
            getScheduledEvents(token, userUri, startDate, endDate)
        ]);

        // 2.1 Enrich Scheduled Events with Invitee Names
        // This can be N+1, so strictly needed only if we want to show names.
        // We will fetch invitees for the events found.
        const detailedEvents = await Promise.all(scheduledEvents.map(async (ev) => {
            const inviteeName = await getEventInvitees(token, ev.uri);
            return {
                ...ev,
                inviteeName
            };
        }));

        // 3. Generate Slots locally
        const days: DayAvailability[] = [];
        const start = new Date(startDate);
        const end = new Date(endDate);

        // Iterate through days
        for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
            const dateStr = d.toISOString().split('T')[0];
            const dayName = d.toLocaleDateString('en-US', { weekday: 'long' });

            // Check if day is closed based on workingHours
            const dayConfig = workingHours?.find(h => h.day === dayName);
            if (dayConfig?.isClosed) continue;

            const daySlots: BookingSlot[] = [];

            const openHour = dayConfig ? parseInt(dayConfig.open.split(':')[0], 10) : 8;
            const closeHour = dayConfig ? parseInt(dayConfig.close.split(':')[0], 10) : 18;

            // Generate potential slots for this day
            for (let hour = openHour; hour < closeHour; hour++) {
                const slotStart = new Date(dateStr);
                slotStart.setHours(hour, 0, 0, 0);

                const slotEnd = new Date(slotStart);
                slotEnd.setHours(hour + 1, 0, 0, 0); // Assuming 1 hour duration

                // Check if slot overlaps with any busy time
                const isBusy = busyTimes.some(busy => {
                    const busyStart = new Date(busy.start_time).getTime();
                    const busyEnd = new Date(busy.end_time).getTime();
                    const sStart = slotStart.getTime();
                    const sEnd = slotEnd.getTime();

                    return (sStart < busyEnd && sEnd > busyStart);
                });

                if (!isBusy) {
                    daySlots.push({
                        time: slotStart.toLocaleTimeString('mk-MK', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Europe/Skopje' }),
                        isoTime: slotStart.toISOString(),
                        available: true
                    });
                } else {
                    // Find if this busy slot corresponds to a specific scheduled event
                    // Check intersection of time
                    const matchedEvent = detailedEvents.find(ev => {
                        const evStart = new Date(ev.start_time).getTime();
                        const evEnd = new Date(ev.end_time).getTime();
                        const sStart = slotStart.getTime();
                        const sEnd = slotEnd.getTime();
                        // Simple overlap check
                        return (sStart < evEnd && sEnd > evStart);
                    });

                    daySlots.push({
                        time: slotStart.toLocaleTimeString('mk-MK', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Europe/Skopje' }),
                        isoTime: slotStart.toISOString(),
                        available: false,
                        bookedBy: matchedEvent ? matchedEvent.inviteeName : 'РЕЗЕРВИРАНО',
                        serviceTitle: matchedEvent ? matchedEvent.name : undefined
                    });
                }
            }

            if (daySlots.length > 0) {
                days.push({ date: dateStr, slots: daySlots });
            }
        }

        return days;

    } catch (error) {
        console.error(`Error checking availability range:`, error);
        return [];
    }
};


export const checkAvailability = async (
    token: string,
    eventTypeUri: string, // Not used strictly for busy times but good for future duration logic
    date: string,
    workingHours?: { day: string, open: string, close: string, isClosed: boolean }[]
): Promise<DayAvailability> => {
    const startTime = `${date}T00:00:00.000Z`;
    const endTime = `${date}T23:59:59.000Z`;
    const results = await fetchAvailabilityRange(token, eventTypeUri, startTime, endTime, workingHours);
    return results[0] || { date, slots: [] };
};


export interface BookingResult {
    success: boolean;
    error?: string;
    details?: any;
}

export const bookAppointment = async (
    token: string,
    eventTypeUri: string,
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
            event_type: eventTypeUri,
            start_time: bookingData.start,
            invitee: {
                name: bookingData.name,
                email: bookingData.email,
                timezone: 'Europe/Skopje'
            }
        };

        // Dynamically add location if configured (Required for "Invitee Chooses" or specific event types)
        if (locationConfig) {
            body.location = {
                kind: locationConfig.kind,
                location: locationConfig.location
            };
        }

        const res = await fetch(`${CALENDLY_API_BASE}/invitees`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(body)
        });

        if (!res.ok) {
            const errorText = await res.text();
            console.error(`Calendly Booking Error (${res.status}): ${errorText}`);

            if (res.status === 429) {
                return { success: false, error: 'Booking failed: System is busy (Rate Limit). Please try again in a minute.' };
            }
            if (res.status === 403) {
                return { success: false, error: 'Booking failed: Account requires a paid Calendly plan for API bookings.' };
            }
            if (res.status === 404) {
                return { success: false, error: 'Booking failed: Invalid event type or configuration.' };
            }

            try {
                const json = JSON.parse(errorText);
                if (json.details && Array.isArray(json.details)) {
                    const filled = json.details.find((d: any) => d.code === 'already_filled');
                    if (filled) return { success: false, error: 'Booking failed: This time slot is already taken.' };

                    return { success: false, error: `Booking failed: ${json.details[0]?.message || json.message}` };
                }
                return { success: false, error: json.message || `HTTP ${res.status}` };
            } catch (e) {
                return { success: false, error: `HTTP ${res.status}: ${errorText}` };
            }
        }

        const data = await res.json();
        return { success: true, details: data };

    } catch (error: any) {
        console.error('Network Error during booking:', error);
        return { success: false, error: error.message || 'Unknown network error' };
    }
};
