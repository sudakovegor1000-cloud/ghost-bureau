import { useCallback, useState } from 'react';
import { SCENARIOS } from './data/demo';
import type { BureauData, Ghost, Place } from './engine/types';
import { parseBureauJson, validateBureauData } from './engine/validate';

/**
 * Состояние бюро живёт только в памяти страницы: каждое открытие и обновление — чистое демо.
 * Так проверяющий всегда видит один и тот же сценарий. Сохранить работу — «Экспорт», вернуть — «Импорт».
 */

export interface Notice {
  kind: 'error' | 'info';
  title: string;
  lines: string[];
}

const demoData = () => SCENARIOS[0].build() as BureauData;

export const newId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export function useBureau() {
  const [data, setData] = useState<BureauData>(demoData);
  const [notice, setNotice] = useState<Notice | null>(null);
  /** Какой сценарий загружен; null — данные правили вручную или загрузили из файла */
  const [scenario, setScenario] = useState<string | null>('demo');

  /** Любая ручная правка: данные уже не совпадают со сценарием */
  const edit = useCallback((fn: (d: BureauData) => BureauData) => {
    setData(fn);
    setScenario(null);
  }, []);

  const upsertGhost = useCallback((g: Ghost) => {
    edit((d) => {
      const exists = d.ghosts.some((x) => x.id === g.id);
      return { ...d, ghosts: exists ? d.ghosts.map((x) => (x.id === g.id ? g : x)) : [...d.ghosts, g] };
    });
  }, [edit]);

  const deleteGhost = useCallback((id: string) => {
    edit((d) => {
      const { [id]: _removed, ...overrides } = d.overrides;
      return {
        ...d,
        ghosts: d.ghosts.filter((g) => g.id !== id),
        overrides,
        processed: d.processed.filter((x) => x !== id),
        overCapacity: (d.overCapacity ?? []).filter((x) => x !== id),
      };
    });
  }, [edit]);

  const upsertPlace = useCallback((p: Place) => {
    edit((d) => {
      const exists = d.places.some((x) => x.id === p.id);
      return { ...d, places: exists ? d.places.map((x) => (x.id === p.id ? p : x)) : [...d.places, p] };
    });
  }, [edit]);


  /** overCapacity — оператор подтвердил заселение сверх вместимости: нынешних жильцов не трогаем */
  const setOverride = useCallback((ghostId: string, placeId: string | null, overCapacity = false) => {
    edit((d) => {
      const overrides = { ...d.overrides };
      if (placeId) overrides[ghostId] = placeId;
      else delete overrides[ghostId];
      const over = (d.overCapacity ?? []).filter((id) => id !== ghostId);
      if (placeId && overCapacity) over.push(ghostId);
      return { ...d, overrides, overCapacity: over };
    });
  }, [edit]);

  /** «Расселить автоматически»: все новые заявки проходят распределение. Данные уже не исходный сценарий — его можно выбрать заново */
  const runAuto = useCallback(() => edit((d) => ({ ...d, processed: d.ghosts.map((g) => g.id) })), [edit]);

  const resetOverrides = useCallback(() => edit((d) => ({ ...d, overrides: {}, overCapacity: [] })), [edit]);

  const setToday = useCallback((today: string) => edit((d) => ({ ...d, today })), [edit]);

  /** Импорт: при ошибке текущие данные не трогаем */
  const importJson = useCallback((text: string, source: string): boolean => {
    const parsed = parseBureauJson(text);
    if (!parsed.ok) {
      setNotice({ kind: 'error', title: `Не удалось загрузить ${source} — текущие данные не изменены`, lines: parsed.errors });
      return false;
    }
    setData(parsed.data);
    setScenario(null);
    setNotice({ kind: 'info', title: `Загружено: ${source}`, lines: [] });
    return true;
  }, []);

  const loadScenario = useCallback(
    (id: string) => {
      const s = SCENARIOS.find((x) => x.id === id);
      if (!s) return;
      const built = s.build();
      if (typeof built === 'string') {
        importJson(built, `сценарий «${s.title}»`);
        return;
      }
      const checked = validateBureauData(built);
      if (checked.ok) {
        setData(checked.data);
        setScenario(s.id);
        setNotice({ kind: 'info', title: `Сценарий «${s.title}»`, lines: [s.hint] });
      }
    },
    [importJson],
  );

  return {
    data,
    scenario,
    notice,
    setNotice,
    upsertGhost,
    deleteGhost,
    upsertPlace,
    setOverride,
    resetOverrides,
    runAuto,
    setToday,
    importJson,
    loadScenario,
  };
}
