import { useState } from 'react';
import type { MatchResult } from '../engine/match';
import { FEATURES, FEATURE_IDS } from '../engine/rules';
import type { BureauData, Place } from '../engine/types';
import { FilterBar, matches } from './FilterBar';
import { GhostAvatar } from './GhostAvatar';
import { Empty, Meter } from './ui';

interface Props {
  data: BureauData;
  result: MatchResult;
  onAdd: () => void;
  onEdit: (p: Place) => void;
}

type Seats = 'free' | 'full' | 'over' | 'closed';

const SEATS_OPTIONS: { value: '' | Seats; label: string }[] = [
  { value: '', label: 'любые' },
  { value: 'free', label: 'есть свободные' },
  { value: 'full', label: 'заполнено' },
  { value: 'over', label: 'переполнено' },
  { value: 'closed', label: 'закрыто' },
];

function seatsOf(p: Place, occupants: number): Seats {
  if (p.capacity === 0) return occupants > 0 ? 'over' : 'closed';
  if (occupants > p.capacity) return 'over';
  return occupants === p.capacity ? 'full' : 'free';
}

export function PlacesTab({ data, result, onAdd, onEdit }: Props) {
  const ghostById = new Map(data.ghosts.map((g) => [g.id, g]));
  const [query, setQuery] = useState('');
  const [seats, setSeats] = useState('');
  const [feature, setFeature] = useState('');

  if (data.places.length === 0) {
    return (
      <Empty icon="🏚️" title="Мест переселения нет">
        <p>Без мест никого не переселить — все заявки окажутся «без места».</p>
        <button className="btn btn-primary" onClick={onAdd}>
          + Добавить место
        </button>
      </Empty>
    );
  }

  // Поиск по названию места или имени жильца; фильтры по свободным местам и особенности места
  const visible = data.places.filter((p) => {
    const occupants = result.occupancy[p.id] ?? [];
    if (seats && seatsOf(p, occupants.length) !== seats) return false;
    if (feature && !p.features.includes(feature as Place['features'][number])) return false;
    return matches(query, p.name, ...occupants.map((id) => ghostById.get(id)?.name));
  });
  const resetSearch = () => {
    setQuery('');
    setSeats('');
    setFeature('');
  };

  return (
    <section>
      <div className="toolbar">
        <p className="muted">Параметры мест влияют на подбор сразу после сохранения.</p>
        <button className="btn btn-primary" onClick={onAdd}>
          + Место
        </button>
      </div>
      <FilterBar
        query={query}
        onQuery={setQuery}
        placeholder="Название места или жилец"
        selects={[
          { label: 'Места', value: seats, onChange: setSeats, options: SEATS_OPTIONS },
          {
            label: 'Особенность',
            value: feature,
            onChange: setFeature,
            options: [{ value: '', label: 'любая' }, ...FEATURE_IDS.map((id) => ({ value: id, label: FEATURES[id] }))],
          },
        ]}
        found={visible.length}
        total={data.places.length}
        onReset={resetSearch}
      />
      {visible.length === 0 && (
        <div className="alert alert-info">
          <strong>Ни одно место не подходит под поиск.</strong> Попробуйте другое название или сбросьте фильтры.
          <div className="row-actions" style={{ marginTop: 6 }}>
            <button className="btn btn-small" onClick={resetSearch}>
              Сбросить поиск
            </button>
          </div>
        </div>
      )}
      <div className="place-grid">
        {visible.map((p) => {
          const occupants = result.occupancy[p.id] ?? [];
          const over = occupants.length > p.capacity;
          const full = !over && p.capacity > 0 && occupants.length === p.capacity;
          return (
            <article key={p.id} className={`place-card panel ${over ? 'status-warn' : ''}`}>
              <header className="ghost-head">
                <div className="ghost-title">
                  <span className="place-emoji big" aria-hidden>
                    {p.emoji}
                  </span>
                  <h3>{p.name}</h3>
                </div>
                <div className="row-actions">
                  <button className="btn btn-small" onClick={() => onEdit(p)} aria-label={`Изменить место ${p.name}`}>
                    ✏️
                  </button>
                </div>
              </header>

              <div className="capacity">
                <span>
                  Заселено <b className={over ? 'text-bad' : ''}>{occupants.length}</b> из {p.capacity}
                </span>
                {over && <span className="tag tag-hard">ПЕРЕПОЛНЕНО</span>}
                {full && <span className="tag tag-soft">заполнено</span>}
                {p.capacity === 0 && <span className="tag">закрыто</span>}
              </div>
              <Meter value={occupants.length} max={p.capacity} danger={over} />

              <dl className="params">
                <div>
                  <dt>💡 Свет</dt>
                  <dd>{p.light}/10</dd>
                </div>
                <div>
                  <dt>🔊 Шум</dt>
                  <dd>{p.noise}/10</dd>
                </div>
                <div>
                  <dt>💧 Влажн.</dt>
                  <dd>{p.humidity}%</dd>
                </div>
                <div>
                  <dt>🌡️ Темп.</dt>
                  <dd>{p.temperature}°</dd>
                </div>
                <div>
                  <dt>🧍 Люди</dt>
                  <dd className={p.hasHumans ? 'text-warn' : ''}>{p.hasHumans ? 'есть' : 'нет'}</dd>
                </div>
                <div>
                  <dt>⛔ Тревожн.</dt>
                  <dd>{p.maxAnxiety === null ? 'любая' : `≤ ${p.maxAnxiety}`}</dd>
                </div>
              </dl>
              {p.features.length > 0 && (
                <div className="conditions">
                  {p.features.map((f) => (
                    <span key={f} className="tag">
                      {FEATURES[f]}
                    </span>
                  ))}
                </div>
              )}
              {p.note && <p className="note">«{p.note}»</p>}
              {occupants.length > 0 && (
                <ul className="occupants">
                  {occupants.map((id) => {
                    const g = ghostById.get(id)!;
                    return (
                      <li key={id} title={g.name}>
                        <GhostAvatar ghost={g} size={32} />
                        <span>{g.name}</span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
