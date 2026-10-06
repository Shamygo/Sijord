import './ui/styles.css';
import { preloadGameplayAssets, assetStatus, loadRegionalModels } from './assets/loader';
import { Game } from './core/game';
import { loadSave, writeSave } from './core/save';
import { showCreator } from './ui/creator';
import { h } from './ui/dom';
import { showTitle } from './ui/title';

async function boot(): Promise<void> {
  const app = document.getElementById('app')!;
  const params = new URLSearchParams(location.search);
  const saved = loadSave();
  const title = await showTitle(app, !!saved, params.get('room') ?? saved?.room ?? 'bramblewick');
  const profile = title.continueSaved && saved ? saved.profile : await showCreator(app, saved?.profile);
  const sameTrainer = title.continueSaved && saved;
  // Continuing keeps everything (party, bag, flags); a new trainer starts fresh.
  const save = sameTrainer ? { ...saved, profile, room: title.room } : { profile, room: title.room, flags: [] };
  writeSave(save);
  // Building the world takes a moment; paint a loading screen first.
  const loading = h('div.screen', { style: 'z-index:50' }, h('div.title-card', {}, h('h1.logo', {}, 'Sijord'), h('p.subtitle', {}, 'Growing the world...')));
  app.append(loading);
  await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 30)));
  // The saved party's and box's models must be in before the world is built; the rest of the
  // region's species follow in the background.
  const owned = [...(save.party ?? []), ...(save.box ?? [])].map((c) => c?.species).filter((s): s is string => typeof s === 'string');
  await preloadGameplayAssets(owned);
  const game = new Game(app, save);
  await game.start();
  loading.remove();
  if (assetStatus.failed.size) game.showAssetFallback();
  void loadRegionalModels();
  Object.assign(window, { render_game_to_text: () => game.debugText(), advanceTime: (ms: number) => game.debugAdvance(ms) });
  if (import.meta.env.DEV) (window as unknown as { sijord: Game }).sijord = game;
}

void boot();
