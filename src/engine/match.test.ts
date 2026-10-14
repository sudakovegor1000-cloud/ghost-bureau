import { describe, expect, it } from 'vitest';
import { DEMO_PLACES, DEMO_TODAY, SCENARIOS } from '../data/demo';
import { assignAll, evaluatePlace } from './match';
import { buildReport } from './report';
import type { BureauData, Ghost, Place } from './types';

const place = (over: Partial<Place> = {}): Place => ({
  id: 'p',
  name: 'Склеп',
  emoji: '⚰️',
  capacity: 1,
  light: 0,
  noise: 0,
  humidity: 50,
  temperature: 10,
  hasHumans: false,
  features: [],
  maxAnxiety: null,
  ...over,
});

const ghost = (over: Partial<Ghost> = {}): Ghost => ({
  id: 'g',
  name: 'Каспер',
  anxiety: 5,
  favoriteTemp: 10,
  deadline: '2026-11-10',
  conditions: [],
  ...over,
});

/** По умолчанию все заявки уже прошли автоматическое распределение */
const data = (ghosts: Ghost[], places: Place[], overrides: Record<string, string> = {}): BureauData => ({
  today: DEMO_TODAY,
  ghosts,
  places,
  overrides,
  processed: ghosts.map((g) => g.id),
});

/** Демо после нажатия «Расселить автоматически» */
const demo = (): BureauData => {
  const d = SCENARIOS.find((s) => s.id === 'demo')!.build() as BureauData;
  return { ...d, processed: d.ghosts.map((g) => g.id) };
};

describe('evaluatePlace — формула и жёсткие условия', () => {
  it('идеальное место даёт 100 баллов', () => {
    const e = evaluatePlace(ghost(), place());
    expect(e.ok).toBe(true);
    expect(e.score).toBe(100);
  });

  it('считает штрафы по формуле: 2/градус, 2/ед. света, шум × тревожность / 5', () => {
    const e = evaluatePlace(ghost({ anxiety: 5, favoriteTemp: 10 }), place({ temperature: 13, light: 2, noise: 4 }));
    // 100 − 3·2 − 2·2 − round(4·5/5)=4 → 86
    expect(e.score).toBe(86);
  });

  it('слишком светло для тревожного привидения — жёсткий отказ', () => {
    const e = evaluatePlace(ghost({ anxiety: 8 }), place({ light: 3 }));
    expect(e.ok).toBe(false);
    expect(e.violations[0].code).toBe('TOO_BRIGHT');
  });

  it('особые условия: зеркала, люди, чердак', () => {
    const g = ghost({ conditions: ['fearsMirrors', 'noHumans', 'needsAttic'] });
    const e = evaluatePlace(g, place({ features: ['mirrors'], hasHumans: true }));
    expect(e.violations.map((v) => v.text).join(' | ')).toMatch(/зеркала.*люди.*чердака/);
  });

  it('границы включительно: свет ровно 10 − тревожность, разница ровно 10°, дедлайн сегодня', () => {
    const g = ghost({ anxiety: 6, favoriteTemp: 10, deadline: DEMO_TODAY });
    expect(evaluatePlace(g, place({ light: 4, temperature: 20 })).ok).toBe(true);
    expect(evaluatePlace(g, place({ light: 5 })).violations[0].code).toBe('TOO_BRIGHT');
    expect(evaluatePlace(g, place({ temperature: -1 })).violations[0].code).toBe('TOO_COLD');
    expect(assignAll(data([g], [place()])).assignments.g.placeId).toBe('p');
  });

  it('ограничение места по тревожности', () => {
    const e = evaluatePlace(ghost({ anxiety: 7, conditions: [] }), place({ light: 0, maxAnxiety: 6 }));
    expect(e.violations.map((v) => v.code)).toContain('ANXIETY_LIMIT');
  });
});

describe('assignAll — подбор', () => {
  it('пустой список заявок не ломает подбор и отчёт', () => {
    const d = data([], DEMO_PLACES);
    const r = assignAll(d);
    const rep = buildReport(d, r);
    expect(rep.total).toBe(0);
    expect(rep.settled).toBe(0);
    expect(rep.problems).toEqual([]);
  });

  it('заявка без подходящего места получает причины по каждому месту', () => {
    const r = assignAll(demo());
    const ned = r.assignments.ned;
    expect(ned.placeId).toBeNull();
    expect(ned.unassignedReason).toBe('NO_SUITABLE_PLACE');
    expect(ned.explanation.length).toBe(1 + DEMO_PLACES.length);
  });

  it('просроченный дедлайн — не переселяем', () => {
    const r = assignAll(demo());
    expect(r.assignments.oswald.unassignedReason).toBe('DEADLINE_EXPIRED');
  });

  it('не превышает вместимость: срочные заявки занимают место первыми', () => {
    const d = data(
      [ghost({ id: 'late', deadline: '2026-11-20' }), ghost({ id: 'urgent', deadline: '2026-11-01' })],
      [place({ capacity: 1 })],
    );
    const r = assignAll(d);
    expect(r.assignments.urgent.placeId).toBe('p');
    expect(r.assignments.late.unassignedReason).toBe('ALL_FULL');
    expect(r.occupancy.p).toHaveLength(1);
  });

  it('в демо подвал типографии не переполняется, Тётушка Пыль остаётся без места', () => {
    const r = assignAll(demo());
    expect(r.occupancy.press.length).toBeLessThanOrEqual(2);
    expect(r.assignments.dust.unassignedReason).toBe('ALL_FULL');
  });

  it('если лучшее место занято, берётся следующее и это объясняется', () => {
    const r = assignAll(demo());
    expect(r.assignments.mary.placeId).toBe('castle');
    expect(r.assignments.mary.explanation.join(' ')).toMatch(/уже заполнен/);
  });
});

describe('ручной выбор', () => {
  it('предупреждает о конфликте условий и переполнении', () => {
    const d = SCENARIOS.find((s) => s.id === 'conflicts')!.build() as BureauData;
    const r = assignAll(d);
    const ned = r.assignments.ned;
    expect(ned.mode).toBe('manual');
    expect(ned.warnings.some((w) => /слишком светло/i.test(w))).toBe(true);
    expect(ned.warnings.some((w) => w.includes('переполнено'))).toBe(true);
    expect(r.assignments.oswald.warnings.some((w) => w.includes('Дедлайн'))).toBe(true);

    const rep = buildReport(d, r);
    expect(rep.places.find((p) => p.placeId === 'lighthouse')!.status).toBe('overloaded');
  });

  it('удачный ручной выбор не даёт предупреждений', () => {
    const d = data([ghost()], [place(), place({ id: 'p2', name: 'Чулан' })], { g: 'p' });
    expect(assignAll(d).assignments.g.warnings).toEqual([]);
  });

  it('ручной выбор занимает место раньше автоподбора', () => {
    const d = data(
      [ghost({ id: 'a', deadline: '2026-11-01' }), ghost({ id: 'b', deadline: '2026-11-30' })],
      [place({ capacity: 1 })],
      { b: 'p' },
    );
    const r = assignAll(d);
    expect(r.assignments.b.placeId).toBe('p');
    expect(r.assignments.a.unassignedReason).toBe('ALL_FULL');
  });
});

describe('краевые случаи после ревью', () => {
  it('закрытое место (вместимость 0) не считается подходящим и не рекомендуется', () => {
    const d = data([ghost()], [place({ id: 'closed', capacity: 0 }), place({ id: 'open', temperature: 13 })]);
    const r = assignAll(d);
    expect(r.assignments.g.placeId).toBe('open');
    expect(r.assignments.g.recommendedPlaceId).toBe('open');
    expect(r.assignments.g.explanation.join(' ')).not.toMatch(/уже заполнен/);
    const closed = r.assignments.g.evaluations.find((e) => e.placeId === 'closed')!;
    expect(closed.ok).toBe(false);
    expect(closed.violations[0].code).toBe('CLOSED');
  });


  it('склоняет «балл»', () => {
    const d = data(
      [ghost({ id: 'a', deadline: '2026-11-01' }), ghost({ id: 'b', deadline: '2026-11-30', favoriteTemp: 14 })],
      [place({ capacity: 1 })],
    );
    expect(assignAll(d).assignments.b.explanation.join(' ')).toMatch(/92 балла/);
  });
});

describe('особые условия как в ТЗ', () => {
  it('конфликт с любым условием исключает место и называет причину', () => {
    const g = ghost({ conditions: ['lovesDamp', 'lovesBooks'] });
    const e = evaluatePlace(g, place({ humidity: 40, features: [] }));
    expect(e.ok).toBe(false);
    expect(e.violations.map((v) => v.text).join(' | ')).toMatch(/сухо: влажность 40%.*нет книг/);
  });

  it('демо: из 20 расселено 15, пятерым нужно решение — все три причины', () => {
    const r = assignAll(demo());
    expect(Object.values(r.assignments).filter((a) => a.placeId).length).toBe(15);
    const reasons = Object.values(r.assignments).map((a) => a.unassignedReason).filter(Boolean);
    expect(reasons.sort()).toEqual(['ALL_FULL', 'DEADLINE_EXPIRED', 'DEADLINE_EXPIRED', 'NO_SUITABLE_PLACE', 'NO_SUITABLE_PLACE']);
    expect(r.assignments.mary.placeId).toBe('castle');
    expect(r.assignments.keeper.placeId).toBe('library');
  });
});

describe('финальный отчёт', () => {
  it('демо: 15 расселено, 5 без места; в проблемных только реальные проблемы', () => {
    const d = demo();
    const rep = buildReport(d, assignAll(d));
    expect(rep.settled).toBe(15);
    expect(rep.unsettled).toBe(5);
    expect(rep.byReason).toMatchObject({ DEADLINE_EXPIRED: 2, NO_SUITABLE_PLACE: 2, ALL_FULL: 1 });
    expect(rep.problems.slice(0, 5).every((p) => p.reasons[0].startsWith('Без места'))).toBe(true);
    // Хранитель поселён в единственное подходящее место — это не проблема
    expect(rep.problems.some((p) => p.ghostId === 'keeper')).toBe(false);
    expect(rep.places.some((p) => p.status === 'overloaded')).toBe(false);
  });
});

describe('новые заявки до автоматического распределения', () => {
  it('демо стартует без обработки: никто не расселён и мест не занято', () => {
    const d = SCENARIOS.find((s) => s.id === 'demo')!.build() as BureauData;
    const r = assignAll(d);
    expect(Object.values(r.assignments).every((a) => a.mode === 'pending')).toBe(true);
    expect(Object.values(r.occupancy).every((o) => o.length === 0)).toBe(true);
  });

  it('новая заявка не отнимает место у обработанных', () => {
    const d = data([ghost({ id: 'old', deadline: '2026-11-20' }), ghost({ id: 'new', deadline: '2026-11-01' })], [place({ capacity: 1 })]);
    d.processed = ['old'];
    const r = assignAll(d);
    expect(r.assignments.old.placeId).toBe('p');
    expect(r.assignments.new.mode).toBe('pending');
  });

  it('ручной выбор работает и для необработанной заявки', () => {
    const d = data([ghost()], [place()], { g: 'p' });
    d.processed = [];
    expect(assignAll(d).assignments.g.mode).toBe('manual');
  });
});

describe('объяснения и предупреждения после ревью', () => {
  it('в объяснении назван следующий по баллу вариант', () => {
    const d = data([ghost()], [place({ id: 'best' }), place({ id: 'second', name: 'Чулан', temperature: 12 })]);
    expect(assignAll(d).assignments.g.explanation.join(' ')).toMatch(/Следующий по баллу — Чулан \(96\)/);
  });

  it('ручной выбор закрытого места: одно предупреждение «закрыто», без дубля «переполнено»', () => {
    const d = data([ghost()], [place({ capacity: 0 })], { g: 'p' });
    const w = assignAll(d).assignments.g.warnings;
    expect(w.filter((x) => /закрыто/.test(x))).toHaveLength(1);
    expect(w.some((x) => /переполнено/.test(x))).toBe(false);
  });

  it('заселение сверх вместимости не выселяет нынешних жильцов — место переполняется', () => {
    const d = data(
      [ghost({ id: 'a', deadline: '2026-11-01' }), ghost({ id: 'b' })],
      [place({ capacity: 1 }), place({ id: 'p2', name: 'Чулан', temperature: 14 })],
      { b: 'p' },
    );
    d.overCapacity = ['b'];
    const r = assignAll(d);
    expect(r.assignments.a.placeId).toBe('p');
    expect(r.assignments.b.placeId).toBe('p');
    expect(r.occupancy.p).toHaveLength(2);
    expect(r.assignments.b.warnings.join(' ')).toMatch(/переполнено: 2/);
  });

  it('демо «Ручные конфликты»: жильцы театра на местах, театр и маяк переполнены', () => {
    const d = SCENARIOS.find((s) => s.id === 'conflicts')!.build() as BureauData;
    const r = assignAll(d);
    expect(r.assignments.phantom.placeId).toBe('theatre');
    expect(r.occupancy.theatre.length).toBe(3);
    expect(r.occupancy.lighthouse.length).toBe(2);
  });
});
