
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality, FunctionDeclaration, Type } from '@google/genai';
import { Settings, DayAvailability, CalendlyEvent, WorkingHour, Service } from './types';
import { GEMINI_MODEL } from './constants';
import { getSystemInstruction } from './prompts';
import { translations } from './i18n';
import { checkAvailability, bookAppointment, fetchAvailabilityRange } from './services/calendlyService';
import { loadSettings, saveSettings, auth } from './services/storageService';
import PhoneInterface from './components/PhoneInterface';
import BookingCalendar from './components/BookingCalendar';
import ConfigPanel from './components/ConfigPanel';
import OnboardingWizard from './components/OnboardingWizard';
import Auth from './components/Auth';
import { Loader2, LayoutDashboard, LogOut, Settings as SettingsIcon, ShieldCheck } from 'lucide-react';
import { User } from '@supabase/supabase-js';

// Audio Helpers
function decode(base64: string) {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number,
  numChannels: number,
): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}

function encode(bytes: Uint8Array) {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

const DEFAULT_WORKING_HOURS: WorkingHour[] = [
  { day: 'Monday', open: '08:00', close: '18:00', isClosed: false },
  { day: 'Tuesday', open: '08:00', close: '18:00', isClosed: false },
  { day: 'Wednesday', open: '08:00', close: '18:00', isClosed: false },
  { day: 'Thursday', open: '08:00', close: '18:00', isClosed: false },
  { day: 'Friday', open: '08:00', close: '18:00', isClosed: false },
  { day: 'Saturday', open: '09:00', close: '14:00', isClosed: false },
  { day: 'Sunday', open: '09:00', close: '14:00', isClosed: true },
];

const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [showSettings, setShowSettings] = useState(false);

  const [settings, setSettings] = useState<Settings>({
    onboarded: false,
    companyName: '',
    address: '',
    phoneNumber: '',
    services: [],
    workingHours: DEFAULT_WORKING_HOURS,
    businessDescription: '',
    agentName: 'Dejan',
    language: 'mk',
    uiLanguage: 'mk',
    voiceName: 'Charon',
    calendlyToken: '',
    eventTypes: [],
    selectedEventTypeIds: []
  });

  const t = translations[settings.uiLanguage];

  const [isCalling, setIsCalling] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const isMutedRef = useRef(isMuted);
  useEffect(() => {
    isMutedRef.current = isMuted;
  }, [isMuted]);

  const [isModelSpeaking, setIsModelSpeaking] = useState(false);
  const [schedule, setSchedule] = useState<DayAvailability[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [logs, setLogs] = useState<{ msg: string, type: 'info' | 'error', timestamp: number }[]>([]);

  const audioContextInRef = useRef<AudioContext | null>(null);
  const audioContextOutRef = useRef<AudioContext | null>(null);
  const nextStartTimeRef = useRef(0);
  const sessionRef = useRef<any>(null);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const pendingEndCallRef = useRef(false);

  useEffect(() => {
    const { data: { subscription } } = auth.onAuthStateChange((newUser) => {
      setUser(newUser);
      if (newUser) {
        loadSettings().then((saved) => {
          if (saved) {
            setSettings(prev => ({ ...prev, ...saved }));
            if (saved.onboarded) refreshSchedule(saved);
          }
        }).finally(() => {
          setIsAuthLoading(false);
        });
      } else {
        setIsAuthLoading(false);
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  const addLog = (msg: string, type: 'info' | 'error' = 'info') => {
    setLogs(prev => [{ msg, type, timestamp: Date.now() }, ...prev].slice(0, 50));
  };

  const tools: FunctionDeclaration[] = [
    {
      name: 'checkAvailability',
      parameters: {
        type: Type.OBJECT,
        description: 'Check available slots for a given date.',
        properties: {
          date: { type: Type.STRING, description: 'Date in YYYY-MM-DD format' },
          serviceName: { type: Type.STRING, description: 'Name of the service' }
        },
        required: ['date', 'serviceName']
      }
    },
    {
      name: 'bookAppointment',
      parameters: {
        type: Type.OBJECT,
        description: 'Book an appointment in Cal.com database.',
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
      parameters: { type: Type.OBJECT, description: 'End the phone call session.' }
    }
  ];

  const refreshSchedule = async (config: Settings) => {
    if (!config.calendlyToken || !config.selectedEventTypeIds?.length) return;
    setIsRefreshing(true);
    const startDate = new Date();
    const endDate = new Date();
    endDate.setDate(startDate.getDate() + 14);

    try {
      const results = await Promise.all(
        config.selectedEventTypeIds.map(uri =>
          fetchAvailabilityRange(config.calendlyToken, uri, startDate.toISOString(), endDate.toISOString(), config.workingHours)
        )
      );

      const daysMap: Record<string, Set<string>> = {};
      results.forEach(eventAvailabilities => {
        eventAvailabilities.forEach(day => {
          if (!daysMap[day.date]) daysMap[day.date] = new Set();
          day.slots.forEach(s => daysMap[day.date].add(JSON.stringify(s)));
        });
      });

      const finalSchedule: DayAvailability[] = Object.entries(daysMap)
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([date, slotsSet]) => ({
          date,
          slots: Array.from(slotsSet).map(s => JSON.parse(s)).sort((a, b) => a.time.localeCompare(b.time))
        }));

      setSchedule(finalSchedule);
    } catch (err: any) {
      addLog(`Sync failed: ${err.message}`, 'error');
    } finally {
      setIsRefreshing(false);
    }
  };

  const startCall = async () => {
    if (!settings.calendlyToken) {
      addLog("Missing API Key. Please check settings.", "error");
      return;
    }
    pendingEndCallRef.current = false;
    addLog("Initializing secure voice session...");

    try {
      const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY });
      audioContextInRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      audioContextOutRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });

      await audioContextInRef.current.resume();
      await audioContextOutRef.current.resume();

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const now = new Date();
      const locale = settings.language === 'mk' ? 'mk-MK' : settings.language === 'sl' ? 'sl-SI' : 'en-US';
      const currentDateTimeStr = now.toLocaleDateString(locale, {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit'
      });

      const sessionPromise = ai.live.connect({
        model: GEMINI_MODEL,
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: settings.voiceName } }
          },
          temperature: 0.1,
          systemInstruction: getSystemInstruction(settings, currentDateTimeStr),
          tools: [{ functionDeclarations: tools }],
          realtimeInputConfig: {
            automaticActivityDetection: {
              silenceDurationMs: 500,
            }
          }
        },
        callbacks: {
          onopen: () => {
            setIsCalling(true);
            addLog("Voice session active. Agent ready.");
            const source = audioContextInRef.current!.createMediaStreamSource(stream);
            const scriptProcessor = audioContextInRef.current!.createScriptProcessor(1024, 1, 1);
            scriptProcessor.onaudioprocess = (e) => {
              const inputData = e.inputBuffer.getChannelData(0);
              const int16 = new Int16Array(inputData.length);
              for (let i = 0; i < inputData.length; i++) int16[i] = inputData[i] * 32768;
              const pcmBlob = { data: encode(new Uint8Array(int16.buffer)), mimeType: 'audio/pcm;rate=16000' };
              sessionPromise.then(s => {
                if (!isMutedRef.current && pendingEndCallRef.current === false) {
                  // Just fire and forget. The helper handles buffering?
                  // No, we must check if session is open??
                  // The error is "WebSocket is already in CLOSING or CLOSED state."
                  // This happens inside s.sendRealtimeInput
                  try {
                    s.sendRealtimeInput({ media: pcmBlob });
                  } catch (err) {
                    // Ignore send errors if session closed mid-frame
                  }
                }
              });
            };
            source.connect(scriptProcessor);
            scriptProcessor.connect(audioContextInRef.current!.destination);

            // Force the model to speak first
            setTimeout(() => {
              sessionPromise.then(s => s.sendRealtimeInput({ text: "Hello. The user is on the line. Greet them based on the time of day." }));
            }, 100);
          },
          onmessage: async (msg: LiveServerMessage) => {
            if (msg.serverContent?.interrupted) {
              for (const source of sourcesRef.current.values()) { source.stop(); sourcesRef.current.delete(source); }
              nextStartTimeRef.current = 0;
              setIsModelSpeaking(false);
              addLog("Audio stream interrupted.");
            }
            const audioData = msg.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
            if (audioData) {
              setIsModelSpeaking(true);
              const outCtx = audioContextOutRef.current!;
              nextStartTimeRef.current = Math.max(nextStartTimeRef.current, outCtx.currentTime);
              const buffer = await decodeAudioData(decode(audioData), outCtx, 24000, 1);
              const source = outCtx.createBufferSource();
              source.buffer = buffer;
              source.connect(outCtx.destination);
              source.onended = () => {
                sourcesRef.current.delete(source);
                if (sourcesRef.current.size === 0) {
                  setIsModelSpeaking(false);
                  if (pendingEndCallRef.current) {
                    addLog("Closing session as requested by AI.");
                    setTimeout(() => endCall(), 1200);
                  }
                }
              };
              source.start(nextStartTimeRef.current);
              nextStartTimeRef.current += buffer.duration;
              sourcesRef.current.add(source);
            }
            if (msg.toolCall) {
              for (const fc of msg.toolCall.functionCalls) {
                let result: any = "error";
                if (fc.name === 'checkAvailability') {
                  const { date, serviceName } = fc.args as any;
                  addLog(`AI checking availability for "${serviceName}" on ${date}...`);
                  const et = settings.eventTypes.find(t => t.title.toLowerCase().includes(serviceName.toLowerCase())) || settings.eventTypes[0];
                  if (!et) {
                    addLog(`Service "${serviceName}" not found.`, "error");
                    result = "Error: Service not configured.";
                  } else {
                    const avail = await checkAvailability(settings.calendlyToken, et.uri, date, settings.workingHours);
                    const slots = avail.slots.filter(s => s.available).map(s => s.time);
                    result = slots.length > 0 ? `Available slots: ${slots.join(', ')}` : "No slots available for this date.";
                    addLog(`Found ${slots.length} available slots.`);
                  }
                } else if (fc.name === 'bookAppointment') {
                  const { service, date, time, name, email } = fc.args as any;
                  addLog(`AI processing booking for ${name}...`);
                  const et = settings.eventTypes.find(t => t.title.toLowerCase().includes(service.toLowerCase())) || settings.eventTypes[0];
                  const avail = await checkAvailability(settings.calendlyToken, et.uri, date, settings.workingHours);
                  const slot = avail.slots.find(s => s.time === time);
                  const bookResult = await bookAppointment(settings.calendlyToken, et.uri, {
                    start: slot?.isoTime || `${date}T${time}:00Z`, name, email
                  });
                  if (bookResult.success) {
                    result = "Booking successful.";
                    addLog(`Booking confirmed for ${name} at ${time}.`);
                    refreshSchedule(settings);
                  }
                  else {
                    result = `Error: ${bookResult.error}`;
                    addLog(`Booking failed: ${bookResult.error}`, "error");
                  }
                } else if (fc.name === 'endCall') {
                  addLog('AI initiated call termination.');
                  pendingEndCallRef.current = true;
                  if (sourcesRef.current.size === 0) endCall();
                  result = "ok";
                }
                sessionPromise.then(s => s.sendToolResponse({ functionResponses: { id: fc.id, name: fc.name, response: { result } } }));
              }
            }
          },
          onerror: (e) => {
            addLog(`Session Error: ${e.message}`, 'error');
            setIsCalling(false);
          },
          onclose: () => {
            setIsCalling(false);
            addLog("Session closed.");
          }
        }
      });
      sessionRef.current = await sessionPromise;
    } catch (e: any) {
      addLog(`Initialization failed: ${e.message}`, 'error');
    }
  };

  const endCall = useCallback(() => {
    sessionRef.current?.close();
    audioContextInRef.current?.close();
    audioContextOutRef.current?.close();
    setIsCalling(false);
    setIsModelSpeaking(false);
  }, []);

  const handleSaveSettings = (newSettings: Settings) => {
    setSettings(newSettings);
    saveSettings(newSettings);
    refreshSchedule(newSettings);
    setShowSettings(false);
  };

  const handleFinishOnboarding = (finalSettings: Settings) => {
    const updated = { ...finalSettings, onboarded: true };
    setSettings(updated);
    saveSettings(updated);
    refreshSchedule(updated);
  };

  if (isAuthLoading) return <div className="h-screen flex items-center justify-center bg-slate-50"><Loader2 className="animate-spin text-teal-600" size={48} /></div>;
  if (!user) return <Auth onSuccess={() => { }} />;
  if (!settings.onboarded) return <OnboardingWizard initialSettings={settings} onFinish={handleFinishOnboarding} />;

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-slate-50 selection:bg-teal-100 selection:text-teal-900">
      <header className="h-16 bg-white border-b border-slate-100 px-6 flex justify-between items-center z-50">
        <div className="flex items-center gap-3">
          <div className="bg-slate-900 p-2 rounded-xl text-white shadow-lg transform -rotate-3"><LayoutDashboard size={20} /></div>
          <div><h1 className="text-lg font-black text-slate-900 tracking-tight italic uppercase">{t.appTitle}</h1><p className="text-[9px] font-bold text-teal-600 uppercase tracking-widest leading-none">{t.subtitle}</p></div>
        </div>
        <div className="flex items-center gap-4">
          {isRefreshing && <div className="text-slate-400 text-[10px] font-bold animate-pulse flex items-center gap-1.5"><Loader2 size={12} className="animate-spin" /> {t.syncing}</div>}
          <button onClick={() => setShowSettings(true)} className="p-2.5 bg-slate-50 hover:bg-slate-100 text-slate-500 rounded-xl transition-all border border-slate-100"><SettingsIcon size={20} /></button>
          <div className="h-8 w-px bg-slate-100 mx-1" />
          <div className="flex items-center gap-3">
            <div className="flex flex-col items-end leading-tight"><span className="text-xs font-black text-slate-700">{user.email?.split('@')[0]}</span><button onClick={() => auth.signOut()} className="text-[9px] font-black uppercase tracking-widest text-rose-500 hover:text-rose-600 flex items-center gap-1 transition-colors"><LogOut size={10} /> {t.logout}</button></div>
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-slate-800 to-slate-950 text-white flex items-center justify-center text-sm font-black shadow-xl ring-2 ring-white">{user.email?.[0].toUpperCase()}</div>
          </div>
        </div>
      </header>
      <div className="flex-1 overflow-hidden relative">
        <main className="h-full flex flex-col lg:flex-row p-6 gap-6 max-w-[1600px] mx-auto w-full">
          <div className="w-full lg:w-[360px] flex flex-col shrink-0 items-center lg:items-start"><PhoneInterface settings={settings} isCalling={isCalling} onToggleCall={() => isCalling ? endCall() : startCall()} isMuted={isMuted} onToggleMute={() => setIsMuted(!isMuted)} isModelSpeaking={isModelSpeaking} logs={[...logs].reverse()} /></div>
          <div className="flex-1 min-w-0"><BookingCalendar schedule={schedule} uiLanguage={settings.uiLanguage} /></div>
        </main>
        {showSettings && (
          <div className="absolute inset-0 z-[100] flex animate-in fade-in duration-300">
            <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-md" onClick={() => setShowSettings(false)} />
            <div className="relative ml-auto w-full max-w-md h-full bg-white shadow-2xl animate-in slide-in-from-right duration-500 overflow-y-auto no-scrollbar border-l border-slate-100">
              <ConfigPanel settings={settings} onUpdate={setSettings} onSave={handleSaveSettings} onClose={() => setShowSettings(false)} />
            </div>
          </div>
        )}
      </div>
      <footer className="h-10 bg-white border-t border-slate-100 px-6 flex items-center justify-between text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2"><ShieldCheck size={14} className="text-teal-600" /><span>Secure AI Protocol</span></div>
          <div className="flex items-center gap-2">
            <div className={`w-1.5 h-1.5 rounded-full ${isCalling ? 'bg-teal-500 animate-pulse shadow-[0_0_8px_rgba(20,184,166,0.5)]' : 'bg-slate-300'}`} />
            <span>Agent: {settings.agentName}</span>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <span className="opacity-60">System Version V2.7.0</span>
          <div className="h-4 w-px bg-slate-100" />
          <span className="text-teal-600/60">Powered by Gemini Flash 2.5</span>
        </div>
      </footer>
    </div>
  );
};

export default App;
