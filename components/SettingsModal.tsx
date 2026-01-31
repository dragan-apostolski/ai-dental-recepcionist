
import React, { useState, useEffect } from 'react';
import { X, Key, Calendar, Save, RefreshCw, Check } from 'lucide-react';
import { Settings, CalendlyEvent } from '../types';
import { getEventTypes } from '../services/calendlyService';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentSettings: Settings;
  onSave: (settings: Settings) => void;
}

const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose, currentSettings, onSave }) => {
  const [apiKey, setApiKey] = useState(currentSettings.calendlyToken);
  const [eventTypes, setEventTypes] = useState<CalendlyEvent[]>(currentSettings.eventTypes);
  const [selectedIds, setSelectedIds] = useState<string[]>(currentSettings.selectedEventTypeIds || []);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    setApiKey(currentSettings.calendlyToken);
    setEventTypes(currentSettings.eventTypes);
    setSelectedIds(currentSettings.selectedEventTypeIds || []);
  }, [currentSettings, isOpen]);

  const fetchEvents = async () => {
    if (!apiKey) return;
    setIsLoading(true);
    const events = await getEventTypes(apiKey);
    setEventTypes(events);
    setIsLoading(false);
  };

  const toggleId = (uri: string) => {
    setSelectedIds(prev =>
      prev.includes(uri)
        ? prev.filter(i => i !== uri)
        : [...prev, uri]
    );
  };

  const handleSave = () => {
    onSave({
      ...currentSettings,
      calendlyToken: apiKey,
      eventTypes,
      selectedEventTypeIds: selectedIds
    });
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col max-h-[90vh]">
        <div className="p-6 border-b border-slate-200 flex justify-between items-center bg-white sticky top-0 z-10">
          <h2 className="text-xl font-bold text-slate-800">Поставки за Календар</h2>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-6 overflow-y-auto flex-1 no-scrollbar">
          <div className="space-y-2">
            <label className="text-sm font-semibold text-slate-700 flex items-center gap-2">
              <Key size={16} /> Calendly Token
            </label>
            <div className="flex gap-2">
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="Calendly Personal Access Token"
                className="flex-1 p-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none transition-all text-sm"
              />
              <button
                onClick={fetchEvents}
                disabled={isLoading}
                className="p-3 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors disabled:opacity-50"
              >
                <RefreshCw size={20} className={isLoading ? 'animate-spin' : ''} />
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-semibold text-slate-700 flex items-center gap-2">
              <Calendar size={16} /> Избери Типови на Настани
            </label>
            {eventTypes.length === 0 ? (
              <div className="p-4 border border-dashed border-slate-300 rounded-xl text-center text-slate-400 text-sm">
                Внесете API клуч и освежете за да ги видите вашите настани.
              </div>
            ) : (
              <div className="space-y-2">
                {eventTypes.map((event) => {
                  const isSelected = selectedIds.includes(event.uri);
                  return (
                    <button
                      key={event.id}
                      onClick={() => toggleId(event.uri)}
                      className={`w-full p-4 border rounded-xl text-left transition-all flex justify-between items-center ${isSelected
                        ? 'bg-teal-50 border-teal-500 ring-1 ring-teal-500'
                        : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                        }`}
                    >
                      <div>
                        <p className="font-bold text-slate-800 text-sm">{event.title}</p>
                      </div>
                      {isSelected && (
                        <div className="bg-teal-600 text-white p-1 rounded-full">
                          <Check size={14} />
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className="p-6 bg-slate-50 border-t border-slate-200">
          <button
            onClick={handleSave}
            className="w-full bg-teal-600 hover:bg-teal-700 text-white font-bold py-3 rounded-xl shadow-lg flex items-center justify-center gap-2 transition-all transform active:scale-95"
          >
            <Save size={20} /> Зачувај Поставки
          </button>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;
