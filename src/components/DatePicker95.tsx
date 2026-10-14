import { useEffect, useRef, useState } from 'react';
import { isIsoDate } from '../engine/dates';

/**
 * Выбор даты в духе «Свойств даты и времени» Windows 95.
 * Системный календарь браузера стилизовать нельзя, поэтому свой: месяц, год, сетка дней.
 */

const MONTHS = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

const pad = (n: number) => String(n).padStart(2, '0');
const toIso = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;
const daysIn = (y: number, m: number) => new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
/** 0 — понедельник */
const firstWeekday = (y: number, m: number) => (new Date(Date.UTC(y, m, 1)).getUTCDay() + 6) % 7;

function parts(iso: string) {
  const [y, m, d] = (isIsoDate(iso) ? iso : '2026-10-31').split('-').map(Number);
  return { y, m: m - 1, d };
}

export function DatePicker95({
  value,
  onChange,
  label,
  invalid,
}: {
  value: string;
  onChange: (iso: string) => void;
  label: string;
  invalid?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const cur = parts(value);
  const [view, setView] = useState({ y: cur.y, m: cur.m });
  const wrapRef = useRef<HTMLDivElement>(null);
  const fieldRef = useRef<HTMLButtonElement>(null);

  // При открытии — показываем месяц выбранной даты и фокусируем её день
  useEffect(() => {
    if (!open) return;
    setView({ y: cur.y, m: cur.m });
    const close = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setOpen(false);
        fieldRef.current?.focus();
      }
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc, true);
    requestAnimationFrame(() => {
      const root = wrapRef.current;
      (root?.querySelector<HTMLElement>('.cal-day.selected') ?? root?.querySelector<HTMLElement>('.cal-day'))?.focus();
    });
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', esc, true);
    };
  }, [open]); // cur намеренно не в зависимостях: сбрасываем вид только при открытии

  const shift = (delta: number) =>
    setView((v) => {
      const m = v.m + delta;
      return { y: v.y + Math.floor(m / 12), m: ((m % 12) + 12) % 12 };
    });

  const pick = (d: number) => {
    onChange(toIso(view.y, view.m, d));
    setOpen(false);
    fieldRef.current?.focus();
  };

  const blanks = firstWeekday(view.y, view.m);
  const total = daysIn(view.y, view.m);
  const years = Array.from({ length: 11 }, (_, i) => view.y - 5 + i);

  return (
    <div className="date95" ref={wrapRef}>
      <button
        type="button"
        ref={fieldRef}
        className={`date95-field ${invalid ? 'date95-invalid' : ''}`}
        onClick={() => setOpen(!open)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`${label}: ${isIsoDate(value) ? `${pad(cur.d)}.${pad(cur.m + 1)}.${cur.y}` : 'не выбрана'}`}
      >
        <span className="date95-value">{isIsoDate(value) ? `${pad(cur.d)}.${pad(cur.m + 1)}.${cur.y}` : '__.__.____'}</span>
        <span className="date95-arrow" aria-hidden>
          ▾
        </span>
      </button>

      {open && (
        <div className="date95-pop window" role="dialog" aria-label={label}>
          <div className="titlebar">
            <span className="titlebar-text">📅 {label}</span>
          </div>
          <div className="cal">
            <div className="cal-nav">
              <button type="button" className="btn btn-small" onClick={() => shift(-1)} aria-label="Предыдущий месяц">
                ◀
              </button>
              <select value={view.m} onChange={(e) => setView((v) => ({ ...v, m: Number(e.target.value) }))} aria-label="Месяц">
                {MONTHS.map((name, i) => (
                  <option key={name} value={i}>
                    {name}
                  </option>
                ))}
              </select>
              <select value={view.y} onChange={(e) => setView((v) => ({ ...v, y: Number(e.target.value) }))} aria-label="Год">
                {years.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
              <button type="button" className="btn btn-small" onClick={() => shift(1)} aria-label="Следующий месяц">
                ▶
              </button>
            </div>
            <div className="cal-grid" role="grid">
              {WEEKDAYS.map((w) => (
                <span key={w} className="cal-wd" role="columnheader">
                  {w}
                </span>
              ))}
              {Array.from({ length: blanks }, (_, i) => (
                <span key={`b${i}`} />
              ))}
              {Array.from({ length: total }, (_, i) => {
                const d = i + 1;
                const selected = view.y === cur.y && view.m === cur.m && d === cur.d && isIsoDate(value);
                return (
                  <button
                    type="button"
                    key={d}
                    className={`cal-day ${selected ? 'selected' : ''}`}
                    onClick={() => pick(d)}
                    aria-pressed={selected}
                    aria-label={`${d} ${MONTHS[view.m].toLowerCase()} ${view.y}`}
                  >
                    {d}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
