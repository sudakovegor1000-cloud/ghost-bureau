import type { Ghost } from '../engine/types';

/**
 * Пиксельная аватарка 16×16 в духе иконок Windows 95.
 * Детерминирована: цвет и аксессуар — из хэша имени, лицо — из тревожности,
 * детали — из особых условий. Никаких картинок: SVG из пикселей.
 */

const BODY = [
  '......XXXX......',
  '....XXXXXXXX....',
  '...XXXXXXXXXX...',
  '..XXXXXXXXXXXX..',
  '..XXXXXXXXXXXX..',
  '.XXXXXXXXXXXXXX.',
  '.XXXXXXXXXXXXXX.',
  '.XXXXXXXXXXXXXX.',
  '.XXXXXXXXXXXXXX.',
  '.XXXXXXXXXXXXXX.',
  '.XXXXXXXXXXXXXX.',
  '.XXXXXXXXXXXXXX.',
  '.XXXXXXXXXXXXXX.',
  '.XXXXXXXXXXXXXX.',
  '.XX.XXX..XXX.XX.',
  '.X...X....X...X.',
];

// Тело рисуется со смещением, чтобы сверху поместилась шляпа, а сбоку — капли
const OX = 2;
const OY = 4;
const SIZE = 20;

type Px = [number, number];

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const isBody = (x: number, y: number) => BODY[y]?.[x] === 'X';

/** Пиксели одного цвета -> один path (меньше DOM-узлов) */
const path = (px: Px[]) => px.map(([x, y]) => `M${x} ${y}h1v1h-1z`).join('');

const rect = (x0: number, y0: number, w: number, h: number): Px[] => {
  const out: Px[] = [];
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) out.push([x, y]);
  return out;
};

const at = (px: Px[]): Px[] => px.map(([x, y]) => [x + OX, y + OY]);

const ACCESSORIES = ['none', 'tophat', 'bow', 'monocle', 'none', 'chain', 'none', 'bow', 'none'] as const;

export function GhostAvatar({ ghost, size = 40, expired = false }: { ghost: Pick<Ghost, 'name' | 'anxiety' | 'conditions'>; size?: number; expired?: boolean }) {
  const h = hash(ghost.name.trim() || '?');
  const hue = h % 360;
  const accessory = ACCESSORIES[(h >>> 9) % ACCESSORIES.length];
  const blush = (h >>> 5) % 3 === 0;

  const outline: Px[] = [];
  const fill: Px[] = [];
  const shade: Px[] = [];
  for (let y = 0; y < BODY.length; y++) {
    for (let x = 0; x < 16; x++) {
      if (!isBody(x, y)) continue;
      const edge = !isBody(x - 1, y) || !isBody(x + 1, y) || !isBody(x, y - 1) || !isBody(x, y + 1);
      if (edge) outline.push([x, y]);
      else if (x >= 11 || y >= 12) shade.push([x, y]);
      else fill.push([x, y]);
    }
  }

  const black: Px[] = [];
  const white: Px[] = [];
  const red: Px[] = [];
  const pink: Px[] = [];
  const blue: Px[] = [];
  const gold: Px[] = [];

  // Глаза и рот по тревожности
  const a = ghost.anxiety;
  const books = ghost.conditions.includes('lovesBooks');
  if (books) {
    // Очки: белые линзы в оправе, зрачки тем меньше, чем страшнее
    black.push(...rect(2, 4, 5, 1), ...rect(2, 8, 5, 1), [2, 5], [2, 6], [2, 7], [6, 5], [6, 6], [6, 7]);
    black.push(...rect(9, 4, 5, 1), ...rect(9, 8, 5, 1), [9, 5], [9, 6], [9, 7], [13, 5], [13, 6], [13, 7], [7, 5], [8, 5]);
    white.push(...rect(3, 5, 3, 3), ...rect(10, 5, 3, 3));
    if (a >= 8) black.push([4, 6], [11, 6]);
    else black.push(...rect(4, 6, 2, 2), ...rect(11, 6, 2, 2));
  } else if (a <= 3) {
    // Спокоен: закрытые «дугой» глаза
    black.push([4, 6], [5, 5], [6, 6], [9, 6], [10, 5], [11, 6]);
  } else if (a <= 7) {
    black.push(...rect(4, 5, 2, 2), ...rect(9, 5, 2, 2));
  } else {
    // Паника: выпученные глаза с крошечными зрачками
    white.push(...rect(3, 4, 3, 4), ...rect(9, 4, 3, 4));
    black.push([4, 6], [10, 6]);
  }
  if (a <= 3) black.push([6, 10], [7, 11], [8, 11], [9, 10]);
  else if (a <= 7) black.push(...rect(6, 11, 4, 1));
  else {
    black.push([7, 10], [8, 10], [6, 11], [9, 11], [6, 12], [9, 12], [7, 13], [8, 13]);
    red.push([7, 11], [8, 11], [7, 12], [8, 12]);
  }
  if (blush && a <= 7) pink.push([3, 9], [12, 9]);

  // Аксессуары — тоже в координатах тела (шляпа уходит в отрицательные y, капли — за края)
  if (accessory === 'tophat') {
    black.push(...rect(5, -4, 6, 2), ...rect(3, -1, 10, 1));
    red.push(...rect(5, -2, 6, 1));
  } else if (accessory === 'bow') {
    red.push([10, 0], [11, 1], [12, 0], [10, 2], [12, 2], [11, 0], [11, 2]);
  } else if (accessory === 'monocle' && a <= 7 && !books) {
    gold.push([8, 4], [9, 4], [10, 4], [11, 4], [8, 5], [11, 5], [8, 6], [11, 6], [8, 7], [9, 7], [10, 7], [11, 7], [11, 8], [11, 9]);
  } else if (accessory === 'chain') {
    gold.push([2, 12], [3, 12], [4, 13], [5, 12], [6, 13], [7, 12]);
  }
  if (ghost.conditions.includes('lovesDamp')) {
    blue.push([-2, 5], [-2, 6], [-1, 7], [17, 2], [16, 3], [17, 3], [17, 9]);
  }

  const bodyFill = `hsl(${hue} 70% 86%)`;
  const bodyShade = `hsl(${hue} 40% 70%)`;

  return (
    <svg
      className={`ghost-avatar ${a >= 8 ? 'avatar-shaky' : ''} ${expired ? 'avatar-expired' : ''}`}
      width={size}
      height={size}
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      shapeRendering="crispEdges"
      role="img"
      aria-label={`Аватар: ${ghost.name || 'привидение'}`}
    >
      <path d={path(at(fill))} fill={bodyFill} />
      <path d={path(at(shade))} fill={bodyShade} />
      <path d={path(at(outline))} fill="#1a1a1a" />
      <path d={path(at(white))} fill="#fff" />
      <path d={path(at(pink))} fill="#f4a3b4" />
      <path d={path(at(black))} fill="#111" />
      <path d={path(at(red))} fill="#b01515" />
      <path d={path(at(gold))} fill="#d4a017" />
      <path d={path(at(blue))} fill="#2a6fdb" />
    </svg>
  );
}
