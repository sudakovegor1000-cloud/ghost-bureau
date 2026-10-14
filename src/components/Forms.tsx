import { useState, type FormEvent } from 'react';
import { CONDITIONS, CONDITION_IDS, FEATURES, FEATURE_IDS } from '../engine/rules';
import type { ConditionId, FeatureId, Ghost, Place } from '../engine/types';
import { TEMP_MAX, TEMP_MIN, validateGhost, validatePlace, type FieldErrors } from '../engine/validate';
import { newId } from '../store';
import { DatePicker95 } from './DatePicker95';
import { GhostAvatar } from './GhostAvatar';
import { Field, Modal } from './ui';

/** Пустое поле числа -> NaN, чтобы валидатор показал ошибку, а не подставил 0 */
const num = (s: string) => (s.trim() === '' ? NaN : Number(s));

function toggle<T>(list: T[], item: T): T[] {
  return list.includes(item) ? list.filter((x) => x !== item) : [...list, item];
}

export function GhostForm({
  initial,
  today,
  onSave,
  onClose,
}: {
  initial?: Ghost;
  today: string;
  onSave: (g: Ghost) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [anxiety, setAnxiety] = useState(String(initial?.anxiety ?? 5));
  const [temp, setTemp] = useState(String(initial?.favoriteTemp ?? 10));
  const [deadline, setDeadline] = useState(initial?.deadline ?? today);
  const [conditions, setConditions] = useState<ConditionId[]>(initial?.conditions ?? []);
  const [note, setNote] = useState(initial?.note ?? '');
  const [errors, setErrors] = useState<FieldErrors>({});

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const g: Ghost = {
      id: initial?.id ?? newId(),
      name: name.trim(),
      anxiety: num(anxiety),
      favoriteTemp: num(temp),
      deadline,
      conditions,
      ...(note.trim() ? { note: note.trim() } : {}),
    };
    const errs = validateGhost(g as unknown as Record<string, unknown>);
    setErrors(errs);
    if (Object.keys(errs).length === 0) {
      onSave(g);
      onClose();
    }
  };

  return (
    <Modal title={initial ? `Заявка: ${initial.name}` : 'Новая заявка'} onClose={onClose}>
      <form onSubmit={submit} noValidate className="form">
        <div className="form-avatar">
          <GhostAvatar ghost={{ name, anxiety: Number(anxiety) || 5, conditions }} size={64} />
          <Field label="Имя привидения" error={errors.name} hint="Аватар рисуется из имени, тревожности и условий">
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} placeholder="Например, Граф Сквозняков" />
          </Field>
        </div>
        <div className="form-row">
          <Field label="Тревожность (1–10)" error={errors.anxiety} hint="Чем выше — тем темнее нужно место">
            <input type="number" min={1} max={10} step={1} value={anxiety} onChange={(e) => setAnxiety(e.target.value)} />
          </Field>
          <Field label="Любимая t, °C" error={errors.favoriteTemp}>
            <input type="number" min={TEMP_MIN} max={TEMP_MAX} step={1} value={temp} onChange={(e) => setTemp(e.target.value)} />
          </Field>
          <Field label="Дедлайн" error={errors.deadline}>
            <DatePicker95 value={deadline} onChange={setDeadline} label="Дедлайн" invalid={!!errors.deadline} />
          </Field>
        </div>
        <fieldset className={`field ${errors.conditions ? 'has-error' : ''}`}>
          <legend className="field-label">Особые условия</legend>
          <div className="checks">
            {CONDITION_IDS.map((id) => (
              <label key={id} className="check">
                <input type="checkbox" checked={conditions.includes(id)} onChange={() => setConditions(toggle(conditions, id))} />
                {CONDITIONS[id].label}
              </label>
            ))}
          </div>
          <span className="field-hint">Если место конфликтует с условием, туда не переселить — бюро покажет причину.</span>
          {errors.conditions && <span className="field-error">{errors.conditions}</span>}
        </fieldset>
        <Field label="Заметка" error={errors.note}>
          <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} />
        </Field>
        <div className="form-actions">
          <button type="button" className="btn" onClick={onClose}>
            Отмена
          </button>
          <button type="submit" className="btn btn-primary">
            Сохранить
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function PlaceForm({
  initial,
  onSave,
  onClose,
}: {
  initial?: Place;
  onSave: (p: Place) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [emoji, setEmoji] = useState(initial?.emoji ?? '🏚️');
  const [capacity, setCapacity] = useState(String(initial?.capacity ?? 2));
  const [light, setLight] = useState(String(initial?.light ?? 3));
  const [noise, setNoise] = useState(String(initial?.noise ?? 3));
  const [humidity, setHumidity] = useState(String(initial?.humidity ?? 50));
  const [temperature, setTemperature] = useState(String(initial?.temperature ?? 10));
  const [hasHumans, setHasHumans] = useState(initial?.hasHumans ?? false);
  const [features, setFeatures] = useState<FeatureId[]>(initial?.features ?? []);
  const [maxAnxiety, setMaxAnxiety] = useState(initial?.maxAnxiety == null ? '' : String(initial.maxAnxiety));
  const [note, setNote] = useState(initial?.note ?? '');
  const [errors, setErrors] = useState<FieldErrors>({});

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const p: Place = {
      id: initial?.id ?? newId(),
      name: name.trim(),
      emoji: emoji.trim() || '🏚️',
      capacity: num(capacity),
      light: num(light),
      noise: num(noise),
      humidity: num(humidity),
      temperature: num(temperature),
      hasHumans,
      features,
      maxAnxiety: maxAnxiety.trim() === '' ? null : num(maxAnxiety),
      ...(note.trim() ? { note: note.trim() } : {}),
    };
    const errs = validatePlace(p as unknown as Record<string, unknown>);
    setErrors(errs);
    if (Object.keys(errs).length === 0) {
      onSave(p);
      onClose();
    }
  };

  return (
    <Modal title={initial ? `Место: ${initial.name}` : 'Новое место'} onClose={onClose}>
      <form onSubmit={submit} noValidate className="form">
        <div className="form-row">
          <Field label="Значок" error={errors.emoji}>
            <input value={emoji} onChange={(e) => setEmoji(e.target.value)} maxLength={4} className="input-emoji" />
          </Field>
          <Field label="Название" error={errors.name}>
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={50} placeholder="Например, Старая мельница" />
          </Field>
        </div>
        <div className="form-row">
          <Field label="Вместимость" error={errors.capacity} hint="0 — закрыто">
            <input type="number" min={0} max={50} value={capacity} onChange={(e) => setCapacity(e.target.value)} />
          </Field>
          <Field label="Освещение 0–10" error={errors.light}>
            <input type="number" min={0} max={10} value={light} onChange={(e) => setLight(e.target.value)} />
          </Field>
          <Field label="Шум 0–10" error={errors.noise}>
            <input type="number" min={0} max={10} value={noise} onChange={(e) => setNoise(e.target.value)} />
          </Field>
        </div>
        <div className="form-row">
          <Field label="Влажность, %" error={errors.humidity}>
            <input type="number" min={0} max={100} value={humidity} onChange={(e) => setHumidity(e.target.value)} />
          </Field>
          <Field label="Температура, °C" error={errors.temperature}>
            <input type="number" min={TEMP_MIN} max={TEMP_MAX} step={1} value={temperature} onChange={(e) => setTemperature(e.target.value)} />
          </Field>
          <Field label="Макс. тревожность" error={errors.maxAnxiety} hint="Пусто — без ограничения">
            <input type="number" min={1} max={10} value={maxAnxiety} onChange={(e) => setMaxAnxiety(e.target.value)} />
          </Field>
        </div>
        <label className="check">
          <input type="checkbox" checked={hasHumans} onChange={(e) => setHasHumans(e.target.checked)} />
          Здесь живут люди
        </label>
        <fieldset className={`field ${errors.features ? 'has-error' : ''}`}>
          <legend className="field-label">Особенности</legend>
          <div className="checks">
            {FEATURE_IDS.map((id) => (
              <label key={id} className="check">
                <input type="checkbox" checked={features.includes(id)} onChange={() => setFeatures(toggle(features, id))} />
                {FEATURES[id]}
              </label>
            ))}
          </div>
        </fieldset>
        <Field label="Заметка" error={errors.note}>
          <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} />
        </Field>
        <div className="form-actions">
          <button type="button" className="btn" onClick={onClose}>
            Отмена
          </button>
          <button type="submit" className="btn btn-primary">
            Сохранить
          </button>
        </div>
      </form>
    </Modal>
  );
}
