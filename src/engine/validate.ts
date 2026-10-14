import { isIsoDate } from './dates';
import { CONDITION_IDS, FEATURE_IDS } from './rules';
import type { BureauData, Ghost, Place } from './types';

export type FieldErrors = Record<string, string>;

/** Допустимые температуры, °C: от полярной ночи до пустыни */
export const TEMP_MIN = -90;
export const TEMP_MAX = 60;

const isInt = (v: unknown, min: number, max: number) =>
  typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;
const hasDuplicates = (list: unknown[]) => new Set(list).size !== list.length;
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Ошибки по полям заявки (используется и формой, и импортом) */
export function validateGhost(g: Record<string, unknown>): FieldErrors {
  const e: FieldErrors = {};
  if (typeof g.name !== 'string' || !g.name.trim()) e.name = 'Укажите имя';
  else if (g.name.length > 40) e.name = 'Имя длиннее 40 символов';
  if (!isInt(g.anxiety, 1, 10)) e.anxiety = 'Тревожность — целое от 1 до 10';
  if (!isInt(g.favoriteTemp, TEMP_MIN, TEMP_MAX)) e.favoriteTemp = `Температура — целое от ${TEMP_MIN} до +${TEMP_MAX} °C`;
  if (!isIsoDate(g.deadline)) e.deadline = 'Дедлайн — дата в формате ГГГГ-ММ-ДД';
  if (!Array.isArray(g.conditions) || g.conditions.some((c) => !CONDITION_IDS.includes(c)))
    e.conditions = `Неизвестное особое условие. Допустимо: ${CONDITION_IDS.join(', ')}`;
  else if (hasDuplicates(g.conditions)) e.conditions = 'Особое условие указано дважды';
  if (g.note !== undefined && typeof g.note !== 'string') e.note = 'Заметка должна быть строкой';
  return e;
}

export function validatePlace(p: Record<string, unknown>): FieldErrors {
  const e: FieldErrors = {};
  if (typeof p.name !== 'string' || !p.name.trim()) e.name = 'Укажите название';
  else if (p.name.length > 50) e.name = 'Название длиннее 50 символов';
  if (typeof p.emoji !== 'string') e.emoji = 'Значок должен быть строкой';
  if (!isInt(p.capacity, 0, 50)) e.capacity = 'Вместимость — целое от 0 до 50';
  if (!isInt(p.light, 0, 10)) e.light = 'Освещённость — целое от 0 до 10';
  if (!isInt(p.noise, 0, 10)) e.noise = 'Шум — целое от 0 до 10';
  if (!isInt(p.humidity, 0, 100)) e.humidity = 'Влажность — целое от 0 до 100 %';
  if (!isInt(p.temperature, TEMP_MIN, TEMP_MAX)) e.temperature = `Температура — целое от ${TEMP_MIN} до +${TEMP_MAX} °C`;
  if (typeof p.hasHumans !== 'boolean') e.hasHumans = 'Поле «есть люди» должно быть true/false';
  if (!Array.isArray(p.features) || p.features.some((f) => !FEATURE_IDS.includes(f)))
    e.features = `Неизвестная особенность места. Допустимо: ${FEATURE_IDS.join(', ')}`;
  else if (hasDuplicates(p.features)) e.features = 'Особенность указана дважды';
  if (p.maxAnxiety !== null && !isInt(p.maxAnxiety, 1, 10))
    e.maxAnxiety = 'Предел тревожности — целое от 1 до 10 или пусто';
  if (p.note !== undefined && typeof p.note !== 'string') e.note = 'Заметка должна быть строкой';
  return e;
}

export type ParseResult = { ok: true; data: BureauData } | { ok: false; errors: string[] };

const MAX_ERRORS = 8;

/** Полная проверка данных бюро: для импорта JSON и загрузки из localStorage */
export function validateBureauData(raw: unknown): ParseResult {
  const errors: string[] = [];
  if (!isObj(raw)) return { ok: false, errors: ['Ожидался JSON-объект с полями today, ghosts, places, overrides.'] };

  if (!isIsoDate(raw.today)) errors.push('Поле today должно быть датой ГГГГ-ММ-ДД.');
  if (!Array.isArray(raw.ghosts)) errors.push('Поле ghosts должно быть массивом заявок.');
  if (!Array.isArray(raw.places)) errors.push('Поле places должно быть массивом мест.');
  if (raw.overrides !== undefined && !isObj(raw.overrides)) errors.push('Поле overrides должно быть объектом.');
  if (raw.processed !== undefined && (!Array.isArray(raw.processed) || raw.processed.some((x) => typeof x !== 'string')))
    errors.push('Поле processed должно быть списком id заявок.');
  if (errors.length) return { ok: false, errors };

  const ghosts = raw.ghosts as unknown[];
  const places = raw.places as unknown[];

  // id уникальны внутри своего списка: заявка и место могут совпадать по id, они живут в разных коллекциях
  const check = (list: unknown[], kind: 'Заявка' | 'Место', fn: (x: Record<string, unknown>) => FieldErrors) => {
    const ids = new Set<string>();
    list.forEach((item, i) => {
      if (!isObj(item)) {
        errors.push(`${kind} №${i + 1}: ожидался объект.`);
        return;
      }
      const label = typeof item.name === 'string' && item.name ? `«${item.name}»` : `№${i + 1}`;
      if (typeof item.id !== 'string' || !item.id) errors.push(`${kind} ${label}: нет id.`);
      else if (ids.has(item.id)) errors.push(`${kind} ${label}: id «${item.id}» повторяется.`);
      else ids.add(item.id);
      for (const msg of Object.values(fn(item))) errors.push(`${kind} ${label}: ${msg}.`);
    });
  };
  check(ghosts, 'Заявка', validateGhost);
  check(places, 'Место', validatePlace);

  const overrides: Record<string, string> = {};
  if (isObj(raw.overrides)) {
    const ghostIds = new Set(ghosts.filter(isObj).map((g) => g.id));
    const placeIds = new Set(places.filter(isObj).map((p) => p.id));
    for (const [gid, pid] of Object.entries(raw.overrides)) {
      if (!ghostIds.has(gid)) errors.push(`Ручное решение ссылается на несуществующую заявку «${gid}».`);
      else if (typeof pid !== 'string' || !placeIds.has(pid))
        errors.push(`Ручное решение для «${gid}» ссылается на несуществующее место «${String(pid)}».`);
      else overrides[gid] = pid;
    }
  }

  // Файлы без processed (старый формат) считаем полностью обработанными; неизвестные id просто отбрасываем
  const ghostIdList = ghosts.filter(isObj).map((g) => g.id as string);
  const processed = Array.isArray(raw.processed)
    ? (raw.processed as string[]).filter((id) => ghostIdList.includes(id))
    : ghostIdList;

  if (raw.overCapacity !== undefined && (!Array.isArray(raw.overCapacity) || raw.overCapacity.some((x) => typeof x !== 'string')))
    errors.push('Поле overCapacity должно быть списком id заявок.');
  const overCapacity = Array.isArray(raw.overCapacity) ? (raw.overCapacity as string[]).filter((id) => id in overrides) : [];

  if (errors.length) {
    const extra = errors.length - MAX_ERRORS;
    return { ok: false, errors: extra > 0 ? [...errors.slice(0, MAX_ERRORS), `…и ещё ${extra}.`] : errors };
  }
  return {
    ok: true,
    data: {
      today: raw.today as string,
      ghosts: ghosts as Ghost[],
      places: places as Place[],
      overrides,
      processed,
      overCapacity,
    },
  };
}

/** JSON-строка -> данные бюро с человекочитаемыми ошибками */
export function parseBureauJson(text: string): ParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (err) {
    return { ok: false, errors: [`Данные не являются корректным JSON: ${(err as Error).message}`] };
  }
  return validateBureauData(raw);
}
