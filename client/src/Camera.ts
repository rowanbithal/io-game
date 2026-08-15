import { MAP_SIZE } from '@io-game/shared';

export class Camera {
  x = 0; // World-space position of the top-left of the viewport
  y = 0;
  zoom = 1.6; // >1 zooms in (renders the world larger, shows less of it)

  follow(playerX: number, playerY: number, vpW: number, vpH: number): void {
    const viewW = vpW / this.zoom;
    const viewH = vpH / this.zoom;
    this.x = Math.max(0, Math.min(MAP_SIZE - viewW, playerX - viewW / 2));
    this.y = Math.max(0, Math.min(MAP_SIZE - viewH, playerY - viewH / 2));
  }

  /** World → screen (pre-zoom-scale; the renderer applies ctx.scale(zoom)). */
  toScreen(wx: number, wy: number): { sx: number; sy: number } {
    return { sx: wx - this.x, sy: wy - this.y };
  }

  /** Screen (actual canvas pixels) → world (useful for mouse hit-testing). */
  toWorld(sx: number, sy: number): { wx: number; wy: number } {
    return { wx: sx / this.zoom + this.x, wy: sy / this.zoom + this.y };
  }
}
