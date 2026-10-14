import type { MatchResult, UnassignedReason } from '../engine/match';
import { REASON_LABELS, type PlaceStatus, type Report } from '../engine/report';
import type { BureauData } from '../engine/types';
import { GhostAvatar } from './GhostAvatar';
import { Empty, Meter } from './ui';

const STATUS_LABEL: Record<PlaceStatus, string> = {
  overloaded: 'Перегружено',
  full: 'Заполнено',
  ok: 'Есть места',
  empty: 'Пустует',
  closed: 'Закрыто',
};

export function ReportTab({ data, report, result }: { data: BureauData; report: Report; result: MatchResult }) {
  if (report.total === 0) {
    return (
      <Empty icon="📭" title="Отчёт пуст">
        <p>Добавьте хотя бы одну заявку, и здесь появится сводка по расселению.</p>
      </Empty>
    );
  }
  if (report.pending === report.total) {
    return (
      <Empty icon="⏳" title="Распределение ещё не запускалось">
        <p>Все {report.total} заявок новые. Запустите «Расселить автоматически» на вкладке «Распределение», и здесь появится сводка.</p>
      </Empty>
    );
  }
  const ghost = new Map(data.ghosts.map((g) => [g.id, g]));
  const place = new Map(data.places.map((p) => [p.id, p]));
  const pct = Math.round((report.settled / report.total) * 100);
  const reasons = (Object.keys(report.byReason) as UnassignedReason[]).filter((r) => report.byReason[r] > 0);
  const overloaded = report.places.filter((p) => p.status === 'overloaded');
  const inDemand = report.places.filter((p) => p.status !== 'overloaded' && p.topChoiceFor > p.capacity);

  return (
    <section className="report">
      <div className="kpis">
        <div className="kpi panel">
          <span className="kpi-label">Заявок</span>
          <span className="kpi-value">{report.total}</span>
        </div>
        <div className="kpi panel kpi-good">
          <span className="kpi-label">Расселено</span>
          <span className="kpi-value">{report.settled}</span>
          <span className="kpi-sub">{pct}%</span>
        </div>
        <div className={`kpi panel ${report.unsettled ? 'kpi-bad' : ''}`}>
          <span className="kpi-label">Требуют решения</span>
          <span className="kpi-value">{report.unsettled}</span>
        </div>
        {report.pending > 0 && (
          <div className="kpi panel kpi-warn">
            <span className="kpi-label">Новые, не обработаны</span>
            <span className="kpi-value">{report.pending}</span>
          </div>
        )}
        <div className={`kpi panel ${report.manualWithWarnings ? 'kpi-warn' : ''}`}>
          <span className="kpi-label">Ручных решений</span>
          <span className="kpi-value">{report.manual}</span>
          <span className="kpi-sub">с проблемами: {report.manualWithWarnings}</span>
        </div>
      </div>

      <div className="report-grid">
        <div className="panel pad">
          <h3>☠️ Самые проблемные заявки</h3>
          {report.problems.length === 0 ? (
            <p className="muted">Проблемных заявок нет — все довольны и спокойны.</p>
          ) : (
            <ol className="problems">
              {report.problems.slice(0, 5).map((p) => {
                const g = ghost.get(p.ghostId)!;
                const a = result.assignments[p.ghostId];
                return (
                  <li key={p.ghostId}>
                    <GhostAvatar ghost={g} size={32} />
                    <div>
                    <div className="problem-head">
                      <b>{g.name}</b>
                      <span className="muted">
                        {a.placeId ? `→ ${place.get(a.placeId)!.name}` : a.mode === 'pending' ? 'не обработана' : 'без места'}
                      </span>
                    </div>
                    <span className="problem-reasons">{p.reasons.join(' · ')}</span>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
          {reasons.length > 0 && (
            <>
              <h4>Почему остались без места</h4>
              <ul className="reason-list">
                {reasons.map((r) => (
                  <li key={r}>
                    {REASON_LABELS[r]}: <b>{report.byReason[r]}</b>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>

        <div className="panel pad">
          <h3>🏚️ Загрузка мест</h3>
          {overloaded.length > 0 ? (
            <p className="alert alert-bad">
              Перегружены:{' '}
              <b>{overloaded.map((s) => `${place.get(s.placeId)!.name} (${s.occupants}/${s.capacity})`).join(', ')}</b>
            </p>
          ) : (
            <p className="muted">Перегруженных мест нет.</p>
          )}
          {inDemand.length > 0 && (
            <p className="alert alert-warn">
              Спрос выше вместимости (лучший выбор для большего числа заявок, чем мест):{' '}
              <b>{inDemand.map((s) => place.get(s.placeId)!.name).join(', ')}</b>
            </p>
          )}
          <ul className="loads">
            {report.places.map((l) => {
              const p = place.get(l.placeId)!;
              return (
                <li key={l.placeId}>
                  <div className="load-head">
                    <span>
                      {p.emoji} {p.name}
                    </span>
                    <span className={`status-pill pill-${l.status}`}>{STATUS_LABEL[l.status]}</span>
                  </div>
                  <Meter value={l.occupants} max={l.capacity} danger={l.status === 'overloaded'} />
                  <div className="load-sub muted">
                    {l.occupants}/{l.capacity} · подходит {l.demand} заявкам · лучший выбор для {l.topChoiceFor}
                    {l.topChoiceFor > l.capacity && <span className="text-warn"> — спрос выше вместимости</span>}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </section>
  );
}
