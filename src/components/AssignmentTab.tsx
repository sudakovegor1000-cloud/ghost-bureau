import { useState, type CSSProperties } from 'react';
import { daysBetween, deadlineText, formatDate } from '../engine/dates';
import { plural, type Assignment, type MatchResult, type UnassignedReason } from '../engine/match';
import { REASON_LABELS } from '../engine/report';
import { CONDITIONS, CONDITION_IDS, RULES } from '../engine/rules';
import type { BureauData, Ghost, Place } from '../engine/types';
import { FilterBar, matches } from './FilterBar';
import { GhostAvatar } from './GhostAvatar';
import { Empty, Score } from './ui';

/** Заполненность места глазами конкретной заявки (она сама не считается) */
function seatsLabel(p: Place, others: number): string {
  if (p.capacity === 0) return 'закрыто';
  const free = p.capacity - others;
  return free > 0 ? `свободно ${free} из ${p.capacity}` : `мест нет, ${others}/${p.capacity}`;
}

export type Filter = 'pending' | 'unsettled' | 'settled' | 'all';

/** Порядок — путь оператора: новые → те, кому нужно решение → расселённые */
const FILTERS: { id: Filter; label: string; test: (a: Assignment) => boolean }[] = [
  { id: 'pending', label: 'Новые', test: (a) => a.mode === 'pending' },
  { id: 'unsettled', label: 'Требуют решения', test: (a) => !!a.unassignedReason },
  { id: 'settled', label: 'Расселены', test: (a) => a.placeId !== null },
  { id: 'all', label: 'Все', test: () => true },
];

/** С какого списка начинать: с того, где оператор нужнее всего */
export function defaultFilter(result: MatchResult): Filter {
  const all = Object.values(result.assignments);
  if (all.some((a) => a.mode === 'pending')) return 'pending';
  if (all.some((a) => a.unassignedReason)) return 'unsettled';
  return 'settled';
}

interface Props {
  data: BureauData;
  result: MatchResult;
  onAdd: () => void;
  onEdit: (g: Ghost) => void;
  onDelete: (g: Ghost) => void;
  onOverride: (ghostId: string, placeId: string | null) => void;
  onResetOverrides: () => void;
  onLoadDemo: () => void;
  onOpenPlaces: () => void;
  onReject: (g: Ghost) => void;
  onRunAuto: () => void;
  filter: Filter;
  onFilter: (f: Filter) => void;
}

export function AssignmentTab({
  data,
  result,
  onAdd,
  onEdit,
  onDelete,
  onOverride,
  onResetOverrides,
  onLoadDemo,
  onOpenPlaces,
  onReject,
  onRunAuto,
  filter: requestedFilter,
  onFilter: setFilter,
}: Props) {
  let filter = requestedFilter;
  const [query, setQuery] = useState('');
  const [condition, setCondition] = useState('');
  const count = (f: Filter) => result.order.filter((id) => FILTERS.find((x) => x.id === f)!.test(result.assignments[id])).length;
  const pendingCount = count('pending');
  const unsettledCount = count('unsettled');
  const placesById = new Map(data.places.map((p) => [p.id, p]));
  const ghostsById = new Map(data.ghosts.map((g) => [g.id, g]));
  const manualCount = Object.keys(data.overrides).length;

  if (data.ghosts.length === 0) {
    return (
      <Empty icon="🕯️" title="Заявок пока нет">
        <p>Ни одно привидение не просится переехать. Тишина… подозрительная.</p>
        <div className="row-actions">
          <button className="btn btn-primary" onClick={onAdd}>
            + Добавить заявку
          </button>
          <button className="btn" onClick={onLoadDemo}>
            Загрузить демо-бюро
          </button>
        </div>
      </Empty>
    );
  }

  // Чип «Новые» скрывается, когда новых нет — тогда показываем следующий по важности список
  if (filter === 'pending' && pendingCount === 0) filter = unsettledCount > 0 ? 'unsettled' : 'settled';
  const active = FILTERS.find((f) => f.id === filter)!;
  const inList = result.order.filter((id) => active.test(result.assignments[id]));
  // Поиск по имени привидения или месту, куда его поселили; фильтр по особому условию
  const visible = inList.filter((id) => {
    const g = ghostsById.get(id)!;
    const pid = result.assignments[id].placeId;
    if (condition && !g.conditions.includes(condition as Ghost['conditions'][number])) return false;
    return matches(query, g.name, pid ? placesById.get(pid)!.name : undefined);
  });
  const searching = query.trim() !== '' || condition !== '';
  const resetSearch = () => {
    setQuery('');
    setCondition('');
  };

  return (
    <section>
      {pendingCount > 0 && (
        <div className="autorun panel">
          <div className="autorun-text">
            <b>📥 Новых заявок: {pendingCount}.</b> Бюро ещё не подбирало им места. Запустите автоматическое
            распределение — кого не получится расселить, бюро покажет отдельно с причиной.
          </div>
          <button className="btn btn-primary autorun-btn" onClick={onRunAuto}>
            ▶ Расселить автоматически
          </button>
        </div>
      )}

      <div className="toolbar">
        <div className="chips" role="tablist" aria-label="Фильтр заявок">
          {FILTERS.filter((f) => f.id !== 'pending' || pendingCount > 0).map((f) => (
            <button
              key={f.id}
              role="tab"
              aria-selected={filter === f.id}
              className={`chip ${filter === f.id ? 'chip-active' : ''}`}
              onClick={() => setFilter(f.id)}
            >
              {f.label}{' '}
              <b className={f.id === 'unsettled' && unsettledCount > 0 ? 'chip-alarm' : ''}>{count(f.id)}</b>
            </button>
          ))}
        </div>
        <div className="row-actions">
          {manualCount > 0 && (
            <button className="btn" onClick={onResetOverrides} title="Вернуть все решения алгоритму">
              ↺ Сбросить ручные ({manualCount})
            </button>
          )}
          <button className="btn btn-primary" onClick={onAdd}>
            + Заявка
          </button>
        </div>
      </div>

      <FilterBar
        query={query}
        onQuery={setQuery}
        placeholder="Имя привидения или место"
        selects={[
          {
            label: 'Условие',
            value: condition,
            onChange: setCondition,
            options: [{ value: '', label: 'любое' }, ...CONDITION_IDS.map((id) => ({ value: id, label: CONDITIONS[id].label }))],
          },
        ]}
        found={visible.length}
        total={inList.length}
        onReset={resetSearch}
      />

      <FormulaHelp />

      {filter === 'unsettled' && visible.length > 0 && (
        <p className="queue-hint">
          <b>Здесь заявки, которым бюро не смогло подобрать место — им нужно ваше решение.</b> В каждой карточке указана причина и что
          можно сделать. Когда привидение получит место, оно перейдёт в «Расселены».
        </p>
      )}

      {visible.length === 0 && searching ? (
        <div className="alert alert-info">
          <strong>В списке «{active.label}» ничего не найдено.</strong> Попробуйте другое имя или сбросьте фильтр.
          <div className="row-actions" style={{ marginTop: 6 }}>
            <button className="btn btn-small" onClick={resetSearch}>
              Сбросить поиск
            </button>
          </div>
        </div>
      ) : visible.length === 0 && filter === 'unsettled' ? (
        <div className="alert alert-info">
          <strong>Все привидения расселены — решений оператора не требуется.</strong>
          <div className="row-actions" style={{ marginTop: 6 }}>
            <button className="btn btn-small" onClick={() => setFilter('settled')}>
              Посмотреть расселённых
            </button>
          </div>
        </div>
      ) : visible.length === 0 && filter === 'pending' ? (
        <p className="muted pad">Новых заявок нет — все уже прошли распределение.</p>
      ) : visible.length === 0 ? (
        <p className="muted pad">В этом списке заявок нет.</p>
      ) : (
        <ol className="ghost-list">
          {visible.map((id, i) => (
            <GhostCard
              key={id}
              index={result.order.indexOf(id) + 1}
              ghost={ghostsById.get(id)!}
              a={result.assignments[id]}
              data={data}
              placesById={placesById}
              occupancy={result.occupancy}
              onEdit={onEdit}
              onDelete={onDelete}
              onOverride={onOverride}
              onOpenPlaces={onOpenPlaces}
              onReject={onReject}
              style={{ animationDelay: `${Math.min(i, 10) * 40}ms` }}
            />
          ))}
        </ol>
      )}
    </section>
  );
}

function GhostCard({
  index,
  ghost: g,
  a,
  data,
  placesById,
  occupancy,
  onEdit,
  onDelete,
  onOverride,
  onOpenPlaces,
  onReject,
  style,
}: {
  index: number;
  ghost: Ghost;
  a: Assignment;
  data: BureauData;
  placesById: Map<string, Place>;
  occupancy: Record<string, string[]>;
  onEdit: (g: Ghost) => void;
  onDelete: (g: Ghost) => void;
  onOverride: (ghostId: string, placeId: string | null) => void;
  onOpenPlaces: () => void;
  onReject: (g: Ghost) => void;
  style: CSSProperties;
}) {
  const [open, setOpen] = useState(false);
  const place = a.placeId ? placesById.get(a.placeId) : undefined;
  const days = daysBetween(data.today, g.deadline);
  const status = a.mode === 'pending' ? 'pending' : a.mode === 'none' ? 'none' : a.warnings.length ? 'warn' : 'ok';
  // Что показать рядом с «Авто»: фактическое решение алгоритма, а не идеал без учёта вместимости
  const autoLabel =
    a.mode === 'auto'
      ? `: ${place!.name}`
      : a.mode === 'none'
        ? ': места нет'
        : a.mode === 'pending'
          ? ' — после распределения'
          : ' — подобрать заново';

  return (
    <li className={`ghost-card panel status-${status}`} style={style}>
      <div className="ghost-head">
        <div className="ghost-title">
          <GhostAvatar ghost={g} size={20} expired={days < 0} />
          <h3>{g.name}</h3>
          <span className="ghost-index" title="Порядок обработки алгоритмом">
            #{index}
          </span>
          {a.mode === 'manual' && <span className="tag tag-manual">вручную</span>}
        </div>
        <div className="row-actions">
          <button className="btn btn-small" onClick={() => onEdit(g)} aria-label={`Изменить заявку ${g.name}`}>
            ✏️
          </button>
          <button className="btn btn-small btn-danger" onClick={() => onDelete(g)} aria-label={`Удалить заявку ${g.name}`}>
            🗑️
          </button>
        </div>
      </div>

      <div className="ghost-body">
      <GhostAvatar ghost={g} size={64} expired={days < 0} />
      <div className="ghost-info">
      <dl className="ghost-stats">
        <div>
          <dt>Тревожность</dt>
          <dd>
            <span className="anx" style={{ ['--anx' as string]: g.anxiety }}>
              {g.anxiety}/10
            </span>
          </dd>
        </div>
        <div>
          <dt>Любит</dt>
          <dd>{g.favoriteTemp}°C</dd>
        </div>
        <div>
          <dt>Дедлайн</dt>
          <dd className={days < 0 ? 'text-bad' : days <= 2 ? 'text-warn' : ''}>
            {formatDate(g.deadline)} · {deadlineText(data.today, g.deadline)}
          </dd>
        </div>
      </dl>
      {(g.conditions.length > 0 || g.note) && (
        <div className="conditions">
          {g.conditions.map((c) => (
            <span key={c} className="tag tag-hard">
              {CONDITIONS[c].label}
            </span>
          ))}
          {g.note && <span className="note">«{g.note}»</span>}
        </div>
      )}
      </div>
      </div>

      <div className="verdict">
        {a.mode === 'pending' ? (
          <div className="verdict-place verdict-pending">
            <span aria-hidden>⏳</span>
            <strong>Не обработана</strong>
          </div>
        ) : place ? (
          <div className="verdict-place">
            <span className="arrow" aria-hidden>
              ➜
            </span>
            <span className="place-emoji" aria-hidden>
              {place.emoji}
            </span>
            <strong>{place.name}</strong>
            <Score value={a.score} />
          </div>
        ) : (
          <div className="verdict-place verdict-none">
            <span aria-hidden>☠️</span>
            <strong>Без места: {REASON_LABELS[a.unassignedReason!]}</strong>
          </div>
        )}

        <label className="override">
          <span className="sr-only">Место для {g.name}</span>
          <select
            value={data.overrides[g.id] ?? ''}
            onChange={(e) => onOverride(g.id, e.target.value || null)}
            disabled={data.places.length === 0}
          >
            <option value="">⚙️ Авто{autoLabel}</option>
            {a.evaluations.map((ev) => {
              const p = placesById.get(ev.placeId)!;
              // Заполненность — сразу после названия и у каждого места, включая неподходящие:
              // в конце строки её обрезало у длинных названий
              const seats = seatsLabel(p, occupancy[p.id].filter((x) => x !== g.id).length);
              const label = ev.ok
                ? `${p.emoji} ${p.name} [${seats}] — ${ev.score} б.`
                : `✕ ${p.name} [${seats}] — ${ev.violations[0].text}`;
              return (
                <option key={p.id} value={p.id}>
                  {label}
                </option>
              );
            })}
          </select>
        </label>
      </div>

      {a.mode !== 'none' && <p className="why">{a.explanation.join(' ')}</p>}
      {a.mode === 'none' && (
        <div className="alert alert-bad" role="status">
          <strong>{a.explanation[0]}</strong>
          {(a.unassignedReason === 'NO_SUITABLE_PLACE' || a.unassignedReason === 'ALL_FULL') && (
            // Разбор по местам строим из итоговой загрузки: в объяснении ядра она промежуточная
            <ul>
              {a.evaluations
                .filter((ev) => (a.unassignedReason === 'ALL_FULL' ? ev.ok : true))
                .map((ev) => {
                  const p = placesById.get(ev.placeId)!;
                  const seats = seatsLabel(p, occupancy[p.id].filter((x) => x !== g.id).length);
                  return (
                    <li key={p.id}>
                      {p.name} <span className="seats">[{seats}]</span>
                      {ev.ok ? ` — ${ev.score} ${plural(ev.score, 'балл', 'балла', 'баллов')}` : `: ${ev.violations.map((v) => v.text).join('; ')}`}
                    </li>
                  );
                })}
            </ul>
          )}
          <NextStep reason={a.unassignedReason!} onReject={() => onReject(g)} onOpenPlaces={onOpenPlaces} />
        </div>
      )}
      {a.warnings.length > 0 && (
        <div className="alert alert-warn" role="alert">
          <strong>⚠️ Ручной выбор нарушает условия:</strong>
          <ul>
            {a.warnings.map((w, i) => (
              <li key={`${i}-${w}`}>{w}</li>
            ))}
          </ul>
          <button className="btn btn-small" onClick={() => onOverride(g.id, null)}>
            ↺ Вернуть автоподбор
          </button>
        </div>
      )}

      <button className="link-btn" onClick={() => setOpen(!open)} aria-expanded={open}>
        {open ? '▾ Скрыть сравнение мест' : '▸ Сравнить все места'}
      </button>
      {open && <Comparison a={a} placesById={placesById} occupancy={occupancy} />}
    </li>
  );
}

/**
 * Что оператор может сделать с заявкой без места — по конкретной причине.
 * Заявку не подгоняем под место: условия и дедлайн — это потребности клиента.
 * Оператор распоряжается местами бюро и решениями о размещении.
 */
function NextStep({
  reason,
  onReject,
  onOpenPlaces,
}: {
  reason: UnassignedReason;
  onReject: () => void;
  onOpenPlaces: () => void;
}) {
  const tips: Record<UnassignedReason, { text: string; action: string; onClick: () => void }> = {
    DEADLINE_EXPIRED: {
      text: 'Поселите вручную с опозданием через список выше — система предупредит — или отклоните заявку.',
      action: '✕ Отклонить заявку',
      onClick: onReject,
    },
    NO_SUITABLE_PLACE: {
      text: 'Выберите место вручную в списке выше — бюро покажет, какие условия будут нарушены. Или добавьте подходящее место.',
      action: '🏚️ Открыть места',
      onClick: onOpenPlaces,
    },
    ALL_FULL: {
      text: 'Увеличьте вместимость подходящего места или поселите вручную сверх вместимости через список выше.',
      action: '🏚️ Открыть места',
      onClick: onOpenPlaces,
    },
    NO_PLACES: {
      text: 'Добавьте хотя бы одно место переселения.',
      action: '🏚️ Открыть места',
      onClick: onOpenPlaces,
    },
  };
  const t = tips[reason];
  return (
    <div className="next-step">
      <span>
        <b>Что можно сделать:</b> {t.text}
      </span>
      <button className="btn btn-small" onClick={t.onClick}>
        {t.action}
      </button>
    </div>
  );
}

function Comparison({
  a,
  placesById,
  occupancy,
}: {
  a: Assignment;
  placesById: Map<string, Place>;
  occupancy: Record<string, string[]>;
}) {
  if (a.evaluations.length === 0) return <p className="muted">В бюро нет мест.</p>;
  return (
    <div className="table-wrap">
      <table className="compare">
        <thead>
          <tr>
            <th>Место</th>
            <th>Балл</th>
            <th>Занято</th>
            <th>Разбор</th>
          </tr>
        </thead>
        <tbody>
          {a.evaluations.map((ev) => {
            const p = placesById.get(ev.placeId)!;
            const occ = occupancy[p.id].length;
            return (
              <tr key={p.id} className={ev.placeId === a.placeId ? 'row-chosen' : ev.ok ? '' : 'row-rejected'}>
                <td>
                  {p.emoji} {p.name}
                </td>
                <td>{ev.ok ? <Score value={ev.score} /> : <span className="text-bad">✕</span>}</td>
                <td className={occ > p.capacity ? 'text-bad' : ''}>
                  {occ}/{p.capacity}
                </td>
                <td>
                  {ev.ok ? (
                    <>
                      {ev.pros.length > 0 && <span className="text-good">+ {ev.pros.join(', ')}. </span>}
                      {ev.penalties.map((x) => `−${x.points} ${x.label.toLowerCase()}`).join('; ') || 'без штрафов'}
                    </>
                  ) : (
                    <span className="text-bad">{ev.violations.map((v) => v.text).join('; ')}</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function FormulaHelp() {
  return (
    <details className="formula panel">
      <summary>📜 Как считается балл и кто первым получает место</summary>
      <div className="formula-body">
        <p>
          <b>1. Жёсткие условия</b> — если нарушено хоть одно, место не подходит вовсе:
        </p>
        <ul>
          <li>освещённость ≤ 10 − тревожность (тревожным нужна темнота);</li>
          <li>температура отличается от любимой не больше чем на {RULES.maxTempDiff}°;</li>
          <li>ограничение места по тревожности;</li>
          <li>особые условия заявки: чердак, подвал, без зеркал, без людей, тишина, сырость, книги;</li>
          <li>дедлайн не просрочен.</li>
        </ul>
        <p>
          <b>2. Балл</b> = 100 − {RULES.tempPenaltyPerDegree}×|Δt°| − {RULES.lightPenaltyPerUnit}×свет − шум×тревожность/
          {RULES.noiseDivisor}.
        </p>
        <p>
          <b>3. Очередь</b>: сначала ручные решения оператора, затем заявки по порядку «раньше дедлайн → меньше подходящих
          мест → выше тревожность». Каждой достаётся лучшее место, где ещё есть свободные места. Номер #N на карточке — её
          место в очереди.
        </p>
      </div>
    </details>
  );
}
