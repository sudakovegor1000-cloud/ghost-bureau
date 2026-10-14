import type { ConditionId, FeatureId, Place } from './types';

/** Все числа формулы в одном месте — их же показывает экран «Как считается балл» */
export const RULES = {
  baseScore: 100,
  /** Жёсткий предел: разница температуры больше — не селим */
  maxTempDiff: 10,
  /** Штраф за каждый градус отличия от любимой температуры */
  tempPenaltyPerDegree: 2,
  /** Штраф за каждую единицу освещённости (даже допустимый свет нервирует) */
  lightPenaltyPerUnit: 2,
  /** Шум штрафуется пропорционально тревожности: noise × anxiety / divisor */
  noiseDivisor: 5,
  /** Минимальная влажность для любителей сырости */
  dampMin: 60,
  /** Тишина для needsSilence */
  silenceMaxNoise: 2,
} as const;

/** Допустимая освещённость: чем тревожнее привидение, тем темнее должно быть */
export const maxLightFor = (anxiety: number) => 10 - anxiety;

export const FEATURES: Record<FeatureId, string> = {
  attic: 'Чердак',
  basement: 'Подвал',
  mirrors: 'Зеркала',
  books: 'Книги',
  stage: 'Сцена',
  water: 'Рядом вода',
};

/**
 * Особое условие заявки. Как в ТЗ: если место с ним конфликтует,
 * переселить туда нельзя, и оператор видит причину.
 */
export interface ConditionDef {
  label: string;
  /** Текст конфликта или null, если место условию подходит */
  violation: (p: Place) => string | null;
  /** Короткий «плюс» для объяснения выбора */
  okText: string;
}

export const CONDITIONS: Record<ConditionId, ConditionDef> = {
  needsAttic: {
    label: 'Нужен чердак',
    violation: (p) => (p.features.includes('attic') ? null : 'нет чердака'),
    okText: 'есть чердак',
  },
  needsBasement: {
    label: 'Нужен подвал',
    violation: (p) => (p.features.includes('basement') ? null : 'нет подвала'),
    okText: 'есть подвал',
  },
  fearsMirrors: {
    label: 'Боится зеркал',
    violation: (p) => (p.features.includes('mirrors') ? 'есть зеркала' : null),
    okText: 'нет зеркал',
  },
  noHumans: {
    label: 'Нельзя рядом с людьми',
    violation: (p) => (p.hasHumans ? 'живут люди' : null),
    okText: 'людей нет',
  },
  needsSilence: {
    label: 'Нужна тишина',
    violation: (p) =>
      p.noise > RULES.silenceMaxNoise ? `шумно: ${p.noise}, нужно не больше ${RULES.silenceMaxNoise}` : null,
    okText: 'тихо',
  },
  lovesDamp: {
    label: 'Любит сырость',
    violation: (p) =>
      p.humidity < RULES.dampMin ? `сухо: влажность ${p.humidity}%, нужно от ${RULES.dampMin}%` : null,
    okText: 'сыро',
  },
  lovesBooks: {
    label: 'Любит книги',
    violation: (p) => (p.features.includes('books') ? null : 'нет книг'),
    okText: 'есть книги',
  },
};

export const CONDITION_IDS = Object.keys(CONDITIONS) as ConditionId[];
export const FEATURE_IDS = Object.keys(FEATURES) as FeatureId[];
