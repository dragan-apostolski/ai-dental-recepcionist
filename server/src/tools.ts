import { FunctionDeclaration, Type } from '@google/genai';
import { checkAvailability, bookAppointment } from './services/calendlyService';
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

        const avail = await checkAvailability(settings.calendlyToken, eventUri, date, settings.workingHours);
        const slots = avail.slots.filter(s => s.available).map(s => s.time);
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

        const avail = await checkAvailability(settings.calendlyToken, eventUri, date, settings.workingHours);
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

        const bookResult = await bookAppointment(settings.calendlyToken, eventUri, {
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
