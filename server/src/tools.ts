import { FunctionDeclaration, Type } from '@google/genai';
import { checkAvailability as checkCalendlyAvailability, bookAppointment as bookCalendlyAppointment } from './services/calendlyService';
import { checkAvailability as checkCalcomAvailability, bookAppointment as bookCalcomAppointment } from './services/calcomService';
import { Settings } from './types';

export const tools: FunctionDeclaration[] = [
    {
        name: 'checkAvailability',
        description: 'Check available appointment slots for a given service and date.\n**Invocation Condition:** Invoke this tool *only after* the user has specified a service AND a desired date or time. Do NOT call this tool speculatively. Do NOT call this tool if the day is marked as Closed in Working Hours.',
        parameters: {
            type: Type.OBJECT,
            properties: {
                date: { type: Type.STRING, description: 'Date in YYYY-MM-DD format. Calculate this from the current date before calling.' },
                serviceName: { type: Type.STRING, description: 'Name of the service the user wants to book.' }
            },
            required: ['date', 'serviceName']
        }
    },
    {
        name: 'verifyBookingData',
        description: 'Verifies the collected patient information before requesting final confirmation to book.\n**Invocation Condition:** Invoke this tool *only after* ALL of the following have been collected: (1) service name, (2) date, (3) time, (4) full name, (5) email address. This tool MUST be called BEFORE you ask the user to confirm the booking.',
        parameters: {
            type: Type.OBJECT,
            properties: {
                service: { type: Type.STRING, description: 'Service name exactly as the user requested.' },
                date: { type: Type.STRING, description: 'Date in YYYY-MM-DD format.' },
                time: { type: Type.STRING, description: 'Time in HH:MM format (e.g. 14:00).' },
                name: { type: Type.STRING, description: 'Full name of the patient.' },
                email: { type: Type.STRING, description: 'Patient email address in valid format using latin characters only.' }
            },
            required: ['service', 'date', 'time', 'name', 'email']
        }
    },
    {
        name: 'bookAppointment',
        description: 'Creates a confirmed appointment booking in the calendar system. Returns success or an error.\n**Invocation Condition:** Invoke this tool *only after* ALL of the following have been collected AND the user has explicitly confirmed the summary with "Yes" (or equivalent): (1) service name, (2) date, (3) time, (4) full name, (5) email address. WARNING: You are FORBIDDEN from verbally confirming a booking to the user without calling this tool first. You must execute this tool to actually push the appointment to the calendar.',
        parameters: {
            type: Type.OBJECT,
            properties: {
                service: { type: Type.STRING, description: 'Service name exactly as the user requested.' },
                date: { type: Type.STRING, description: 'Date in YYYY-MM-DD format.' },
                time: { type: Type.STRING, description: 'Time in HH:MM format (e.g. 14:00).' },
                name: { type: Type.STRING, description: 'Full name of the patient.' },
                email: { type: Type.STRING, description: 'Patient email address in valid format using latin characters only.' }
            },
            required: ['service', 'date', 'time', 'name', 'email']
        }
    },
    {
        name: 'endCall',
        description: 'Terminates the current phone call session.\n**Invocation Condition:** Invoke this tool *only after* the user has indicated they are finished (e.g., said goodbye or confirmed they need nothing else). Always give a warm closing message before calling this tool.',
        parameters: { type: Type.OBJECT, properties: {} }
    }
];

export async function handleToolCall(name: string, args: any, settings: Settings): Promise<any> {
    console.log(`[PERF] handleToolCall started for ${name}`);
    if (name === 'checkAvailability') {
        const { date, serviceName } = args;
        const services = settings.services || [];
        const configuredService = services.find(s => s.name.toLowerCase().includes(serviceName.toLowerCase()));
        let eventUri = configuredService?.calendlyEventTypeUri;

        if (!eventUri) {
            const et = settings.eventTypes.find(t => t.title.toLowerCase().includes(serviceName.toLowerCase()));
            eventUri = et?.uri;
        }

        if (!eventUri) {
            return "Error: Service not configured.";
        }

        // 1. Backend Guardrail: Check for Closed Days
        const d = new Date(date);
        const dayName = d.toLocaleDateString('en-US', { weekday: 'long' });
        const workingDay = settings.workingHours.find(h => h.day === dayName);

        if (workingDay && workingDay.isClosed) {
            return `System: The clinic is closed on ${dayName}. Do not offer appointments for this day. Ask the user for another day.`;
        }

        const checkAvailability = settings.activeCalendarProvider === 'calcom' ? checkCalcomAvailability : checkCalendlyAvailability;
        const token = settings.activeCalendarProvider === 'calcom' ? (settings.calcomToken || '') : settings.calendlyToken;

        const avail = await checkAvailability(token, eventUri, date, settings.workingHours);

        // 2. Backend Guardrail: Filter Past Slots
        const now = new Date();
        const validSlots = avail.slots.filter(s => {
            if (!s.available) return false;
            // Strict check: Is the slot time in the past?
            // s.isoTime is fully qualified ISO string
            const slotTime = new Date(s.isoTime);
            return slotTime > now;
        });

        const slots = validSlots.map(s => s.time);
        return slots.length > 0 ? `Available slots: ${slots.join(', ')}` : "No slots available for this date.";

    } else if (name === 'bookAppointment') {
        const { service, date, time, name: userName, email } = args;

        const services = settings.services || [];
        const configuredService = services.find(s => s.name.toLowerCase().includes(service.toLowerCase()));
        let eventUri = configuredService?.calendlyEventTypeUri;

        if (!eventUri) {
            const et = settings.eventTypes.find(t => t.title.toLowerCase().includes(service.toLowerCase()));
            eventUri = et?.uri;
        }

        if (!eventUri && settings.selectedEventTypeIds.length > 0) {
            eventUri = settings.selectedEventTypeIds[0];
        }

        if (!eventUri) {
            return "Error: Service not found or no event types configured.";
        }

        const checkAvailability = settings.activeCalendarProvider === 'calcom' ? checkCalcomAvailability : checkCalendlyAvailability;
        const bookAppointment = settings.activeCalendarProvider === 'calcom' ? bookCalcomAppointment : bookCalendlyAppointment;
        const token = settings.activeCalendarProvider === 'calcom' ? (settings.calcomToken || '') : settings.calendlyToken;

        const avail = await checkAvailability(token, eventUri, date, settings.workingHours);
        const slot = avail.slots.find(s => s.time === time);

        const eventType = settings.eventTypes.find(et => et.uri === eventUri);
        let locationConfig = undefined;

        if (eventType?.locations && eventType.locations.length > 0) {
            const loc = eventType.locations.find((l: any) => l.kind === 'physical') || eventType.locations[0];
            if (loc) {
                locationConfig = { kind: loc.kind, location: loc.location };
            }
        }

        if (settings.language === 'sl') {
            locationConfig = { kind: 'physical', location: 'Denta Lux, Ljubljana' };
        }

        const bookResult = await bookAppointment(token, eventUri, {
            start: slot?.isoTime || `${date}T${time}:00Z`, name: userName, email
        }, locationConfig);

        if (bookResult.success) {
            return "Booking successful.";
        } else {
            return `Error: ${bookResult.error}`;
        }
    } else if (name === 'verifyBookingData') {
        return "Data is verified. You MUST immediately call bookAppointment to secure the slot.";
    } else if (name === 'endCall') {
        return "ok";
    }
    return "Error: Tool not found";
}
