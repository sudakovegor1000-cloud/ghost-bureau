import { describe, expect, it } from 'vitest';
import { SCENARIOS } from '../data/demo';
import { isIsoDate } from './dates';
import type { BureauData } from './types';
import { parseBureauJson } from './validate';

describe('импорт и валидация данных', () => {
  it('демо-данные проходят валидацию', () => {
    const demo = SCENARIOS.find((s) => s.id === 'demo')!.build();
    expect(parseBureauJson(JSON.stringify(demo)).ok).toBe(true);
  });

  it('не-JSON даёт понятную ошибку', () => {
    const r = parseBureauJson('{ привидения: ');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0]).toMatch(/не являются корректным JSON/);
  });

  it('битый файл: перечисляет конкретные проблемы', () => {
    const raw = SCENARIOS.find((s) => s.id === 'broken')!.build() as string;
    const r = parseBureauJson(raw);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    const all = r.errors.join('\n');
    expect(all).toMatch(/Тревожность — целое от 1 до 10/);
    expect(all).toMatch(/Дедлайн/);
    expect(all).toMatch(/Неизвестное особое условие/);
    expect(all).toMatch(/повторяется/);
    expect(all).toMatch(/Укажите имя/);
  });

  it('строгая проверка дат', () => {
    expect(isIsoDate('2026-10-31')).toBe(true);
    expect(isIsoDate('2026-02-31')).toBe(false);
    expect(isIsoDate('31.10.2026')).toBe(false);
  });
});

describe('валидация после ревью', () => {
  const base = () => SCENARIOS.find((s) => s.id === 'demo')!.build() as BureauData;

  it('отклоняет дубликаты условий и особенностей', () => {
    const d = base();
    d.ghosts[0].conditions = ['lovesBooks', 'lovesBooks'];
    d.places[0].features = ['attic', 'attic'];
    const r = parseBureauJson(JSON.stringify(d));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join('\n')).toMatch(/дважды[\s\S]*дважды/);
  });

  it('одинаковые id у заявки и места допустимы', () => {
    const d = base();
    d.ghosts[0].id = 'castle';
    const r = parseBureauJson(JSON.stringify(d));
    expect(r.ok).toBe(true);
  });

  it('дробная температура отклоняется', () => {
    const d = base();
    d.ghosts[0].favoriteTemp = 10.3;
    const r = parseBureauJson(JSON.stringify(d));
    expect(r.ok).toBe(false);
  });
});

it('температуры от −90 до +60 допустимы, за пределами — ошибка', () => {
  const d = SCENARIOS.find((s) => s.id === 'demo')!.build() as BureauData;
  d.ghosts[0].favoriteTemp = -90;
  d.places[0].temperature = 60;
  expect(parseBureauJson(JSON.stringify(d)).ok).toBe(true);
  d.ghosts[0].favoriteTemp = -91;
  expect(parseBureauJson(JSON.stringify(d)).ok).toBe(false);
});
