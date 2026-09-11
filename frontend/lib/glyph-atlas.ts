// Rasterize each glyph/color pair once, then copy pixels instead of shaping
// thousands of tiny text runs every frame. Padding preserves glyph overhang.
export class GlyphAtlas {
  private sprites = new Map<string, { canvas: HTMLCanvasElement; x: number; y: number }>();
  private pages: HTMLCanvasElement[] = [];
  private used = 0;
  private padding = 3;
  private tileWidth: number;
  private tileHeight: number;
  private columns: number;
  private capacity: number;

  constructor(private cw: number, private ch: number, private font: string, private dpr: number) {
    this.padding = Math.ceil(this.padding * dpr) / dpr;
    this.tileWidth = Math.ceil((cw + this.padding * 2) * dpr);
    this.tileHeight = Math.ceil((ch + this.padding * 2) * dpr);
    this.columns = Math.floor(1024 / this.tileWidth);
    this.capacity = this.columns * Math.floor(1024 / this.tileHeight);
  }

  draw(ctx: CanvasRenderingContext2D, glyph: string, color: string, x: number, y: number) {
    const key = glyph + color;
    let sprite = this.sprites.get(key);
    if (!sprite) {
      // Bound retained canvas memory even if future materials generate colors.
      if (this.used >= this.capacity * 4) {
        this.sprites.clear();
        this.pages = [];
        this.used = 0;
      }
      const pageIndex = Math.floor(this.used / this.capacity);
      let page = this.pages[pageIndex];
      if (!page) {
        page = document.createElement('canvas');
        page.width = page.height = 1024;
        this.pages.push(page);
      }
      const paint = page.getContext('2d');
      if (!paint) {
        ctx.fillStyle = color;
        ctx.fillText(glyph, x, y);
        return;
      }
      const slot = this.used++ % this.capacity;
      const sx = (slot % this.columns) * this.tileWidth;
      const sy = Math.floor(slot / this.columns) * this.tileHeight;
      paint.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      paint.font = this.font;
      paint.textBaseline = 'top';
      paint.fillStyle = color;
      paint.fillText(glyph, sx / this.dpr + this.padding, sy / this.dpr + this.padding);
      sprite = { canvas: page, x: sx, y: sy };
      this.sprites.set(key, sprite);
    }
    ctx.drawImage(sprite.canvas, sprite.x, sprite.y, this.tileWidth, this.tileHeight,
      x - this.padding, y - this.padding, this.tileWidth / this.dpr, this.tileHeight / this.dpr);
  }
}
