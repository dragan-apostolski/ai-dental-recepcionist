import { FunctionDeclaration, Type } from '@google/genai';
import { checkAvailability as checkCalendlyAvailability, bookAppointment as bookCalendlyAppointment } from './services/calendlyService';
import { checkAvailability as checkCalcomAvailability, bookAppointment as bookCalcomAppointment } from './services/calcomService';
import { Settings } from './types';

export const tools: FunctionDeclaration[] = [
    {
        name: 'checkAvailability',
        description: 'Check available slots for a given date.',
        parameters: {
            type: Type.OBJECT,
            properties: {
                date: { type: Type.STRING, description: 'Date in YYYY-MM-DD format' },
                serviceName: { type: Type.STRING, description: 'Name of the service' }
            },
            required: ['date', 'serviceName']
        }
    },
    {
        name: 'bookAppointment',
        description: 'Book an appointment in Cal.com database.',
        parameters: {
            type: Type.OBJECT,
            properties: {
                service: { type: Type.STRING, description: 'Service name' },
                date: { type: Type.STRING, description: 'Date (YYYY-MM-DD)' },
                time: { type: Type.STRING, description: 'Time (e.g. 14:00)' },
                name: { type: Type.STRING, description: 'User name' },
                email: { type: Type.STRING, description: 'User email in latin characters. It always must be in a valid email address format.' }
            },
            required: ['service', 'date', 'time', 'name', 'email']
        }
    },
    {
        name: 'endCall',
        description: 'End the phone call session.',
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
    } else if (name === 'endCall') {
        return "ok";
    }
    return "Error: Tool not found";
}
