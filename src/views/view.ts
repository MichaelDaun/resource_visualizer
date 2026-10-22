/** What main.ts needs from each visualisation. */
export interface View {
  resize(): void;
  /** Brings a node into view, if the view can. */
  focus(id: string): void;
  /** Brings a place (county, municipality, area) into view, if the view can. */
  focusPlace?(id: string): void;
  zoomBy(factor: number): void;
  reset(): void;
}

export function reducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
