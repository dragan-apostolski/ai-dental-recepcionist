import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Settings, DayAvailability, WorkingHour } from './types';
import { translations } from './i18n';
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
  const wsRef = useRef<WebSocket | null>(null);
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

  const refreshSchedule = async (config: Settings & { days?: number }) => {
    const activeToken = config.activeCalendarProvider === 'calcom' ? config.calcomToken : config.calendlyToken;
    if (!activeToken) {
      setSchedule([]);
      return;
    }

    setIsRefreshing(true);
    try {
      const apiUrl = import.meta.env.VITE_BACKEND_URL
        ? `${import.meta.env.VITE_BACKEND_URL}/api/schedule`
        : (() => {
          const protocol = window.location.protocol;
          const host = window.location.hostname;
          const port = (host === 'localhost' || host === '127.0.0.1') ? ':8080' : '';
          return `${protocol}//${host}${port}/api/schedule`;
        })();

      const res = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          token: config.activeCalendarProvider === 'calcom' ? config.calcomToken : config.calendlyToken,
          activeCalendarProvider: config.activeCalendarProvider,
          eventTypeIds: config.selectedEventTypeIds,
          workingHours: config.workingHours,
          days: config.days // Optional, passed if provided
        })
      });

      if (res.ok) {
        const data = await res.json();
        const newSchedule: DayAvailability[] = data.schedule || [];

        // If it's a partial update (days provided), merge. Otherwise replace.
        if (config.days) {
          setSchedule(prev => {
            const map = new Map(prev.map((d: DayAvailability) => [d.date, d]));
            newSchedule.forEach((d: DayAvailability) => map.set(d.date, d));
            // Sort by date just in case
            return (Array.from(map.values()) as DayAvailability[]).sort((a, b) => a.date.localeCompare(b.date));
          });
        } else {
          setSchedule(newSchedule);
        }
      } else {
        console.error("Failed to fetch schedule");
      }
    } catch (e) {
      console.error("Error refreshing schedule:", e);
    } finally {
      setIsRefreshing(false);
    }
  };

  // Poll for schedule updates every 5 seconds (fetch next 7 days only)
  useEffect(() => {
    const activeToken = settings.activeCalendarProvider === 'calcom' ? settings.calcomToken : settings.calendlyToken;
    if (!settings.onboarded || !activeToken) return;

    const intervalId = setInterval(() => {
      // Pass a special flag or just call refreshSchedule with 'days' param in a temp settings object
      // We do not want to trigger 'setIsRefreshing' spinner for background polls necessarily, 
      // effectively 'silent refresh'.
      // But reusing refreshSchedule sets isRefreshing=true. 
      // Let's make a silent version or just tolerate the spinner? 
      // User asked for "sync", seeing the spinner constantly might be annoying.
      // Let's copy the fetch logic for silent update.

      const silentUpdate = async () => {
        try {
          const apiUrl = import.meta.env.VITE_BACKEND_URL
            ? `${import.meta.env.VITE_BACKEND_URL}/api/schedule`
            : (() => {
              const protocol = window.location.protocol;
              const host = window.location.hostname;
              const port = (host === 'localhost' || host === '127.0.0.1') ? ':8080' : '';
              return `${protocol}//${host}${port}/api/schedule`;
            })();

          const res = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              token: settings.activeCalendarProvider === 'calcom' ? settings.calcomToken : settings.calendlyToken,
              activeCalendarProvider: settings.activeCalendarProvider,
              eventTypeIds: settings.selectedEventTypeIds,
              workingHours: settings.workingHours,
              days: 7 // Only fetch next 7 days
            })
          });

          if (res.ok) {
            const data = await res.json();
            const newSchedule: DayAvailability[] = data.schedule || [];

            setSchedule(prev => {
              // Create a map of existing days
              const map = new Map(prev.map((d: DayAvailability) => [d.date, d]));
              // Update with new data
              newSchedule.forEach(d => map.set(d.date, d));
              // Convert back to sorted array
              return (Array.from(map.values()) as DayAvailability[]).sort((a, b) => a.date.localeCompare(b.date));
            });
          }
        } catch (e) {
          // Silent catch
        }
      };

      silentUpdate();

    }, 60000); // 60 seconds

    return () => clearInterval(intervalId);
  }, [settings.onboarded, settings.calendlyToken, settings.calcomToken, settings.activeCalendarProvider, settings.selectedEventTypeIds, settings.workingHours]);

  const startCall = async () => {
    const activeToken = settings.activeCalendarProvider === 'calcom' ? settings.calcomToken : settings.calendlyToken;
    if (!activeToken) {
      addLog("Missing API Key. Please check settings.", "error");
      return;
    }
    pendingEndCallRef.current = false;
    addLog("Connecting to server...");

    try {
      audioContextInRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      audioContextOutRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });

      await audioContextInRef.current.resume();
      await audioContextOutRef.current.resume();

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      const wsUrl = import.meta.env.VITE_WS_URL
        ? `${import.meta.env.VITE_WS_URL}/client-stream`
        : (() => {
          const wsProtocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
          const wsHost = window.location.hostname;
          const wsPort = (wsHost === 'localhost' || wsHost === '127.0.0.1') ? ':8080' : '';
          return `${wsProtocol}://${wsHost}${wsPort}/client-stream`;
        })();

      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log("WS Connected");
        ws.send(JSON.stringify({ type: 'setup', settings }));

        setIsCalling(true);
        addLog("Voice session active. Agent ready.");

        const source = audioContextInRef.current!.createMediaStreamSource(stream);
        const scriptProcessor = audioContextInRef.current!.createScriptProcessor(1024, 1, 1);
        scriptProcessor.onaudioprocess = (e) => {
          const inputData = e.inputBuffer.getChannelData(0);
          const int16 = new Int16Array(inputData.length);
          for (let i = 0; i < inputData.length; i++) int16[i] = inputData[i] * 32768;
          const pcmBlob = { data: encode(new Uint8Array(int16.buffer)), mimeType: 'audio/pcm;rate=16000' };

          if (ws.readyState === WebSocket.OPEN && !isMutedRef.current && pendingEndCallRef.current === false) {
            ws.send(JSON.stringify({ realtimeInput: { media: pcmBlob } }));
          }
        };
        source.connect(scriptProcessor);
        scriptProcessor.connect(audioContextInRef.current!.destination);
      };

      ws.onmessage = async (event) => {
        const msg = JSON.parse(event.data);

        if (msg.type === 'log') {
          addLog(msg.message, msg.level || 'info');
          return;
        }
        if (msg.type === 'event' && msg.name === 'refresh_schedule') {
          refreshSchedule(settings);
          return;
        }
        if (msg.type === 'event' && msg.name === 'call_ended') {
          addLog('AI is ending the call...');
          pendingEndCallRef.current = true;
          // Don't end immediately — let the farewell audio finish.
          // source.onended will call endCall() once all audio drains.
          return;
        }

        if (msg.serverContent?.interrupted) {
          for (const source of sourcesRef.current.values()) { source.stop(); sourcesRef.current.delete(source); }
          nextStartTimeRef.current = 0;
          setIsModelSpeaking(false);
          addLog("Audio stream interrupted.");
        }

        const audioData = msg.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
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
      };

      ws.onerror = (e) => {
        addLog("WebSocket Error", "error");
        console.error(e);
        cleanupAudio();
      };

      ws.onclose = () => {
        addLog("Disconnected from server");
        cleanupAudio();
      }

    } catch (e: any) {
      addLog(`Initialization failed: ${e.message}`, 'error');
    }
  };

  const cleanupAudio = useCallback(() => {
    if (audioContextInRef.current) {
      try {
        audioContextInRef.current.close();
      } catch (e) { console.error("Error closing audio in", e); }
      audioContextInRef.current = null;
    }
    if (audioContextOutRef.current) {
      try {
        audioContextOutRef.current.close();
      } catch (e) { console.error("Error closing audio out", e); }
      audioContextOutRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setIsCalling(false);
    setIsModelSpeaking(false);
    // Stop all source nodes
    for (const source of sourcesRef.current.values()) {
      try { source.stop(); } catch (e) { }
    }
    sourcesRef.current.clear();
  }, []);

  const endCall = useCallback(() => {
    pendingEndCallRef.current = true; // Mark as pending end to stop logic
    // wsRef.current?.close(); // Initiate close 
    // Wait for ongoing audio to finish? Logic says close immediately.
    cleanupAudio();
  }, [cleanupAudio]);

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
          <div><h1 className="text-lg font-bold text-slate-900 tracking-tight italic uppercase">{t.appTitle}</h1><p className="text-[9px] font-bold text-teal-600 uppercase tracking-widest leading-none">{t.subtitle}</p></div>
        </div>
        <div className="flex items-center gap-4">
          {isRefreshing && <div className="text-slate-400 text-[10px] font-bold animate-pulse flex items-center gap-1.5"><Loader2 size={12} className="animate-spin" /> {t.syncing}</div>}
          <button onClick={() => setShowSettings(true)} className="p-2.5 bg-slate-50 hover:bg-slate-100 text-slate-500 rounded-xl transition-all border border-slate-100"><SettingsIcon size={20} /></button>
          <div className="h-8 w-px bg-slate-100 mx-1" />
          <div className="flex items-center gap-3">
            <div className="flex flex-col items-end leading-tight"><span className="text-xs font-bold text-slate-700">{user.email?.split('@')[0]}</span><button onClick={() => auth.signOut()} className="text-[9px] font-bold uppercase tracking-widest text-rose-500 hover:text-rose-600 flex items-center gap-1 transition-colors"><LogOut size={10} /> {t.logout}</button></div>
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-slate-800 to-slate-950 text-white flex items-center justify-center text-sm font-bold shadow-xl ring-2 ring-white">{user.email?.[0].toUpperCase()}</div>
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
            <div className="relative ml-auto w-full max-w-3xl h-full bg-white shadow-2xl animate-in slide-in-from-right duration-500 overflow-y-auto no-scrollbar border-l border-slate-100">
              <ConfigPanel settings={settings} onUpdate={setSettings} onSave={handleSaveSettings} onClose={() => setShowSettings(false)} />
            </div>
          </div>
        )}
      </div>
      <footer className="h-10 bg-white border-t border-slate-100 px-6 flex items-center justify-between text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em]">
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
