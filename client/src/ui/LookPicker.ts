import { HAIR_COLORS, SKIN_COLORS, HATS, PlayerLook, DEFAULT_LOOK, sanitizeLook } from '@io-game/shared';

// ── Main-menu look picker ────────────────────────────────────────────────────
// The hair / skin / hat rows on the main menu and the little head preview
// beside them. Pure DOM plus one pixel canvas — nothing here touches the game
// renderer, which draws looks in-world on its own (see PlayerState.look).
// The choice (and the name typed above Play) is remembered across visits in
// localStorage, so returning players land on their own character.

const LOOK_KEY = 'io-game.look';
const NAME_KEY = 'io-game.name';

/** Preview canvas resolution in art pixels — scaled up crisply by CSS. */
const PREVIEW_PX = 32;

export class LookPicker {
  private look: PlayerLook;
  private readonly preview: HTMLCanvasElement;
  private readonly hatCanvases: HTMLCanvasElement[] = [];
  private readonly rows: { el: HTMLElement; key: keyof PlayerLook }[] = [];

  constructor() {
    this.look = loadLook();
    this.preview = document.getElementById('look-preview') as HTMLCanvasElement;
    this.preview.width = PREVIEW_PX;
    this.preview.height = PREVIEW_PX;

    this.buildRow('look-hair', 'hair', HAIR_COLORS.map((h) => ({ name: h.name, color: h.palette.base, ring: h.palette.dark })));
    this.buildRow('look-skin', 'skin', SKIN_COLORS.map((s) => ({ name: s.name, color: s.color, ring: shade(s.color, -0.3) })));
    this.buildHatRow();
    this.refresh();
  }

  /** The current pick, as sent with the join request. */
  get current(): PlayerLook {
    return { ...this.look };
  }

  /** The name remembered from last time, or '' — for prefilling #name-input. */
  static savedName(): string {
    try {
      return localStorage.getItem(NAME_KEY) ?? '';
    } catch {
      return '';
    }
  }

  static saveName(name: string): void {
    try {
      localStorage.setItem(NAME_KEY, name);
    } catch {
      /* storage blocked (private window etc.) — just don't remember it */
    }
  }

  // ── Building ───────────────────────────────────────────────────────────────

  private buildRow(id: string, key: 'hair' | 'skin', options: { name: string; color: string; ring: string }[]): void {
    const el = document.getElementById(id)!;
    options.forEach((o, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'look-swatch';
      b.title = o.name;
      b.setAttribute('aria-label', `${key === 'hair' ? 'Hair' : 'Skin'}: ${o.name}`);
      b.style.background = o.color;
      b.style.setProperty('--ring', o.ring);
      b.addEventListener('click', () => this.pick(key, i));
      el.appendChild(b);
    });
    this.rows.push({ el, key });
  }

  /** Hats get a tiny head-and-hat icon each rather than a flat swatch. */
  private buildHatRow(): void {
    const el = document.getElementById('look-hat')!;
    HATS.forEach((h, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'look-hat';
      b.title = h.name;
      b.setAttribute('aria-label', `Hat: ${h.name}`);
      const c = document.createElement('canvas');
      c.width = PREVIEW_PX;
      c.height = PREVIEW_PX;
      b.appendChild(c);
      this.hatCanvases.push(c);
      b.addEventListener('click', () => this.pick('hat', i));
      el.appendChild(b);
    });
    this.rows.push({ el, key: 'hat' });
  }

  private pick(key: keyof PlayerLook, i: number): void {
    this.look = { ...this.look, [key]: i };
    try {
      localStorage.setItem(LOOK_KEY, JSON.stringify(this.look));
    } catch {
      /* not remembered — still used for this join */
    }
    this.refresh();
    // A little squash on the preview so a click visibly lands.
    this.preview.classList.remove('bump');
    void this.preview.offsetWidth; // restart the CSS animation
    this.preview.classList.add('bump');
  }

  /** Re-marks the selected swatch in each row and redraws every head. */
  private refresh(): void {
    for (const { el, key } of this.rows) {
      Array.from(el.children).forEach((c, i) => c.classList.toggle('selected', i === this.look[key]));
    }
    drawHead(this.preview.getContext('2d')!, this.look);
    // Each hat button shows that hat on the current hair/skin.
    this.hatCanvases.forEach((c, i) => drawHead(c.getContext('2d')!, { ...this.look, hat: i }));
  }
}

function loadLook(): PlayerLook {
  try {
    const raw = localStorage.getItem(LOOK_KEY);
    if (raw) return sanitizeLook(JSON.parse(raw));
  } catch {
    /* missing, corrupt or blocked — fall through to the default */
  }
  return { ...DEFAULT_LOOK };
}

// ── Pixel drawing ────────────────────────────────────────────────────────────

/**
 * A top-down head on a PREVIEW_PX grid, facing right (+x, same as in-game):
 * a round mop of hair shaded light-from-the-top-left in the hair palette's
 * three tones, two skin-toned hands out front, and the hat on top. Drawn a
 * pixel at a time so it reads as the same chunky pixel art as the world.
 */
function drawHead(ctx: CanvasRenderingContext2D, look: PlayerLook): void {
  const hair = HAIR_COLORS[look.hair]?.palette ?? HAIR_COLORS[0].palette;
  const skin = SKIN_COLORS[look.skin]?.color ?? SKIN_COLORS[0].color;
  const hat = HATS[look.hat]?.id ?? 'none';
  ctx.clearRect(0, 0, PREVIEW_PX, PREVIEW_PX);

  const cx = 14.5;
  const cy = 15.5;
  const R = 9.5;

  // Hands first, so the head overlaps their inner edge.
  disc(ctx, 23.5, 8.5, 3, skin, shade(skin, -0.28));
  disc(ctx, 23.5, 22.5, 3, skin, shade(skin, -0.28));

  // Head: three-tone shading by which way each pixel faces.
  shadedDisc(ctx, cx, cy, R, hair.light, hair.base, hair.dark);

  switch (hat) {
    case 'cap': {
      // Crown of the cap over the back of the head, brim jutting forward.
      shadedDisc(ctx, cx - 1, cy, 7.5, '#f0625a', '#d63b33', '#9c2620');
      for (let y = 11; y <= 20; y++) {
        for (let x = 20; x <= 25; x++) {
          const edge = Math.abs(y - cy) > 3.5 && x > 22;
          if (edge) continue;
          ctx.fillStyle = x === 25 || y === 11 || y === 20 ? '#7a1c17' : '#b52d26';
          ctx.fillRect(x, y, 1, 1);
        }
      }
      px(ctx, cx - 1, cy, '#ffd9d6'); // the button on top
      break;
    }
    case 'beanie': {
      // Knitted dome over most of the head — ribbed in alternating rows —
      // with a fluffy pompom on top.
      for (let y = 0; y < PREVIEW_PX; y++) {
        for (let x = 0; x < PREVIEW_PX; x++) {
          const dx = x + 0.5 - (cx - 0.5);
          const dy = y + 0.5 - cy;
          const d = Math.hypot(dx, dy);
          if (d > 8.5) continue;
          const lit = (-dx - dy) / (d || 1);
          const base = (x + y) % 3 === 0 ? '#2a8f86' : '#33a99f';
          ctx.fillStyle = d > 7.6 ? '#1d6a63' : lit > 0.5 && d > 4 ? '#55c7bc' : base;
          ctx.fillRect(x, y, 1, 1);
        }
      }
      shadedDisc(ctx, cx - 0.5, cy, 2.6, '#ffffff', '#eef2f2', '#c9d2d2');
      break;
    }
    case 'crown': {
      // A gold ring seen from above with five points, a ruby in the middle.
      for (let y = 0; y < PREVIEW_PX; y++) {
        for (let x = 0; x < PREVIEW_PX; x++) {
          const dx = x + 0.5 - cx;
          const dy = y + 0.5 - cy;
          const d = Math.hypot(dx, dy);
          const a = Math.atan2(dy, dx);
          const spike = 6.2 + 1.6 * Math.max(0, Math.cos(a * 5));
          if (d < 4.4 || d > spike) continue;
          ctx.fillStyle = d > spike - 0.9 ? '#b8860b' : (-dx - dy) / d > 0.3 ? '#ffe680' : '#f2c230';
          ctx.fillRect(x, y, 1, 1);
        }
      }
      disc(ctx, cx, cy, 1.6, '#e0303a', '#8a1018');
      break;
    }
    case 'flower': {
      // One flower tucked behind where the ear would be.
      const fx = 10.5;
      const fy = 8.5;
      for (const [ox, oy] of [[0, -2], [2, 0], [0, 2], [-2, 0]]) disc(ctx, fx + ox, fy + oy, 1.6, '#ffa6cf', '#e0609e');
      disc(ctx, fx, fy, 1.2, '#ffe14d', '#d9a820');
      break;
    }
    default:
      break;
  }
}

/** Filled pixel disc with a one-pixel darker rim. */
function disc(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, fill: string, rim: string): void {
  for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
    for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      if (d > r) continue;
      ctx.fillStyle = d > r - 1 ? rim : fill;
      ctx.fillRect(x, y, 1, 1);
    }
  }
}

/** A pixel disc lit from the top-left: light / base / dark bands plus a dark rim. */
function shadedDisc(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, light: string, base: string, dark: string): void {
  for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
    for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      const d = Math.hypot(dx, dy);
      if (d > r) continue;
      // How much this pixel faces the light, -1..1, weighted toward the rim.
      const facing = ((-dx - dy) / Math.SQRT2 / r) * 1.4;
      ctx.fillStyle = d > r - 1 ? dark : facing > 0.45 ? light : facing < -0.5 ? dark : base;
      ctx.fillRect(x, y, 1, 1);
    }
  }
}

function px(ctx: CanvasRenderingContext2D, x: number, y: number, color: string): void {
  ctx.fillStyle = color;
  ctx.fillRect(Math.floor(x), Math.floor(y), 1, 1);
}

/** Lightens (amt > 0) or darkens (amt < 0) a #rrggbb color. */
function shade(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (c: number): number => Math.round(Math.max(0, Math.min(255, amt < 0 ? c * (1 + amt) : c + (255 - c) * amt)));
  const r = f((n >> 16) & 255);
  const g = f((n >> 8) & 255);
  const b = f(n & 255);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}
