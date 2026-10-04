import './ui/styles.css';
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
  const save = { profile, room: title.room, flags: sameTrainer ? saved.flags : [] };
  writeSave(save);
  // Building the world takes a moment; paint a loading screen first.
  const loading = h('div.screen', { style: 'z-index:50' }, h('div.title-card', {}, h('h1.logo', {}, 'Sijord'), h('p.subtitle', {}, 'Growing the world...')));
  app.append(loading);
  await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 30)));
  const game = new Game(app, save);
  await game.start();
  loading.remove();
  if (import.meta.env.DEV) (window as unknown as { sijord: Game }).sijord = game;
}

void boot();
