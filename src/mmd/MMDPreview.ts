export const MMD_PREVIEW_ENABLED = false;

export type MMDPreviewPlayer = {
  playVmd(file: File): Promise<void>;
  update(delta: number): void;
};

export type MMDPreviewController = {
  playVmd: ((file: File) => Promise<void>) | null;
  update(delta: number): void;
};

export function createMmdPreviewController(
  enabled: boolean,
  player: MMDPreviewPlayer | null,
): MMDPreviewController {
  const activePlayer = enabled ? player : null;
  return {
    playVmd: activePlayer == null ? null : (file) => activePlayer.playVmd(file),
    update: activePlayer == null ? () => undefined : (delta) => activePlayer.update(delta),
  };
}
