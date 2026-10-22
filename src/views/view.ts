/** What main.ts needs from each visualisation. */
export interface View {
  resize(): void;
  /** Brings a node into view, if the view can. */
  focus(id: string): void;
  zoomBy(factor: number): void;
  reset(): void;
}
