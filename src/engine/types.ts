export type ConditionId =
  | 'needsAttic'
  | 'needsBasement'
  | 'fearsMirrors'
  | 'noHumans'
  | 'needsSilence'
  | 'lovesDamp'
  | 'lovesBooks';

export type FeatureId = 'attic' | 'basement' | 'mirrors' | 'books' | 'stage' | 'water';

export interface Ghost {
  id: string;
  name: string;
  /** 1 — невозмутим, 10 — паникует от скрипа половицы */
  anxiety: number;
  /** °C */
  favoriteTemp: number;
  /** YYYY-MM-DD, последний допустимый день переселения */
  deadline: string;
  conditions: ConditionId[];
  note?: string;
}

export interface Place {
  id: string;
  name: string;
  emoji: string;
  capacity: number;
  /** 0 — кромешная тьма, 10 — прожектор маяка */
  light: number;
  /** 0 — гробовая тишина, 10 — типографский станок */
  noise: number;
  /** % */
  humidity: number;
  /** °C */
  temperature: number;
  hasHumans: boolean;
  features: FeatureId[];
  /** Ограничение места: не принимает привидений тревожнее этого уровня. null — без ограничения */
  maxAnxiety: number | null;
  note?: string;
}

export interface BureauData {
  /** «Сегодня» бюро, YYYY-MM-DD. Фиксировано в данных, чтобы демо не «протухало» со временем */
  today: string;
  ghosts: Ghost[];
  places: Place[];
  /** Ручные решения оператора: ghostId -> placeId */
  overrides: Record<string, string>;
  /**
   * Заявки, которые уже прошли автоматическое распределение.
   * Остальные — «новые»: бюро их ещё не обрабатывало, и они не занимают мест, пока оператор не запустит распределение.
   */
  processed: string[];
  /**
   * Заявки, которые оператор поселил сверх вместимости (подтвердил в окне «Место заполнено»).
   * Они не занимают мест нынешних жильцов — место просто становится переполненным.
   */
  overCapacity?: string[];
}
