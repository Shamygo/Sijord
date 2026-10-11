/**
 * Terrain worker: builds patch vertex data (and, for level-0 chunks, the scatter of trees,
 * bushes and rocks) off the main thread. Messages are { id, level, ix, iz }.
 */
import { buildPatch, patchTransferables } from './patch';
import { scatterChunk, scatterTransferables } from './scatter';

/** The worker scope, typed locally (the webworker lib would clash with the DOM lib project-wide). */
const scope = self as unknown as {
  onmessage: ((e: MessageEvent<{ id: number; level: number; ix: number; iz: number }>) => void) | null;
  postMessage(message: unknown, transfer: Transferable[]): void;
};

scope.onmessage = (e) => {
  const { id, level, ix, iz } = e.data;
  const patch = buildPatch(level, ix, iz);
  const scatter = level === 0 && patch.l0 ? scatterChunk(ix, iz, patch.l0) : undefined;
  const transfer = patchTransferables(patch);
  if (scatter) transfer.push(...scatterTransferables(scatter));
  scope.postMessage({ id, patch, scatter }, transfer);
};
