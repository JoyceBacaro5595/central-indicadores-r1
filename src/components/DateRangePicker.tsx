import { FiltroPeriodo } from '@/components/shared';

interface DateRangePickerProps {
  startDate: string;
  endDate: string;
  onChange: (start: string, end: string) => void;
}

/** Período por dias no padrão da Central (o mesmo FiltroPeriodo das demais telas, com atalhos de Hoje, Ontem, 7 e 30 dias). */
export function DateRangePicker({ startDate, endDate, onChange }: DateRangePickerProps) {
  return <FiltroPeriodo modo="dia" de={startDate} ate={endDate} onChange={onChange} />;
}
