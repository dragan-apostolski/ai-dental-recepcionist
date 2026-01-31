
import React from 'react';
import { Phone, PhoneOff, Mic, MicOff, Terminal, Activity, Wifi } from 'lucide-react';
import Visualizer from './Visualizer';
import { Settings } from '../types';
import { translations } from '../i18n';

interface LogEntry {
  msg: string;
  type: 'info' | 'error';
  timestamp: number;
}

interface PhoneInterfaceProps {
  settings: Settings;
  isCalling: boolean;
  onToggleCall: () => void;
  isMuted: boolean;
  onToggleMute: () => void;
  isModelSpeaking: boolean;
  logs: LogEntry[];
}

const PhoneInterface: React.FC<PhoneInterfaceProps> = ({
  settings,
  isCalling,
  onToggleCall,
  isMuted,
  onToggleMute,
  isModelSpeaking,
  logs
}) => {
  const logEndRef = React.useRef<HTMLDivElement>(null);
  const t = translations[settings.uiLanguage];

  React.useEffect(() => {
    if (logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs]);

  const initials = settings.companyName ? settings.companyName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) : 'Z';

  return (
    <div className="bg-white rounded-[3.5rem] shadow-[0_35px_60px_-15px_rgba(0,0,0,0.3)] border-[12px] border-slate-900 overflow-hidden w-full max-w-[340px] aspect-[9/19] flex flex-col relative transition-all duration-500 hover:shadow-[0_45px_70px_-20px_rgba(13,148,136,0.15)] ring-1 ring-slate-900/5">
      {/* Notch */}
      <div className="bg-slate-900 h-7 w-36 mx-auto rounded-b-[1.5rem] absolute top-0 left-1/2 -translate-x-1/2 z-20 flex items-center justify-center gap-1.5 px-4">
        <div className="w-1.5 h-1.5 rounded-full bg-slate-800" />
        <div className="flex-1 h-1 bg-slate-800 rounded-full" />
      </div>

      {/* Status Bar */}
      <div className="pt-8 px-8 flex justify-between items-center text-[10px] font-bold text-slate-400 select-none">
        <span>{new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}</span>
        <div className="flex items-center gap-1.5">
          <Wifi size={10} />
          <div className="w-4 h-2 border border-slate-300 rounded-[1px] relative">
            <div className="absolute inset-px bg-teal-500 rounded-[0.5px] w-2/3" />
          </div>
        </div>
      </div>

      {/* Header Info */}
      <div className="pt-4 px-6 pb-2 text-center">
        <div className="relative inline-block mb-3">
          <div className="w-14 h-14 bg-gradient-to-br from-teal-500 to-teal-700 text-white rounded-2xl mx-auto flex items-center justify-center font-black text-xl shadow-xl transform hover:rotate-3 transition-transform">
            {settings.logoUrl ? <img src={settings.logoUrl} className="w-full h-full object-cover rounded-2xl" alt="logo" /> : initials}
          </div>
          {isCalling && (
            <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-teal-500 border-2 border-white rounded-full animate-pulse shadow-lg" />
          )}
        </div>
        <h2 className="text-xl font-black text-slate-800 line-clamp-1 tracking-tight">{settings.companyName || 'Clinic'}</h2>
        <div className="flex items-center justify-center gap-1.5 mt-1">
          <span className={`w-1.5 h-1.5 rounded-full ${isCalling ? 'bg-teal-500 animate-pulse' : 'bg-slate-300'}`} />
          <p className="text-[9px] text-slate-400 uppercase font-black tracking-[0.2em]">
            {isCalling ? t.active : t.ready}
          </p>
        </div>
      </div>

      {/* Screen Content */}
      <div className="flex-1 flex flex-col px-5 pb-5 overflow-hidden">
        {/* Visualizer Area */}
        <div className="h-28 flex items-center justify-center">
            <Visualizer isActive={isCalling} isModelSpeaking={isModelSpeaking} />
        </div>

        {/* Dark Transcript Box */}
        <div className="flex-1 bg-slate-950 rounded-[2.5rem] p-5 overflow-hidden flex flex-col shadow-[inset_0_2px_10px_rgba(0,0,0,0.5)] border border-white/5">
          <div className="flex items-center justify-between mb-4 text-slate-500 border-b border-white/5 pb-3">
            <div className="flex items-center gap-2">
              <div className="bg-teal-500/10 p-1.5 rounded-lg">
                <Terminal size={12} className="text-teal-500" />
              </div>
              <span className="text-[9px] uppercase font-black tracking-[0.15em]">{t.logs}</span>
            </div>
            {isCalling && (
              <div className="flex items-center gap-1.5">
                <span className="text-[8px] font-black text-teal-500/40 animate-pulse">LIVE PROTOCOL</span>
              </div>
            )}
          </div>

          <div className="flex-1 overflow-y-auto space-y-4 no-scrollbar font-mono text-[10px] leading-relaxed">
            {logs.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-800/40 gap-3">
                <div className="relative">
                    <Activity size={32} className="animate-pulse" />
                    <div className="absolute inset-0 bg-teal-500/10 blur-xl rounded-full" />
                </div>
                <span className="text-[8px] font-black tracking-[0.3em] uppercase opacity-50">No activity detected</span>
              </div>
            ) : (
              logs.map((log, idx) => (
                <div key={`${log.timestamp}-${idx}`} className="flex gap-3 animate-in fade-in slide-in-from-left-2 duration-300">
                  <span className="text-slate-700 shrink-0 font-bold opacity-30 tabular-nums">
                    {new Date(log.timestamp).toLocaleTimeString([], { hour12: false, minute: '2-digit', second: '2-digit' })}
                  </span>
                  <div className="flex-1">
                    <span className={`${log.type === 'error' ? 'text-rose-400' : 'text-teal-400/90'} font-medium`}>
                      <span className="opacity-40 mr-1.5">›</span>
                      {log.msg}
                    </span>
                  </div>
                </div>
              ))
            )}
            <div ref={logEndRef} />
          </div>
        </div>
      </div>

      {/* Control Bar */}
      <div className="p-8 bg-white border-t border-slate-50 relative">
        <div className="flex justify-center items-center gap-8">
          <button 
            onClick={onToggleMute}
            disabled={!isCalling}
            className={`p-4 rounded-2xl transition-all shadow-sm ${
              isMuted ? 'bg-rose-50 text-rose-600 ring-1 ring-rose-100' : 'bg-slate-50 text-slate-400 hover:bg-slate-100 hover:text-slate-600 ring-1 ring-slate-100/50'
            } disabled:opacity-20`}
          >
            {isMuted ? <MicOff size={22} /> : <Mic size={22} />}
          </button>
          <button 
            onClick={onToggleCall}
            className={`p-7 rounded-[2.5rem] transition-all relative ${
              isCalling 
                ? 'bg-gradient-to-br from-rose-500 to-rose-600 text-white shadow-rose-200' 
                : 'bg-gradient-to-br from-teal-500 to-teal-600 text-white shadow-teal-200 pulse-active'
            } shadow-2xl hover:scale-105 active:scale-95 group overflow-hidden`}
          >
            <div className="absolute inset-0 bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity" />
            {isCalling ? <PhoneOff size={32} /> : <Phone size={32} />}
          </button>
        </div>
      </div>
    </div>
  );
};

export default PhoneInterface;
