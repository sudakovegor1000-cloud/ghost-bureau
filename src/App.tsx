import { useEffect, useMemo, useRef, useState } from 'react';
import { AssignmentTab, defaultFilter, type Filter } from './components/AssignmentTab';
import { AutoRunProgress, AutoRunResult, type AutoRunSummary } from './components/AutoRun';
import { GhostForm, PlaceForm } from './components/Forms';
import { PlacesTab } from './components/PlacesTab';
import { ReportTab } from './components/ReportTab';
import { DatePicker95 } from './components/DatePicker95';
import { GhostAvatar } from './components/GhostAvatar';
import { ConfirmDialog, type ConfirmRequest } from './components/ui';
import { WorklogTab } from './components/WorklogTab';
import { SCENARIOS } from './data/demo';
import { formatDate, isIsoDate } from './engine/dates';
import { assignAll } from './engine/match';
import { buildReport } from './engine/report';
import type { Ghost, Place } from './engine/types';
import { useBureau } from './store';

type Tab = 'assign' | 'places' | 'report' | 'worklog';
const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'assign', label: 'Распределение', icon: '👻' },
  { id: 'places', label: 'Места', icon: '🏚️' },
  { id: 'report', label: 'Отчёт', icon: '📜' },
  { id: 'worklog', label: 'AI Worklog', icon: '🤖' },
];

const readPref = (key: string, fallback: string) => {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
};
const writePref = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
};

const tabFromHash = (): Tab => {
  const h = location.hash.slice(1);
  return TABS.some((t) => t.id === h) ? (h as Tab) : 'assign';
};

type Editing =
  | { kind: 'ghost'; ghost?: Ghost }
  | { kind: 'place'; place?: Place }
  | null;

export default function App() {
  const b = useBureau();
  const { data } = b;
  const [tab, setTab] = useState<Tab>(tabFromHash);
  const [editing, setEditing] = useState<Editing>(null);
  const [possessed, setPossessed] = useState(() => readPref('ghost-bureau:poltergeist', 'on') === 'on');
  const [startOpen, setStartOpen] = useState(false);
  const [confirmReq, setConfirmReq] = useState<ConfirmRequest | null>(null);
  const [introOpen, setIntroOpen] = useState(() => readPref('ghost-bureau:intro', 'open') === 'open');
  const fileRef = useRef<HTMLInputElement>(null);

  const result = useMemo(() => assignAll(data), [data]);
  const report = useMemo(() => buildReport(data, result), [data, result]);
  const [filter, setFilter] = useState<Filter>(() => defaultFilter(result));
  const [autoRunNames, setAutoRunNames] = useState<string[] | null>(null);
  const [autoRunSummary, setAutoRunSummary] = useState<AutoRunSummary | null>(null);

  // Новый сценарий — начинаем со списка, где оператор нужнее всего
  useEffect(() => {
    setFilter(defaultFilter(result));
  }, [b.scenario]); // только при смене сценария, а не на каждое изменение данных

  const startAutoRun = () => {
    const names = result.order.filter((id) => result.assignments[id].mode === 'pending').map((id) => data.ghosts.find((g) => g.id === id)!.name);
    setAutoRunNames(names);
  };
  const finishAutoRun = () => {
    const newIds = result.order.filter((id) => result.assignments[id].mode === 'pending');
    const after = assignAll({ ...data, processed: data.ghosts.map((g) => g.id) });
    const needDecision = Object.values(after.assignments).filter((a) => a.unassignedReason).length;
    b.runAuto();
    setAutoRunNames(null);
    const displaced = result.order
      .filter((id) => result.assignments[id].mode === 'auto' && !after.assignments[id].placeId)
      .map((id) => data.ghosts.find((g) => g.id === id)!.name);
    setAutoRunSummary({
      total: newIds.length,
      settled: newIds.filter((id) => after.assignments[id].placeId).length,
      needDecision,
      displaced,
    });
    setFilter(needDecision > 0 ? 'unsettled' : 'settled');
  };

  useEffect(() => {
    const onHash = () => setTab(tabFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  useEffect(() => {
    document.body.classList.toggle('possessed', possessed);
    writePref('ghost-bureau:poltergeist', possessed ? 'on' : 'off');
  }, [possessed]);
  useEffect(() => {
    if (!startOpen) return;
    const close = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest('.start-wrap')) setStartOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setStartOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [startOpen]);

  const haunt = (text: string) => b.setNotice({ kind: 'info', title: text, lines: [] });

  const go = (t: Tab) => {
    setTab(t);
    history.replaceState(null, '', `#${t}`);
  };

  const closeIntro = () => {
    setIntroOpen(false);
    writePref('ghost-bureau:intro', 'closed');
  };

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ghost-bureau-${data.today}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importFile = async (file: File) => {
    try {
      b.importJson(await file.text(), `файл «${file.name}»`);
    } catch {
      b.setNotice({ kind: 'error', title: 'Не удалось прочитать файл', lines: ['Попробуйте другой файл.'] });
    }
  };

  const confirmDeleteGhost = (g: Ghost) =>
    setConfirmReq({
      title: 'Удаление заявки',
      message: `Удалить заявку «${g.name}»?`,
      detail: 'Привидение исчезнет из бюро вместе с ручным решением по нему. Отменить удаление нельзя.',
      confirmLabel: 'Удалить',
      icon: <GhostAvatar ghost={g} size={40} />,
      onConfirm: () => b.deleteGhost(g.id),
    });
  const confirmRejectGhost = (g: Ghost) =>
    setConfirmReq({
      title: 'Отклонение заявки',
      message: `Отклонить заявку «${g.name}»?`,
      detail: 'Дедлайн уже прошёл, и бюро не будет её обрабатывать. Заявка уйдёт из бюро, отменить это нельзя.',
      confirmLabel: 'Отклонить',
      icon: <GhostAvatar ghost={g} size={40} expired />,
      onConfirm: () => b.deleteGhost(g.id),
    });
  /**
   * Ручной выбор места. Если место заполнено — спрашиваем подтверждение и селим сверх вместимости:
   * нынешних жильцов не выселяем, место честно становится переполненным.
   */
  const requestOverride = (ghostId: string, placeId: string | null) => {
    const place = placeId ? data.places.find((p) => p.id === placeId) : undefined;
    if (!placeId || !place) return b.setOverride(ghostId, placeId);
    const others = (result.occupancy[placeId] ?? []).filter((id) => id !== ghostId);
    if (others.length < place.capacity) return b.setOverride(ghostId, placeId);
    const ghost = data.ghosts.find((g) => g.id === ghostId)!;
    const detail =
      place.capacity === 0
        ? 'Место закрыто — поселить сюда можно только сверх вместимости.'
        : `Место станет переполненным: ${others.length + 1} при вместимости ${place.capacity}. Нынешние жильцы останутся на своих местах.`;
    setConfirmReq({
      title: 'Место заполнено',
      message: `Место «${place.name}» заполнено (${others.length}/${place.capacity}). Всё равно поселить сюда «${ghost.name}»?`,
      detail,
      confirmLabel: 'Поселить сверх мест',
      onConfirm: () => b.setOverride(ghostId, placeId, true),
    });
  };

  return (
    <div className="desktop">
      <div className="window app">
        <div className="titlebar">
          <span className="titlebar-text">
            <span aria-hidden>👻</span> GHOSTBUR.EXE — Бюро переселения привидений
          </span>
          <span className="titlebar-buttons">
            <button aria-label="Свернуть" onClick={() => haunt('Окно не сворачивается. Оно за вами наблюдает.')}>
              _
            </button>
            <button aria-label="Развернуть" onClick={() => haunt('Развернуть сильнее нельзя: дальше только потусторонний мир.')}>
              □
            </button>
            <button aria-label="Закрыть" onClick={() => haunt('Закрыть бюро невозможно: остались неупокоенные души.')}>
              ✕
            </button>
          </span>
        </div>

        <div className="window-body">
          <header className="top">
            <div className="brand">
              <h1 className="title">Бюро переселения привидений</h1>
              <p className="subtitle">Пульт оператора · смена {formatDate(data.today)}</p>
            </div>
            <div className="toolbar top-controls">
              <label className="mini-field">
                <span>Дата бюро:</span>
                <DatePicker95 value={data.today} onChange={(d) => isIsoDate(d) && b.setToday(d)} label="Дата бюро" />
              </label>
              <label className="mini-field">
                <span>Сценарий проверки:</span>
                <select value={b.scenario ?? ''} onChange={(e) => e.target.value && b.loadScenario(e.target.value)}>
                  <option value="" disabled>
                    — свои данные —
                  </option>
                  {SCENARIOS.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.title}
                    </option>
                  ))}
                </select>
              </label>
              <div className="row-actions">
                <button className="btn btn-small" onClick={exportJson} title="Скачать данные бюро в JSON">
                  💾 Экспорт
                </button>
                <button className="btn btn-small" onClick={() => fileRef.current?.click()} title="Загрузить данные из JSON">
                  📂 Импорт
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  accept="application/json,.json"
                  hidden
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void importFile(f);
                    e.target.value = '';
                  }}
                />
                <label className="check" title="Призраки на рабочем столе и дрожь тревожных привидений">
                  <input type="checkbox" checked={possessed} onChange={(e) => setPossessed(e.target.checked)} />
                  Полтергейст
                </label>
              </div>
            </div>
          </header>

          <p className="session-note" role="note">
            <span className="session-note-icon" aria-hidden>
              i
            </span>
            <span>
              Это демо-сессия: <b>при обновлении страницы начинается новая</b>, изменения не сохраняются. Чтобы сохранить
              работу — «💾 Экспорт», вернуть — «📂 Импорт».
            </span>
          </p>

      {introOpen ? (
        <div className="intro panel">
          <div>
            <b>Как пользоваться за минуту.</b>
            <ol>
              <li>
                Пришли новые заявки. Нажмите <b>«Расселить автоматически»</b> — бюро подберёт места всем, кому сможет.
              </li>
              <li>
                Кого расселить не удалось, бюро покажет в списке <b>«Требуют решения»</b> с причиной и подсказкой. Выберите им
                место вручную — система предупредит, если выбор плохой.
              </li>
              <li>
                Итоги — во вкладке <b>Отчёт</b>. Готовые проверки (пусто, конфликты, битый файл) — в «Сценарий проверки».
              </li>
            </ol>
          </div>
          <button className="btn btn-small" onClick={closeIntro} aria-label="Скрыть подсказку">
            Понятно
          </button>
        </div>
      ) : null}

      {b.notice && (
        <div className={`alert ${b.notice.kind === 'error' ? 'alert-bad' : 'alert-info'} notice`} role="alert">
          <div>
            <strong>{b.notice.title}</strong>
            {b.notice.lines.length > 0 && (
              <ul>
                {b.notice.lines.map((l, i) => (
                  <li key={`${i}-${l}`}>{l}</li>
                ))}
              </ul>
            )}
          </div>
          <button className="btn btn-small" onClick={() => b.setNotice(null)} aria-label="Закрыть сообщение">
            ✕
          </button>
        </div>
      )}

      <nav className="tabs" role="tablist">
        {TABS.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} className={`tab ${tab === t.id ? 'tab-active' : ''}`} onClick={() => go(t.id)}>
            <span aria-hidden>{t.icon}</span> {t.label}
            {t.id === 'assign' && report.pending + report.unsettled > 0 && (
              <span
                className="badge"
                title={[
                  report.pending ? `новых заявок: ${report.pending}` : '',
                  report.unsettled ? `требуют решения: ${report.unsettled}` : '',
                ]
                  .filter(Boolean)
                  .join(', ')}
              >
                {report.pending + report.unsettled}
              </span>
            )}
            {t.id === 'places' && report.places.some((p) => p.status === 'overloaded') && <span className="badge">!</span>}
          </button>
        ))}
      </nav>

      <main>
        {tab === 'assign' && (
          <AssignmentTab
            data={data}
            result={result}
            onAdd={() => setEditing({ kind: 'ghost' })}
            onEdit={(ghost) => setEditing({ kind: 'ghost', ghost })}
            onDelete={confirmDeleteGhost}
            onOverride={requestOverride}
            onResetOverrides={b.resetOverrides}
            onLoadDemo={() => b.loadScenario('demo')}
            onOpenPlaces={() => go('places')}
            onReject={confirmRejectGhost}
            onRunAuto={startAutoRun}
            filter={filter}
            onFilter={setFilter}
          />
        )}
        {tab === 'places' && (
          <PlacesTab
            data={data}
            result={result}
            onAdd={() => setEditing({ kind: 'place' })}
            onEdit={(place) => setEditing({ kind: 'place', place })}
          />
        )}
        {tab === 'report' && <ReportTab data={data} report={report} result={result} />}
        {tab === 'worklog' && <WorklogTab />}
      </main>

        </div>

        <div className="statusbar">
          <span>Заявок: {report.total}</span>
          <span>Расселено: {report.settled}</span>
          {report.pending > 0 && <span>Новые: {report.pending}</span>}
          <span>Требуют решения: {report.unsettled}</span>
          <span className="statusbar-wide">Обновление страницы — чистое демо. Сохранить работу: «Экспорт»</span>
        </div>
      </div>

      <div className="taskbar">
        <div className="start-wrap">
          <button className={`btn start-btn ${startOpen ? 'pressed' : ''}`} onClick={() => setStartOpen(!startOpen)} aria-expanded={startOpen}>
            <span aria-hidden>☠️</span> Пуск
          </button>
          {startOpen && (
            <div className="start-menu" role="menu">
              <div className="start-side" aria-hidden>
                Ghosts<b>95</b>
              </div>
              <ul>
                {TABS.map((t) => (
                  <li key={t.id}>
                    <button
                      role="menuitem"
                      onClick={() => {
                        go(t.id);
                        setStartOpen(false);
                      }}
                    >
                      <span aria-hidden>{t.icon}</span> {t.label}
                    </button>
                  </li>
                ))}
                <li className="sep" role="separator" />
                {SCENARIOS.map((sc) => (
                  <li key={sc.id}>
                    <button
                      role="menuitem"
                      onClick={() => {
                        b.loadScenario(sc.id);
                        setStartOpen(false);
                      }}
                    >
                      <span aria-hidden>📁</span> {sc.title}
                    </button>
                  </li>
                ))}
                <li className="sep" role="separator" />
                <li>
                  <button
                    role="menuitem"
                    onClick={() => {
                      setStartOpen(false);
                      haunt('Завершение работы отменено: в бюро ещё бродят души без места.');
                    }}
                  >
                    <span aria-hidden>⏻</span> Завершение работы…
                  </button>
                </li>
              </ul>
            </div>
          )}
        </div>
        <span className="task">
          <span aria-hidden>👻</span> Бюро переселения
        </span>
        <span className="tray">{formatDate(data.today)}</span>
      </div>

      {editing?.kind === 'ghost' && (
        <GhostForm initial={editing.ghost} today={data.today} onSave={b.upsertGhost} onClose={() => setEditing(null)} />
      )}
      {autoRunNames && <AutoRunProgress names={autoRunNames} onDone={finishAutoRun} />}
      {autoRunSummary && <AutoRunResult summary={autoRunSummary} onClose={() => setAutoRunSummary(null)} />}
      {confirmReq && <ConfirmDialog req={confirmReq} onClose={() => setConfirmReq(null)} />}
      {editing?.kind === 'place' && (
        <PlaceForm initial={editing.place} onSave={b.upsertPlace} onClose={() => setEditing(null)} />
      )}
    </div>
  );
}
