import { useEffect, useRef, type ReactNode } from 'react';

export function Modal({
  title,
  onClose,
  children,
  small,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  small?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && closeRef.current();
    document.addEventListener('keydown', onKey);
    const root = ref.current;
    (
      root?.querySelector<HTMLElement>('[data-autofocus]') ??
      root?.querySelector<HTMLElement>('.modal-body input, .modal-body select, .modal-body button')
    )?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, []);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal window ${small ? 'modal-small' : ''}`} role="dialog" aria-modal="true" aria-label={title} ref={ref}>
        <div className="titlebar">
          <h2 className="titlebar-text">{title}</h2>
          <span className="titlebar-buttons">
            <button onClick={onClose} aria-label="Закрыть">
              ✕
            </button>
          </span>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

export interface ConfirmRequest {
  title: string;
  message: string;
  detail?: string;
  confirmLabel: string;
  /** Иконка слева, как в окнах сообщений Win95; по умолчанию — жёлтый треугольник */
  icon?: ReactNode;
  onConfirm: () => void;
}

/** Подтверждение опасного действия в виде окна Win95. Фокус по умолчанию — на «Отмена» */
export function ConfirmDialog({ req, onClose }: { req: ConfirmRequest; onClose: () => void }) {
  return (
    <Modal title={req.title} onClose={onClose} small>
      <div className="msgbox">
        <div className="msgbox-icon" aria-hidden>
          {req.icon ?? <span className="msgbox-warn">!</span>}
        </div>
        <div>
          <p className="msgbox-text">{req.message}</p>
          {req.detail && <p className="msgbox-detail">{req.detail}</p>}
        </div>
      </div>
      <div className="msgbox-actions">
        <button
          className="btn btn-primary"
          onClick={() => {
            req.onConfirm();
            onClose();
          }}
        >
          {req.confirmLabel}
        </button>
        <button className="btn" onClick={onClose} data-autofocus>
          Отмена
        </button>
      </div>
    </Modal>
  );
}

export function Empty({ icon, title, children }: { icon: string; title: string; children?: ReactNode }) {
  return (
    <div className="empty panel">
      <div className="empty-icon" aria-hidden>
        {icon}
      </div>
      <h3>{title}</h3>
      {children}
    </div>
  );
}

export function Score({ value }: { value: number | null }) {
  if (value === null) return <span className="score score-none">—</span>;
  const tone = value >= 80 ? 'good' : value >= 60 ? 'mid' : 'bad';
  return (
    <span className={`score score-${tone}`} title="Балл совместимости из 100">
      {value}
    </span>
  );
}

export function Field({
  label,
  error,
  hint,
  children,
}: {
  label: string;
  error?: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className={`field ${error ? 'has-error' : ''}`}>
      <span className="field-label">{label}</span>
      {children}
      {error ? <span className="field-error">{error}</span> : hint ? <span className="field-hint">{hint}</span> : null}
    </label>
  );
}

export function Meter({ value, max, danger }: { value: number; max: number; danger?: boolean }) {
  const pct = max <= 0 ? (value > 0 ? 100 : 0) : Math.min(100, (value / max) * 100);
  return (
    <div className={`meter ${danger ? 'meter-danger' : ''}`} role="presentation">
      <div className="meter-fill" style={{ width: `${pct}%` }} />
    </div>
  );
}
