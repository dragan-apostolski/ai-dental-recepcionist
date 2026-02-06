
import React from 'react';
import { Calendar as CalendarIcon, Clock, User, CheckCircle2, Lock } from 'lucide-react';
import { DayAvailability, BookingSlot } from '../types';
import { translations } from '../i18n';

interface BookingCalendarProps {
  schedule: DayAvailability[];
  uiLanguage: 'mk' | 'en' | 'sl';
}

const BookingCalendar: React.FC<BookingCalendarProps> = ({ schedule, uiLanguage }) => {
  const [selectedDayIndex, setSelectedDayIndex] = React.useState(0);
  const t = translations[uiLanguage];
  const locale = uiLanguage === 'mk' ? 'mk-MK' : uiLanguage === 'sl' ? 'sl-SI' : 'en-US';

  React.useEffect(() => {
    if (selectedDayIndex >= schedule.length && schedule.length > 0) {
      setSelectedDayIndex(0);
    }
  }, [schedule, selectedDayIndex]);

  const currentDay = schedule[selectedDayIndex];

  const getHourlyBlocks = (slots: BookingSlot[]) => {
    const blocks: BookingSlot[] = [];
    const startHour = 8;
    const endHour = 18;

    const now = new Date();
    // Parse YYYY-MM-DD as local date components to avoid UTC offset issues
    // currentDay.date is YYYY-MM-DD
    const [y, m, d] = currentDay.date.split('-').map(Number);
    const dayDate = new Date(y, m - 1, d);
    const isToday = dayDate.toDateString() === now.toDateString();
    const currentHour = now.getHours();

    for (let h = startHour; h <= endHour; h++) {
      const hourLabel = h.toString().padStart(2, '0') + ':00';
      const slotsInHour = slots.filter(s => {
        const [slotH] = s.time.split(':');
        return parseInt(slotH, 10) === h;
      });

      const bookedInHour = slotsInHour.filter(s => !s.available && s.bookedBy);
      const availableInHour = slotsInHour.filter(s => s.available);
      const isPastHour = isToday && h < currentHour;

      if (bookedInHour.length > 0) {
        bookedInHour.forEach(b => blocks.push(b));
      } else if (availableInHour.length > 0 && !isPastHour) {
        blocks.push({
          time: hourLabel,
          isoTime: availableInHour[0].isoTime,
          available: true
        });
      } else {
        blocks.push({ time: hourLabel, isoTime: '', available: false });
      }
    }
    return blocks;
  };

  const displaySlots = currentDay ? getHourlyBlocks(currentDay.slots) : [];

  return (
    <div className="bg-white rounded-[2.5rem] shadow-[0_20px_50px_rgba(0,0,0,0.05)] border border-slate-100 overflow-hidden flex flex-col h-full">
      <div className="p-8 bg-slate-900 text-white flex justify-between items-center relative overflow-hidden">
        <div className="absolute top-0 right-0 w-32 h-32 bg-teal-500/10 blur-[60px] rounded-full -mr-16 -mt-16" />
        <div className="relative z-10">
          <h2 className="text-2xl font-bold tracking-tight uppercase italic">{t.workingHours}</h2>
          <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mt-1 opacity-70">{t.calendarSub}</p>
        </div>
        <div className="bg-teal-500/20 p-3 rounded-2xl relative z-10">
          <CalendarIcon size={24} className="text-teal-500" />
        </div>
      </div>

      <div className="flex-1 flex flex-col overflow-hidden">
        {schedule.length > 0 && (
          <div className="flex overflow-x-auto p-6 gap-3 bg-slate-50/50 border-b border-slate-100 no-scrollbar">
            {schedule.map((day, idx) => {
              const dateObj = new Date(day.date);
              const isSelected = selectedDayIndex === idx;
              return (
                <button
                  key={day.date}
                  onClick={() => setSelectedDayIndex(idx)}
                  className={`flex-shrink-0 w-16 h-20 rounded-2xl flex flex-col items-center justify-center transition-all ${isSelected
                    ? 'bg-teal-600 text-white shadow-xl shadow-teal-100 ring-2 ring-teal-600/20'
                    : 'bg-white text-slate-500 hover:bg-slate-100 border border-slate-100 hover:border-slate-200'
                    }`}
                >
                  <span className={`text-[9px] uppercase font-bold ${isSelected ? 'opacity-70' : 'opacity-40'}`}>
                    {dateObj.toLocaleDateString(locale, { weekday: 'short' })}
                  </span>
                  <span className="text-xl font-bold my-0.5">
                    {dateObj.getDate()}
                  </span>
                  <span className={`text-[9px] uppercase font-bold ${isSelected ? 'opacity-70' : 'opacity-40'}`}>
                    {dateObj.toLocaleDateString(locale, { month: 'short' })}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        <div className="flex-1 overflow-y-auto bg-white">
          {schedule.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-slate-300 space-y-4 p-12 text-center">
              <div className="bg-slate-50 p-6 rounded-full">
                <CheckCircle2 size={48} className="opacity-20" />
              </div>
              <div className="space-y-1">
                <p className="font-bold text-slate-400 uppercase tracking-widest text-xs">Calendar managed by AI</p>
                <p className="font-bold text-slate-300 uppercase tracking-widest text-[10px] opacity-70">Ask the agent to check availability</p>
              </div>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              <div className="px-8 py-5 text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] bg-slate-50/30">
                {new Date(currentDay.date).toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' })}
              </div>
              {displaySlots.map((slot, index) => {
                const isBooked = !!slot.bookedBy;
                const isAvailable = slot.available;

                return (
                  <div
                    key={`${currentDay.date}-${slot.time}-${index}`}
                    className={`flex items-center px-8 py-6 transition-all duration-300 ${isAvailable
                      ? 'bg-teal-50/40 hover:bg-teal-50/80 border-l-4 border-l-teal-500'
                      : isBooked
                        ? 'bg-slate-50/50 grayscale-[0.5]'
                        : 'bg-white opacity-50'
                      }`}
                  >
                    <div className="w-20 shrink-0">
                      <span className={`text-base font-bold tracking-tight ${isBooked ? 'text-slate-400' : 'text-slate-900'}`}>
                        {slot.time}
                      </span>
                    </div>
                    <div className="flex items-center gap-5 flex-1">
                      <div className={`w-2.5 h-2.5 rounded-full ${isAvailable ? 'bg-teal-500 shadow-[0_0_10px_rgba(20,184,166,0.5)] animate-pulse' : isBooked ? 'bg-amber-400' : 'bg-slate-200'}`} />
                      <div className="flex-1">
                        {isBooked ? (
                          <div className="flex flex-col gap-0.5">
                            <span className="text-sm font-bold text-slate-800 flex items-center gap-2">
                              <Lock size={12} className="text-amber-500" />
                              {slot.bookedBy}
                            </span>
                            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">
                              {slot.serviceTitle}
                            </span>
                          </div>
                        ) : (
                          <span className={`text-sm font-bold uppercase tracking-tight ${isAvailable ? 'text-teal-800' : 'text-slate-300 italic'}`}>
                            {isAvailable ? t.available : t.unavailable}
                          </span>
                        )}
                      </div>
                      {isAvailable && (
                        <div className="bg-white text-teal-700 px-4 py-1.5 rounded-full text-[10px] font-bold uppercase flex items-center gap-2 border border-teal-100 shadow-sm">
                          <CheckCircle2 size={12} className="text-teal-500" />
                          {t.open}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default BookingCalendar;
