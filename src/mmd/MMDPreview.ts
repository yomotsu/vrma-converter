/** Enable the diagnostic MMD preview with the `?MMD` URL flag. */
export function isMmdPreviewEnabled(search: string): boolean {
  return new URLSearchParams(search).has('MMD');
}

export const MMD_PREVIEW_ENABLED = typeof window !== 'undefined'
  && isMmdPreviewEnabled(window.location.search);

export type MMDPreviewPlayer = {
  playVmd(file: File): Promise<void>;
  setTime(time: number): void;
  update(delta: number): void;
};

export type MMDPreviewController = {
  playVmd: ((file: File) => Promise<void>) | null;
  setTime(time: number): void;
  update(delta: number): void;
};

export function createMmdPreviewController(
  enabled: boolean,
  player: MMDPreviewPlayer | null,
): MMDPreviewController {
  const activePlayer = enabled ? player : null;
  return {
    playVmd: activePlayer == null ? null : (file) => activePlayer.playVmd(file),
    setTime: activePlayer == null ? () => undefined : (time) => activePlayer.setTime(time),
    update: activePlayer == null ? () => undefined : (delta) => activePlayer.update(delta),
  };
}
