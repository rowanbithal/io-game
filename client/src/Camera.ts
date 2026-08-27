import { MAP_SIZE } from '@io-game/shared';

const GAMEPLAY_ZOOM = 1.6; // >1 zooms in (renders the world larger, shows less of it)

export class Camera {
  x = 0; // World-space position of the top-left of the viewport
  y = 0;
  zoom = GAMEPLAY_ZOOM;

  /**
   * Resets zoom to the normal gameplay level on every call rather than
   * trusting whatever it was left at — frameMap (the /camera full-map view)
   * zooms out by changing this.zoom, and follow() is the only path back to
   * normal, so it has to be the one undoing that rather than leaving zoom
   * stuck until something else happens to touch it.
   */
  follow(playerX: number, playerY: number, vpW: number, vpH: number): void {
    this.zoom = GAMEPLAY_ZOOM;
    const viewW = vpW / this.zoom;
    const viewH = vpH / this.zoom;
    this.x = Math.max(0, Math.min(MAP_SIZE - viewW, playerX - viewW / 2));
    this.y = Math.max(0, Math.min(MAP_SIZE - viewH, playerY - viewH / 2));
  }

  /**
   * Zooms out and centers so the whole map fits in the viewport at once —
   * used by the /camera full-map view. Whichever axis has slack (the
   * viewport's aspect ratio rarely matches the map's exactly) gets
   * letterboxed evenly rather than cropped, hence the negative x/y that
   * follow() would never produce.
   */
  frameMap(mapSize: number, vpW: number, vpH: number): void {
    this.zoom = Math.min(vpW / mapSize, vpH / mapSize);
    const viewW = vpW / this.zoom;
    const viewH = vpH / this.zoom;
    this.x = (mapSize - viewW) / 2;
    this.y = (mapSize - viewH) / 2;
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
