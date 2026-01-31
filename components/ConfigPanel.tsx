
import React from 'react';
import { Settings, Service, WorkingHour, CalendlyEvent } from '../types';
import {
  Building2, UserCircle, Save, RefreshCw, Calendar, Check, X,
  MapPin, Phone, Trash2, Plus, Clock, Users, Info, Link2, Copy, Globe
} from 'lucide-react';
import { getEventTypes } from '../services/calendlyService';
import { translations } from '../i18n';

interface ConfigPanelProps {
  settings: Settings;
  onUpdate: (newSettings: Settings) => void;
  onSave: (settings: Settings) => void;
  onClose: () => void;
}

const ConfigPanel: React.FC<ConfigPanelProps> = ({ settings, onUpdate, onSave, onClose }) => {
  const [isFetchingEvents, setIsFetchingEvents] = React.useState(false);
  const t = translations[settings.uiLanguage];

  const handleChange = (field: keyof Settings, value: any) => {
    onUpdate({ ...settings, [field]: value });
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
    const updatedServices = [...settings.services, newService];
    handleChange('services', updatedServices);
    if (!settings.selectedEventTypeIds.includes(calEvent.uri)) {
      handleChange('selectedEventTypeIds', [...settings.selectedEventTypeIds, calEvent.uri]);
    }
  };

  const removeService = (id: string, eventTypeUri: string) => {
    const filteredServices = settings.services.filter(s => s.id !== id);
    handleChange('services', filteredServices);
    if (!filteredServices.some(s => s.calendlyEventTypeUri === eventTypeUri)) {
      handleChange('selectedEventTypeIds', settings.selectedEventTypeIds.filter(uri => uri !== eventTypeUri));
    }
  };

  const updateService = (id: string, field: keyof Service, value: string) => {
    const updated = settings.services.map(s => s.id === id ? { ...s, [field]: value } : s);
    handleChange('services', updated);
  };

  const updateHours = (day: string, field: keyof WorkingHour, value: any) => {
    const updated = settings.workingHours.map(h => h.day === day ? { ...h, [field]: value } : h);
    handleChange('workingHours', updated);
  };

  const applyBulkHours = (target: 'weekdays' | 'all') => {
    const open = (document.getElementById('conf-bulk-open') as HTMLInputElement).value;
    const close = (document.getElementById('conf-bulk-close') as HTMLInputElement).value;
    const updated = settings.workingHours.map(h => {
      const isWeekday = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'].includes(h.day);
      if (target === 'all' || (target === 'weekdays' && isWeekday)) {
        return { ...h, open, close, isClosed: false };
      }
      return h;
    });
    handleChange('workingHours', updated);
  };

  const fetchEvents = async () => {
    if (!settings.calendlyToken) return;
    setIsFetchingEvents(true);
    const events = await getEventTypes(settings.calendlyToken);
    handleChange('eventTypes', events);
    setIsFetchingEvents(false);
  };

  return (
    <div className="flex flex-col h-full bg-white overflow-hidden">
      <div className="p-6 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center sticky top-0 z-20">
        <div>
          <h2 className="text-lg font-black text-slate-900 flex items-center gap-2 italic uppercase">
            <Building2 className="text-teal-600" size={20} /> {t.config}
          </h2>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">{t.personaSub}</p>
        </div>
        <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-xl text-slate-400 transition-colors"><X size={20} /></button>
      </div>

      <div className="flex-1 overflow-y-auto no-scrollbar p-6 space-y-10">
        <section className="space-y-4">
          <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] border-l-2 border-teal-500 pl-3">{t.identity}</h3>
          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-[9px] font-black uppercase text-slate-400 ml-1">{t.languageUI}</label>
              <select value={settings.uiLanguage} onChange={(e) => handleChange('uiLanguage', e.target.value)} className="w-full p-3 bg-slate-50 border border-slate-100 rounded-xl text-xs font-bold outline-none">
                <option value="mk">Macedonian</option><option value="sl">Slovenian</option><option value="en">English</option>
              </select>
            </div>
            <input type="text" value={settings.companyName} onChange={(e) => handleChange('companyName', e.target.value)} className="w-full p-3 text-sm font-bold bg-slate-50 border border-slate-100 rounded-xl outline-none" placeholder={t.businessName} />
          </div>
        </section>

        <section className="space-y-4">
          <div className="flex justify-between items-center"><h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] border-l-2 border-teal-500 pl-3">{t.calendar}</h3><button onClick={fetchEvents} disabled={isFetchingEvents} className="text-[9px] text-teal-600 font-black uppercase flex items-center gap-1 hover:underline"><RefreshCw size={10} className={isFetchingEvents ? 'animate-spin' : ''} /> {t.sync}</button></div>
          <input type="password" value={settings.calendlyToken} onChange={(e) => handleChange('calendlyToken', e.target.value)} className="w-full p-3 text-sm font-bold bg-slate-50 border border-slate-100 rounded-xl outline-none" placeholder="Calendly Personal Access Token" />
        </section>

        <section className="space-y-4">
          <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] border-l-2 border-teal-500 pl-3">{t.services}</h3>
          <div className="space-y-3">
            {settings.services.map(s => (
              <div key={s.id} className="p-4 bg-slate-50 border border-slate-100 rounded-2xl space-y-3 shadow-sm">
                <div className="flex justify-between items-center border-b border-slate-100 pb-2">
                  <div className="flex items-center gap-2 text-[9px] font-black text-teal-600 uppercase"><Link2 size={10} /> {settings.eventTypes.find(e => e.uri === s.calendlyEventTypeUri)?.title || 'Event'}</div>
                  <button onClick={() => removeService(s.id, s.calendlyEventTypeUri)} className="text-rose-400 p-1"><Trash2 size={12} /></button>
                </div>
                <input value={s.name} onChange={(e) => updateService(s.id, 'name', e.target.value)} className="w-full bg-white border border-slate-100 p-2 rounded-lg text-xs font-bold outline-none" placeholder="Service Name" />
                <div className="flex gap-2">
                  <input value={s.price} onChange={(e) => updateService(s.id, 'price', e.target.value)} className="flex-1 bg-white border border-slate-100 p-2 rounded-lg text-xs font-bold outline-none text-teal-600" placeholder="Price" />
                  <input value={s.duration} onChange={(e) => updateService(s.id, 'duration', e.target.value)} className="flex-1 bg-white border border-slate-100 p-2 rounded-lg text-xs font-bold outline-none" placeholder="Duration" />
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="space-y-4">
          <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] border-l-2 border-teal-500 pl-3">{t.workingHours}</h3>
          <div className="p-3 bg-teal-50/50 rounded-xl space-y-2">
            <div className="flex gap-2"><input type="time" id="conf-bulk-open" defaultValue="09:00" className="flex-1 p-1 text-xs rounded border border-teal-100" /><input type="time" id="conf-bulk-close" defaultValue="17:00" className="flex-1 p-1 text-xs rounded border border-teal-100" /></div>
            <div className="flex gap-1"><button onClick={() => applyBulkHours('weekdays')} className="flex-1 text-[8px] font-black bg-teal-600 text-white py-1 rounded">{t.applyWeekdays}</button><button onClick={() => applyBulkHours('all')} className="flex-1 text-[8px] font-black bg-slate-900 text-white py-1 rounded">{t.applyAll}</button></div>
          </div>
          <div className="space-y-2">
            {settings.workingHours.map(h => (
              <div key={h.day} className="flex items-center justify-between text-[10px]">
                <span className="font-bold text-slate-500 w-16 uppercase">{h.day.slice(0, 3)}</span>
                <div className="flex items-center gap-1"><input type="time" value={h.open} disabled={h.isClosed} onChange={(e) => updateHours(h.day, 'open', e.target.value)} className="p-1 border border-slate-100 rounded" /><span>-</span><input type="time" value={h.close} disabled={h.isClosed} onChange={(e) => updateHours(h.day, 'close', e.target.value)} className="p-1 border border-slate-100 rounded" /></div>
                <button onClick={() => updateHours(h.day, 'isClosed', !h.isClosed)} className={`px-2 py-0.5 rounded font-black uppercase ${h.isClosed ? 'bg-rose-100 text-rose-600' : 'text-slate-300'}`}>{h.isClosed ? t.off : t.on}</button>
              </div>
            ))}
          </div>
        </section>

        <section className="space-y-4 pb-12">
          <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] border-l-2 border-teal-500 pl-3">{t.persona}</h3>
          <div className="space-y-3">
            <input value={settings.agentName} onChange={(e) => handleChange('agentName', e.target.value)} className="w-full p-3 text-sm font-bold bg-slate-50 border border-slate-100 rounded-xl outline-none" placeholder={t.agentName} />
            <div className="grid grid-cols-1 gap-2">
              <label className="text-[9px] font-black uppercase text-slate-400">{t.languageAgent}</label>
              <select value={settings.language} onChange={(e) => handleChange('language', e.target.value)} className="w-full p-3 bg-slate-50 border border-slate-100 rounded-xl text-xs font-bold">
                <option value="mk">Macedonian</option><option value="sl">Slovenian</option><option value="en">English</option>
              </select>
            </div>
          </div>
        </section>
      </div>

      <div className="p-6 bg-white border-t border-slate-100">
        <button onClick={() => onSave(settings)} className="w-full bg-slate-900 hover:bg-black text-white font-black py-4 rounded-2xl shadow-xl flex items-center justify-center gap-3 transition-all transform active:scale-95 uppercase text-xs tracking-[0.2em]"><Save size={18} /> {t.save}</button>
      </div>
    </div>
  );
};

export default ConfigPanel;
