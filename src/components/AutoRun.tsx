import { useEffect, useRef, useState } from 'react';
import { Modal } from './ui';

/**
 * Окно «Распределение заявок…» в духе копирования файлов в Windows 95:
 * привидение перелетает из старого дома в новый, полоса прогресса заполняется по заявкам.
 * Само распределение мгновенное — анимация нужна, чтобы оператор увидел, что бюро что-то сделало.
 */
export function AutoRunProgress({ names, onDone }: { names: string[]; onDone: () => void }) {
  const [step, setStep] = useState(0);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  useEffect(() => {
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const delay = reduce ? 30 : Math.max(120, Math.min(300, 1800 / Math.max(1, names.length)));
    if (step >= names.length) {
      const t = setTimeout(() => doneRef.current(), reduce ? 0 : 350);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setStep((s) => s + 1), delay);
    return () => clearTimeout(t);
  }, [step, names.length]);

  const pct = names.length ? Math.round((step / names.length) * 100) : 100;
  const current = names[Math.min(step, names.length - 1)];

  return (
    <div className="modal-backdrop">
      <div className="modal window modal-small" role="dialog" aria-modal="true" aria-label="Распределение заявок" aria-busy="true">
        <div className="titlebar">
          <span className="titlebar-text">Распределение заявок…</span>
        </div>
        <div className="modal-body">
          <div className="haunt-anim" aria-hidden>
            <span>🏚️</span>
            <span className="haunt-ghost">👻</span>
            <span>🏰</span>
          </div>
          <p className="haunt-current" aria-live="polite">
            {step < names.length ? (
              <>
                Подбираю место: <b>{current}</b>
              </>
            ) : (
              <b>Готово</b>
            )}
          </p>
          <div className="meter">
            <div className="meter-fill" style={{ width: `${pct}%` }} />
          </div>
          <p className="muted haunt-count">
            {Math.min(step, names.length)} из {names.length}
          </p>
        </div>
      </div>
    </div>
  );
}

export interface AutoRunSummary {
  total: number;
  settled: number;
  needDecision: number;
  /** Ранее расселённые, которых вытеснили более срочные новые заявки */
  displaced: string[];
}

/** Итог распределения — окно сообщения Win95 */
export function AutoRunResult({ summary, onClose }: { summary: AutoRunSummary; onClose: () => void }) {
  const { total, settled, needDecision, displaced } = summary;
  return (
    <Modal title="Распределение завершено" onClose={onClose} small>
      <div className="msgbox">
        <div className="msgbox-icon" aria-hidden>
          <span className="msgbox-info">i</span>
        </div>
        <div>
          <p className="msgbox-text">
            Автоматически расселено {settled} из {total}.
          </p>
          <p className="msgbox-detail">
            {needDecision > 0
              ? `Заявок, которым нужно ваше решение: ${needDecision}. У каждой указана причина и что можно сделать.`
              : 'Все заявки получили место. Объяснения выбора — в списке «Расселены».'}
          </p>
          {displaced.length > 0 && (
            <p className="msgbox-detail">
              Более срочные новые заявки заняли места, и без места остались: <b>{displaced.join(', ')}</b>.
            </p>
          )}
        </div>
      </div>
      <div className="msgbox-actions">
        <button className="btn btn-primary" onClick={onClose} data-autofocus>
          {needDecision > 0 ? 'Перейти к ним' : 'OK'}
        </button>
      </div>
    </Modal>
  );
}
