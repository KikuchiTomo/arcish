// Screen geometry: the work area of the display a window is on.
export class DisplayService {
  #api;

  constructor({ api }) {
    this.#api = api;
  }

  // Work area of the display that contains the centre of `win`.
  async workAreaFor(win) {
    const displays = await this.#api.system.display.getInfo();
    const cx = (win?.left ?? 0) + (win?.width ?? 0) / 2;
    const cy = (win?.top ?? 0) + (win?.height ?? 0) / 2;
    const inside = ({ bounds: b }) => cx >= b.left && cx < b.left + b.width && cy >= b.top && cy < b.top + b.height;
    return (displays.find(inside) || displays.find((d) => d.isPrimary) || displays[0]).workArea;
  }
}
