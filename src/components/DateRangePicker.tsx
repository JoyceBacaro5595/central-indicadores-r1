import { useState } from 'react';
import { Calendar } from 'lucide-react';

interface DateRangePickerProps {
  startDate: string;
  endDate: string;
  onChange: (start: string, end: string) => void;
}

export function DateRangePicker({ startDate, endDate, onChange }: DateRangePickerProps) {
  const [start, setStart] = useState(startDate);
  const [end, setEnd] = useState(endDate);

  const handleApply = () => {
    onChange(start, end);
  };

  const presets = [
    { label: 'Ontem', days: -1 },
    { label: 'Hoje', days: 1 },
    { label: '7D', days: 7 },
  ];

  const applyPreset = (days: number) => {
    const endD = new Date();
    const startD = new Date();
    if (days === -1) {
      // Ontem: apenas o dia anterior
      startD.setDate(startD.getDate() - 1);
      endD.setDate(endD.getDate() - 1);
    } else if (days > 1) {
      startD.setDate(startD.getDate() - days);
    }
    const s = startD.toISOString().slice(0, 10);
    const e = endD.toISOString().slice(0, 10);
    setStart(s);
    setEnd(e);
    onChange(s, e);
  };

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-2 surface px-3 py-1.5 rounded-lg">
          <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
          <input
            type="date"
            value={start}
            onChange={(e) => setStart(e.target.value)}
            className="bg-transparent text-xs font-medium text-foreground mono outline-none border-none"
          />
          <span className="text-muted-foreground text-[10px] px-1">→</span>
          <input
            type="date"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
            className="bg-transparent text-xs font-medium text-foreground mono outline-none border-none"
          />
        </div>
        <button
          onClick={handleApply}
          className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-[11px] font-semibold hover:opacity-90 transition-opacity shadow-sm"
        >
          Aplicar
        </button>
      </div>
      <div className="flex gap-1 bg-secondary/50 p-1 rounded-lg">
        {presets.map(p => (
          <button
            key={p.days}
            onClick={() => applyPreset(p.days)}
            className="px-3 py-1.5 rounded-md text-[11px] font-semibold text-muted-foreground hover:text-foreground hover:bg-card transition-all duration-150"
          >
            {p.label}
          </button>
        ))}
      </div>
    </div>
  );
}
