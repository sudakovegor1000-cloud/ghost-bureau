import { daysBetween, formatDate } from './dates';
import { CONDITIONS, RULES, maxLightFor } from './rules';
import type { BureauData, Ghost, Place } from './types';

export interface Violation {
  code: 'TOO_BRIGHT' | 'TOO_HOT' | 'TOO_COLD' | 'ANXIETY_LIMIT' | 'CONDITION' | 'CLOSED';
  text: string;
}

export interface Penalty {
  label: string;
  points: number;
}

/** Оценка пары «привидение × место» без учёта вместимости */
export interface Evaluation {
  placeId: string;
  ok: boolean;
  violations: Violation[];
  penalties: Penalty[];
  /** Плюсы: какие особые условия место выполняет */
  pros: string[];
  score: number;
}

export type UnassignedReason = 'DEADLINE_EXPIRED' | 'NO_SUITABLE_PLACE' | 'ALL_FULL' | 'NO_PLACES';

export interface Assignment {
  ghostId: string;
  placeId: string | null;
  /** pending — новая заявка, автоматическое распределение для неё ещё не запускали */
  mode: 'auto' | 'manual' | 'none' | 'pending';
  score: number | null;
  /** Короткое объяснение выбора (или причины отказа) — строки для UI */
  explanation: string[];
  unassignedReason?: UnassignedReason;
  /** Для ручного выбора: что с ним не так */
  warnings: string[];
  /** Все места, отсортированные: подходящие по убыванию балла, затем неподходящие */
  evaluations: Evaluation[];
  /** Лучшее место по баллу без учёта вместимости (id) — «идеал» для сравнения */
  recommendedPlaceId: string | null;
}

export interface MatchResult {
  assignments: Record<string, Assignment>;
  /** placeId -> ghostIds, которые туда заселены (авто + вручную) */
  occupancy: Record<string, string[]>;
  /** Порядок, в котором алгоритм обрабатывал заявки */
  order: string[];
}

export function evaluatePlace(ghost: Ghost, place: Place): Evaluation {
  const violations: Violation[] = [];
  const penalties: Penalty[] = [];
  const pros: string[] = [];

  if (place.capacity === 0) violations.push({ code: 'CLOSED', text: 'место закрыто (вместимость 0)' });

  const maxLight = maxLightFor(ghost.anxiety);
  if (place.light > maxLight) {
    violations.push({
      code: 'TOO_BRIGHT',
      text: `слишком светло: освещённость ${place.light}, при тревожности ${ghost.anxiety} допустимо ≤ ${Math.max(0, maxLight)}`,
    });
  }

  const dt = place.temperature - ghost.favoriteTemp;
  if (Math.abs(dt) > RULES.maxTempDiff) {
    violations.push({
      code: dt > 0 ? 'TOO_HOT' : 'TOO_COLD',
      text: `${dt > 0 ? 'слишком тепло' : 'слишком холодно'}: ${place.temperature}° при любимых ${ghost.favoriteTemp}° (разница > ${RULES.maxTempDiff}°)`,
    });
  }

  if (place.maxAnxiety !== null && ghost.anxiety > place.maxAnxiety) {
    violations.push({
      code: 'ANXIETY_LIMIT',
      text: `место не принимает тревожность выше ${place.maxAnxiety} (у привидения ${ghost.anxiety})`,
    });
  }

  for (const id of ghost.conditions) {
    const c = CONDITIONS[id];
    const v = c.violation(place);
    if (v) violations.push({ code: 'CONDITION', text: `${c.label.toLowerCase()}, а тут ${v}` });
    else pros.push(c.okText);
  }

  if (dt !== 0) {
    penalties.push({
      label: `Температура ${place.temperature}° вместо любимых ${ghost.favoriteTemp}°`,
      points: Math.abs(dt) * RULES.tempPenaltyPerDegree,
    });
  }
  const noisePts = Math.round((place.noise * ghost.anxiety) / RULES.noiseDivisor);
  if (noisePts > 0) penalties.push({ label: `Шум ${place.noise} при тревожности ${ghost.anxiety}`, points: noisePts });
  const lightPts = place.light * RULES.lightPenaltyPerUnit;
  if (lightPts > 0) penalties.push({ label: `Освещённость ${place.light}`, points: lightPts });

  penalties.sort((a, b) => b.points - a.points);
  const score = Math.max(0, RULES.baseScore - penalties.reduce((s, p) => s + p.points, 0));
  return { placeId: place.id, ok: violations.length === 0, violations, penalties, pros, score };
}

function sortEvaluations(evals: Evaluation[], places: Map<string, Place>): Evaluation[] {
  return [...evals].sort((a, b) => {
    if (a.ok !== b.ok) return a.ok ? -1 : 1;
    if (a.score !== b.score) return b.score - a.score;
    return (places.get(a.placeId)?.name ?? '').localeCompare(places.get(b.placeId)?.name ?? '', 'ru');
  });
}

function summarize(e: Evaluation): string {
  const parts: string[] = [];
  if (e.pros.length) parts.push(`Плюсы: ${e.pros.join(', ')}.`);
  const top = e.penalties.slice(0, 2).map((p) => `${p.label.toLowerCase()} (−${p.points})`);
  parts.push(top.length ? `Главные штрафы: ${top.join(', ')}.` : 'Без штрафов.');
  return parts.join(' ');
}

export const plural = (n: number, one: string, few: string, many: string) => {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
};

export const isExpired = (ghost: Ghost, today: string) => daysBetween(today, ghost.deadline) < 0;

/**
 * Подбор мест для всех заявок.
 *
 * 1. Ручные решения оператора применяются первыми и занимают места (даже сверх вместимости — это и есть «перегруз»).
 * 2. Остальные заявки расселяются жадно в порядке приоритета:
 *    раньше дедлайн → меньше подходящих вариантов → выше тревожность
 *    (просроченные — в конец: их всё равно не расселяем).
 *    Каждой достаётся место с лучшим баллом, где ещё есть свободные места.
 */
export function assignAll(data: BureauData): MatchResult {
  const placesById = new Map(data.places.map((p) => [p.id, p]));
  const occupancy: Record<string, string[]> = Object.fromEntries(data.places.map((p) => [p.id, []]));
  const assignments: Record<string, Assignment> = {};

  const evalsByGhost = new Map<string, Evaluation[]>();
  for (const g of data.ghosts) {
    evalsByGhost.set(g.id, sortEvaluations(data.places.map((p) => evaluatePlace(g, p)), placesById));
  }
  const recommendedOf = (g: Ghost) => {
    if (isExpired(g, data.today)) return null;
    return evalsByGhost.get(g.id)!.find((e) => e.ok)?.placeId ?? null;
  };

  // 1. Ручные решения
  const manual = data.ghosts.filter((g) => {
    const pid = data.overrides[g.id];
    return pid !== undefined && placesById.has(pid);
  });
  // Поселённые сверх вместимости мест не занимают — их добавим после автоподбора, чтобы никого не выселить
  const overCapacity = new Set(data.overCapacity ?? []);
  for (const g of manual) {
    if (!overCapacity.has(g.id)) occupancy[data.overrides[g.id]].push(g.id);
  }

  // 2. Авто-подбор. Новые заявки ждут запуска распределения и мест не занимают
  const processed = new Set(data.processed);
  const pending = data.ghosts.filter((g) => !manual.includes(g) && !processed.has(g.id));
  const auto = data.ghosts.filter((g) => !manual.includes(g) && processed.has(g.id));
  const okCount = (g: Ghost) => evalsByGhost.get(g.id)!.filter((e) => e.ok).length;
  const expired = (g: Ghost) => (isExpired(g, data.today) ? 1 : 0);
  const order = [...auto].sort(
    (a, b) =>
      expired(a) - expired(b) ||
      a.deadline.localeCompare(b.deadline) ||
      okCount(a) - okCount(b) ||
      b.anxiety - a.anxiety ||
      a.name.localeCompare(b.name, 'ru'),
  );

  for (const g of order) {
    const evaluations = evalsByGhost.get(g.id)!;
    const base = { ghostId: g.id, evaluations, warnings: [], recommendedPlaceId: recommendedOf(g) };

    if (isExpired(g, data.today)) {
      assignments[g.id] = {
        ...base,
        placeId: null,
        mode: 'none',
        score: null,
        unassignedReason: 'DEADLINE_EXPIRED',
        explanation: [`Дедлайн ${formatDate(g.deadline)} уже прошёл — автоматически бюро просроченные заявки не расселяет.`],
      };
      continue;
    }
    if (data.places.length === 0) {
      assignments[g.id] = {
        ...base,
        placeId: null,
        mode: 'none',
        score: null,
        unassignedReason: 'NO_PLACES',
        explanation: ['В бюро нет ни одного места переселения — добавьте место.'],
      };
      continue;
    }

    const suitable = evaluations.filter((e) => e.ok);
    if (suitable.length === 0) {
      assignments[g.id] = {
        ...base,
        placeId: null,
        mode: 'none',
        score: null,
        unassignedReason: 'NO_SUITABLE_PLACE',
        explanation: [
          'Ни одно место не подходит:',
          ...evaluations.map((e) => `${placesById.get(e.placeId)!.name}: ${e.violations.map((v) => v.text).join('; ')}`),
        ],
      };
      continue;
    }

    const chosen = suitable.find((e) => occupancy[e.placeId].length < placesById.get(e.placeId)!.capacity);
    if (!chosen) {
      assignments[g.id] = {
        ...base,
        placeId: null,
        mode: 'none',
        score: null,
        unassignedReason: 'ALL_FULL',
        explanation: [
          'Подходящие места есть, но все заняты:',
          ...suitable.map((e) => {
            const p = placesById.get(e.placeId)!;
            return `${p.name} (${occupancy[p.id].length}/${p.capacity}) — ${e.score} ${plural(e.score, 'балл', 'балла', 'баллов')}`;
          }),
        ],
      };
      continue;
    }

    occupancy[chosen.placeId].push(g.id);
    const lead =
      suitable.length === 1
        ? 'Единственное подходящее место.'
        : `Лучший свободный вариант из ${suitable.length} ${plural(suitable.length, 'подходящего', 'подходящих', 'подходящих')}.`;
    const explanation = [`${lead} ${summarize(chosen)}`];
    if (chosen !== suitable[0]) {
      const best = placesById.get(suitable[0].placeId)!;
      explanation.push(`Лучший вариант — ${best.name} (${suitable[0].score}) — уже заполнен: его заняли заявки раньше в очереди.`);
    } else if (suitable.length > 1) {
      const next = suitable[1];
      explanation.push(`Следующий по баллу — ${placesById.get(next.placeId)!.name} (${next.score}).`);
    }
    assignments[g.id] = { ...base, placeId: chosen.placeId, mode: 'auto', score: chosen.score, explanation };
  }

  for (const g of manual) {
    if (overCapacity.has(g.id)) occupancy[data.overrides[g.id]].push(g.id);
  }

  // 3. Предупреждения по ручным решениям (после авто, чтобы знать итоговую загрузку)
  for (const g of manual) {
    const pid = data.overrides[g.id];
    const place = placesById.get(pid)!;
    const evaluations = evalsByGhost.get(g.id)!;
    const ev = evaluations.find((e) => e.placeId === pid)!;
    const warnings = validateManualChoice(g, place, ev, occupancy[pid].length, data.today);
    const recommended = recommendedOf(g);
    if (recommended && recommended !== pid) {
      const r = evaluations.find((e) => e.placeId === recommended)!;
      if (r.score > ev.score) {
        warnings.push(`Балл ${ev.score} ниже лучшего возможного: ${placesById.get(recommended)!.name} — ${r.score}.`);
      }
    }
    assignments[g.id] = {
      ghostId: g.id,
      placeId: pid,
      mode: 'manual',
      score: ev.score,
      evaluations,
      warnings,
      recommendedPlaceId: recommended,
      explanation: [`Выбрано оператором вручную. ${summarize(ev)}`],
    };
  }

  const pendingOrder = [...pending].sort((a, b) => a.deadline.localeCompare(b.deadline) || a.name.localeCompare(b.name, 'ru'));
  for (const g of pendingOrder) {
    assignments[g.id] = {
      ghostId: g.id,
      placeId: null,
      mode: 'pending',
      score: null,
      evaluations: evalsByGhost.get(g.id)!,
      warnings: [],
      recommendedPlaceId: recommendedOf(g),
      explanation: ['Заявка ещё не обработана. Запустите автоматическое распределение или выберите место вручную.'],
    };
  }

  return {
    assignments,
    occupancy,
    order: [...manual.map((g) => g.id), ...order.map((g) => g.id), ...pendingOrder.map((g) => g.id)],
  };
}

/** Что не так с ручным выбором (пустой массив — всё хорошо) */
export function validateManualChoice(
  ghost: Ghost,
  place: Place,
  ev: Evaluation,
  occupantsIncludingGhost: number,
  today: string,
): string[] {
  const warnings: string[] = [];
  if (isExpired(ghost, today)) warnings.push(`Дедлайн ${formatDate(ghost.deadline)} уже прошёл.`);
  for (const v of ev.violations) warnings.push(`${v.text[0].toUpperCase()}${v.text.slice(1)}.`);
  // Для закрытого места достаточно «место закрыто» — «переполнено» было бы дублем
  if (place.capacity > 0 && occupantsIncludingGhost > place.capacity) {
    warnings.push(
      `Место переполнено: ${occupantsIncludingGhost} ${plural(occupantsIncludingGhost, 'привидение', 'привидения', 'привидений')} при вместимости ${place.capacity}.`,
    );
  }
  return warnings;
}
