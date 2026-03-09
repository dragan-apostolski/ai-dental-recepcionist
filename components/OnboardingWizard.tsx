
import React, { useState } from 'react';
import { Settings, Service, WorkingHour, CalendlyEvent } from '../types';
import { GoogleGenAI, Modality } from '@google/genai';
import {
  Building2, UserCircle, Calendar, ArrowRight, ArrowLeft,
  Check, Play, Loader2, Sparkles, LayoutDashboard, Plus, Trash2,
  Clock, MapPin, Phone, CheckCircle2, Languages, User, Users, Info,
  Banknote, Timer, Link2, Copy, Globe
} from 'lucide-react';
import { translations } from '../i18n';

interface OnboardingWizardProps {
  initialSettings: Settings;
  onFinish: (settings: Settings) => void;
}

const MALE_VOICES = ['Charon', 'Puck', 'Fenrir'];
const FEMALE_VOICES = ['Kore', 'Zephyr'];
const DAYS_ORDER = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const OnboardingWizard: React.FC<OnboardingWizardProps> = ({ initialSettings, onFinish }) => {
  const [step, setStep] = useState(1);
  const [settings, setSettings] = useState<Settings>(initialSettings);
  const [isFetchingEvents, setIsFetchingEvents] = useState(false);
  const [isPreviewing, setIsPreviewing] = useState<string | null>(null);
  const [pendingProviderSwitch, setPendingProviderSwitch] = useState<'calendly' | 'calcom' | null>(null);

  const t = translations[settings.uiLanguage];

  const update = (field: keyof Settings, value: any) => {
    setSettings(prev => ({ ...prev, [field]: value }));
  };

  const handleProviderSwitch = (provider: 'calendly' | 'calcom') => {
    if (settings.activeCalendarProvider === provider) return;

    if (settings.eventTypes.length > 0 || settings.services.some(s => s.calendlyEventTypeUri)) {
      setPendingProviderSwitch(provider);
      return;
    }

    executeProviderSwitch(provider);
  };

  const executeProviderSwitch = (provider: 'calendly' | 'calcom') => {
    setSettings(prev => ({
      ...prev,
      activeCalendarProvider: provider,
      eventTypes: [],
      selectedEventTypeIds: [],
      services: prev.services.map(s => ({ ...s, calendlyEventTypeUri: '' }))
    }));
    setPendingProviderSwitch(null);
  };

  const next = () => setStep(s => s + 1);
  const prev = () => setStep(s => s - 1);

  const fetchEvents = async () => {
    setIsFetchingEvents(true);
    try {
      const protocol = window.location.protocol;
      const host = window.location.hostname;
      const port = (host === 'localhost' || host === '127.0.0.1') ? ':8080' : '';
      const apiUrl = `${protocol}//${host}${port}/api/event-types`;

      const token = settings.activeCalendarProvider === 'calcom' ? settings.calcomToken : settings.calendlyToken;
      const res = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, activeCalendarProvider: settings.activeCalendarProvider })
      });

      if (res.ok) {
        const data = await res.json();
        setSettings(prev => ({ ...prev, eventTypes: data.eventTypes || [] }));
      } else {
        console.error('Failed to fetch event types');
      }
    } catch (e) {
      console.error('Error fetching event types:', e);
    } finally {
      setIsFetchingEvents(false);
    }
  };

  const addService = (calEvent: CalendlyEvent) => {
    const newService: Service = {
      id: crypto.randomUUID(),
      calendlyEventTypeUri: calEvent.uri,
      category: 'General',
      name: calEvent.title,
      price: '',
      duration: '30 min',
      description: calEvent.description || ''
    };
    update('services', [...settings.services, newService]);
    if (!settings.selectedEventTypeIds.includes(calEvent.uri)) {
      update('selectedEventTypeIds', [...settings.selectedEventTypeIds, calEvent.uri]);
    }
  };

  const removeService = (id: string, eventTypeUri: string) => {
    const filteredServices = settings.services.filter(s => s.id !== id);
    update('services', filteredServices);
    if (!filteredServices.some(s => s.calendlyEventTypeUri === eventTypeUri)) {
      update('selectedEventTypeIds', settings.selectedEventTypeIds.filter(uri => uri !== eventTypeUri));
    }
  };

  const updateService = (id: string, field: keyof Service, value: any) => {
    const updated = settings.services.map(s => s.id === id ? { ...s, [field]: value } : s);
    update('services', updated);
  };

  const updateHours = (day: string, field: keyof WorkingHour, value: any) => {
    const updated = settings.workingHours.map(h => h.day === day ? { ...h, [field]: value } : h);
    update('workingHours', updated);
  };

  const applyToAllDays = (sourceDay: WorkingHour) => {
    const updated = settings.workingHours.map(h => ({ ...h, open: sourceDay.open, close: sourceDay.close, isClosed: sourceDay.isClosed }));
    update('workingHours', updated);
  };

  const applyToWeekdays = (sourceDay: WorkingHour) => {
    const updated = settings.workingHours.map(h => {
      if (['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'].includes(h.day)) {
        return { ...h, open: sourceDay.open, close: sourceDay.close, isClosed: sourceDay.isClosed };
      }
      return h;
    });
    update('workingHours', updated);
  };

  const handlePreviewVoice = async (voiceName: string) => {
    if (isPreviewing) return;
    setIsPreviewing(voiceName);
    try {
      const protocol = window.location.protocol;
      const host = window.location.hostname;
      const port = (host === 'localhost' || host === '127.0.0.1') ? ':8080' : '';
      const apiUrl = `${protocol}//${host}${port}/api/tts`;

      const res = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: t.previewText, voiceName })
      });

      if (!res.ok) throw new Error('TTS failed');
      const data = await res.json();
      const audioData = data.audioData;

      if (audioData) {
        const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
        const binaryString = atob(audioData);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
        const dataInt16 = new Int16Array(bytes.buffer);

        const buffer = audioCtx.createBuffer(1, dataInt16.length, 24000);
        const channelData = buffer.getChannelData(0);
        for (let i = 0; i < dataInt16.length; i++) channelData[i] = dataInt16[i] / 32768.0;

        const source = audioCtx.createBufferSource();
        source.buffer = buffer;
        source.connect(audioCtx.destination);
        source.onended = () => setIsPreviewing(null);
        source.start();
      } else {
        setIsPreviewing(null);
      }
    } catch (e) {
      setIsPreviewing(null);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4 md:p-6 relative overflow-hidden">
      <div className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] bg-teal-900/20 blur-[150px] rounded-full" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[60%] h-[60%] bg-slate-800/20 blur-[150px] rounded-full" />
      <div className="w-full max-w-3xl relative z-10">
        <div className="text-center mb-6 space-y-2">
          <div className="inline-flex p-3 bg-white text-slate-950 rounded-2xl shadow-xl mb-2 transform -rotate-2"><LayoutDashboard size={24} /></div>
          <h1 className="text-2xl font-bold text-white tracking-tight uppercase italic">{t.setupTitle}</h1>
          <div className="flex items-center justify-center gap-2">
            {[1, 2, 3, 4, 5].map(i => <div key={i} className={`h-1.5 rounded-full transition-all duration-500 ${step >= i ? 'w-8 bg-teal-500' : 'w-4 bg-slate-800'}`} />)}
          </div>
        </div>

        <div className="bg-white rounded-[2.5rem] shadow-2xl overflow-hidden min-h-[600px] flex flex-col">
          <div className="flex-1 p-8 md:p-10 overflow-y-auto no-scrollbar max-h-[75vh]">
            {step === 1 && (
              <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="space-y-1">
                  <h2 className="text-xl font-bold text-slate-900 flex items-center gap-3"><Building2 className="text-teal-600" /> {t.clinic}</h2>
                  <p className="text-xs text-slate-500 font-medium tracking-tight">{t.welcomeSub}</p>
                </div>
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400 ml-1">{t.languageUI}</label>
                    <div className="flex gap-2">
                      {['mk', 'en', 'sl'].map(lang => (
                        <button key={lang} onClick={() => update('uiLanguage', lang)} className={`flex-1 py-3 rounded-xl border font-bold text-xs uppercase transition-all ${settings.uiLanguage === lang ? 'bg-teal-600 text-white border-teal-600' : 'bg-slate-50 border-slate-100 text-slate-400'}`}>
                          {lang === 'mk' ? 'Macedonian' : lang === 'sl' ? 'Slovenian' : 'English'}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400 ml-1">{t.businessName}</label>
                    <input type="text" value={settings.companyName} onChange={(e) => update('companyName', e.target.value)} className="w-full bg-slate-50 border border-slate-100 focus:border-teal-500 focus:bg-white p-4 rounded-2xl outline-none transition-all text-sm font-bold" />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1.5"><label className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400 ml-1">{t.address}</label><input type="text" value={settings.address} onChange={(e) => update('address', e.target.value)} className="w-full bg-slate-50 border border-slate-100 focus:border-teal-500 focus:bg-white p-4 rounded-2xl outline-none transition-all text-sm font-bold" /></div>
                    <div className="space-y-1.5"><label className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400 ml-1">{t.phone}</label><input type="text" value={settings.phoneNumber} onChange={(e) => update('phoneNumber', e.target.value)} className="w-full bg-slate-50 border border-slate-100 focus:border-teal-500 focus:bg-white p-4 rounded-2xl outline-none transition-all text-sm font-bold" /></div>
                  </div>
                </div>
              </div>
            )}
            {step === 2 && (
              <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="space-y-1"><h2 className="text-xl font-bold text-slate-900 flex items-center gap-3"><Calendar className="text-teal-600" /> {t.calendar}</h2><p className="text-xs text-slate-500 font-medium tracking-tight">{t.calendarSub}</p></div>
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400 ml-1">Calendar Provider</label>
                    <div className="flex gap-2">
                      <button onClick={() => handleProviderSwitch('calendly')} className={`flex-1 py-3 rounded-xl border font-bold text-xs uppercase transition-all ${settings.activeCalendarProvider !== 'calcom' ? 'bg-teal-600 text-white border-teal-600' : 'bg-slate-50 border-slate-100 text-slate-400'}`}>Calendly</button>
                      <button onClick={() => handleProviderSwitch('calcom')} className={`flex-1 py-3 rounded-xl border font-bold text-xs uppercase transition-all ${settings.activeCalendarProvider === 'calcom' ? 'bg-teal-600 text-white border-teal-600' : 'bg-slate-50 border-slate-100 text-slate-400'}`}>Cal.com</button>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400 ml-1">{settings.activeCalendarProvider === 'calcom' ? 'Cal.com API Key' : 'Calendly Token'}</label>
                    <div className="flex gap-2">
                      {settings.activeCalendarProvider === 'calcom' ? (
                        <input type="password" value={settings.calcomToken || ''} onChange={(e) => update('calcomToken', e.target.value)} className="flex-1 bg-slate-50 border border-slate-100 p-4 rounded-2xl outline-none text-sm font-bold" />
                      ) : (
                        <input type="password" value={settings.calendlyToken || ''} onChange={(e) => update('calendlyToken', e.target.value)} className="flex-1 bg-slate-50 border border-slate-100 p-4 rounded-2xl outline-none text-sm font-bold" />
                      )}
                      <button onClick={fetchEvents} disabled={isFetchingEvents || (settings.activeCalendarProvider === 'calcom' ? !settings.calcomToken : !settings.calendlyToken)} className="bg-slate-900 text-white px-6 rounded-2xl font-bold text-[9px] uppercase hover:bg-black transition-all disabled:opacity-50">{isFetchingEvents ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />} {t.sync}</button>
                    </div>
                  </div>
                  {settings.eventTypes.length > 0 && <div className="p-4 bg-teal-50 border border-teal-100 rounded-2xl text-xs font-bold text-teal-900 flex items-center gap-2"><CheckCircle2 className="text-teal-600" size={16} /> Found {settings.eventTypes.length} events.</div>}
                </div>
              </div>
            )}
            {step === 3 && (
              <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="space-y-1"><h2 className="text-xl font-bold text-slate-900 flex items-center gap-3"><Sparkles className="text-teal-600" /> {t.services}</h2><p className="text-xs text-slate-500 font-medium tracking-tight">{t.serviceSub}</p></div>
                <div className="space-y-4">
                  {settings.services.map((s) => (
                    <div key={s.id} className="p-5 bg-white border border-slate-200 rounded-[2rem] space-y-4 relative shadow-sm">
                      <button onClick={() => removeService(s.id, s.calendlyEventTypeUri)} className="absolute top-4 right-4 text-slate-300 hover:text-rose-500"><Trash2 size={16} /></button>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <input value={s.name} onChange={(e) => updateService(s.id, 'name', e.target.value)} className="w-full bg-slate-50 p-3 rounded-xl text-xs font-bold" placeholder="Service Name" />
                        <input value={s.price} onChange={(e) => updateService(s.id, 'price', e.target.value)} className="w-full bg-slate-50 p-3 rounded-xl text-xs font-bold" placeholder="Price" />
                      </div>
                    </div>
                  ))}
                  <div className="grid grid-cols-2 gap-2">
                    {settings.eventTypes.map(et => (
                      <button key={et.id} disabled={settings.services.some(s => s.calendlyEventTypeUri === et.uri)} onClick={() => addService(et)} className="p-3 rounded-xl border text-[10px] font-bold uppercase text-slate-700 hover:border-teal-500 disabled:opacity-30 transition-all">+ {et.title}</button>
                    ))}
                  </div>
                </div>
              </div>
            )}
            {step === 4 && (
              <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="space-y-1"><h2 className="text-xl font-bold text-slate-900 flex items-center gap-3"><Clock className="text-teal-600" /> {t.workingHours}</h2><p className="text-xs text-slate-500 font-medium tracking-tight">{t.hoursSub}</p></div>
                <div className="space-y-4">
                  <div className="p-5 bg-teal-50 border border-teal-100 rounded-[2rem] space-y-3">
                    <div className="flex gap-2"><input type="time" id="bulk-open" defaultValue="09:00" className="flex-1 p-2 rounded-xl text-xs font-bold" /><input type="time" id="bulk-close" defaultValue="17:00" className="flex-1 p-2 rounded-xl text-xs font-bold" /></div>
                    <div className="flex gap-2"><button onClick={() => applyToWeekdays({ day: '', open: (document.getElementById('bulk-open') as any).value, close: (document.getElementById('bulk-close') as any).value, isClosed: false })} className="flex-1 py-2 bg-teal-600 text-white rounded-xl text-[9px] font-bold uppercase">{t.applyWeekdays}</button><button onClick={() => applyToAllDays({ day: '', open: (document.getElementById('bulk-open') as any).value, close: (document.getElementById('bulk-close') as any).value, isClosed: false })} className="flex-1 py-2 bg-slate-900 text-white rounded-xl text-[9px] font-bold uppercase">{t.applyAll}</button></div>
                  </div>
                  <div className="space-y-2">
                    {DAYS_ORDER.map(day => {
                      const h = settings.workingHours.find(d => d.day === day)!;
                      return (
                        <div key={day} className="flex items-center gap-3 p-3 bg-slate-50 rounded-2xl text-[10px] font-bold">
                          <span className="w-16 text-slate-600">{day}</span>
                          <div className="flex-1 flex gap-2"><input type="time" disabled={h.isClosed} value={h.open} onChange={(e) => updateHours(day, 'open', e.target.value)} className="flex-1 p-2 rounded-lg" /><input type="time" disabled={h.isClosed} value={h.close} onChange={(e) => updateHours(day, 'close', e.target.value)} className="flex-1 p-2 rounded-lg" /></div>
                          <button onClick={() => updateHours(day, 'isClosed', !h.isClosed)} className={`px-3 py-1.5 rounded-lg min-w-[50px] ${h.isClosed ? 'bg-rose-500 text-white' : 'bg-slate-200 text-slate-400'}`}>{h.isClosed ? t.off : t.on}</button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
            {step === 5 && (
              <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="space-y-1"><h2 className="text-xl font-bold text-slate-900 flex items-center gap-3"><UserCircle className="text-teal-600" /> {t.persona}</h2><p className="text-xs text-slate-500 font-medium tracking-tight">{t.personaSub}</p></div>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5"><label className="text-[10px] font-bold uppercase text-slate-400 ml-1">{t.agentName}</label><input value={settings.agentName} onChange={(e) => update('agentName', e.target.value)} className="w-full bg-slate-50 p-4 rounded-2xl text-sm font-bold" /></div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold uppercase text-slate-400 ml-1">{t.languageAgent}</label>
                      <select value={settings.language} onChange={(e) => update('language', e.target.value)} className="w-full bg-slate-50 p-4 rounded-2xl text-sm font-bold outline-none appearance-none">
                        <option value="mk">Macedonian</option><option value="en">English</option><option value="sl">Slovenian</option>
                      </select>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {[...MALE_VOICES, ...FEMALE_VOICES].map(v => (
                      <button key={v} onClick={() => update('voiceName', v)} className={`p-4 rounded-2xl border flex items-center justify-between ${settings.voiceName === v ? 'bg-teal-50 border-teal-500' : 'bg-slate-50 border-slate-100'}`}>
                        <span className="text-xs font-bold uppercase">{v}</span>
                        <div onClick={(e) => { e.stopPropagation(); handlePreviewVoice(v); }} className="p-2 bg-white rounded-lg text-teal-600">{isPreviewing === v ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}</div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
          <div className="p-8 bg-slate-50 border-t border-slate-100 flex justify-between items-center">
            {step > 1 ? <button onClick={prev} className="flex items-center gap-2 text-slate-500 font-bold text-xs uppercase"><ArrowLeft size={16} /> {t.back}</button> : <div />}
            <button onClick={step === 5 ? () => onFinish(settings) : next} className="bg-slate-900 text-white px-10 py-4 rounded-2xl font-bold text-xs uppercase tracking-widest shadow-xl flex items-center gap-3">{step === 5 ? <>{t.finish} <Check size={18} /></> : <>{t.continue} <ArrowRight size={18} /></>}</button>
          </div>
        </div>
      </div>

      {pendingProviderSwitch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-200 border border-slate-100">
            <div className="p-6 text-center space-y-4">
              <div className="w-16 h-16 bg-rose-50 text-rose-500 rounded-full flex items-center justify-center mx-auto mb-2">
                <Calendar size={28} />
              </div>
              <h3 className="text-lg font-bold text-slate-900 tracking-tight">Change Provider?</h3>
              <p className="text-xs text-slate-500 font-medium leading-relaxed">Switching calendar providers will clear your imported events and service mappings. Do you want to continue?</p>
            </div>
            <div className="flex border-t border-slate-100 bg-slate-50/50 relative">
              <button
                onClick={() => setPendingProviderSwitch(null)}
                className="flex-1 py-4 text-[10px] font-bold text-slate-500 hover:bg-slate-100 hover:text-slate-900 transition-colors uppercase tracking-widest"
              >
                Cancel
              </button>
              <div className="w-px bg-slate-200 absolute left-1/2 top-0 bottom-0"></div>
              <button
                onClick={() => executeProviderSwitch(pendingProviderSwitch)}
                className="flex-1 py-4 text-[10px] font-bold text-rose-600 hover:bg-rose-50 transition-colors uppercase tracking-widest"
              >
                Continue
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default OnboardingWizard;
