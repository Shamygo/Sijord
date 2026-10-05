import catalogue from '../assets/pokemon-catalogue.json';
import { assetUrl } from '../assets/loader';
import { creatureStats, displayName, isUsable, maxHp } from '../../shared/battle/creature';
import { NATURES } from '../../shared/battle/natures';
import { xpForLevel } from '../../shared/battle/stats';
import type { Creature, StatName } from '../../shared/battle/types';
import { ABILITIES } from '../../shared/data/abilities';
import { moveData } from '../../shared/data/moves';
import { species } from '../../shared/data/species';
import { ITEMS, ITEM_CATEGORIES, type ItemCategory } from '../../shared/items';
import { TYPE_COLORS } from '../battle/fx';
import { STATUS_LABEL } from '../battle/ui';
import { ACTION_LABELS, DEFAULT_SETTINGS, keyLabel, rebind, type Action, type Settings } from '../core/settings';
import type { World } from '../world/types';
import { h } from './dom';
import type { Quest } from './hud';
import type { Minimap } from './minimap';

export type MenuTab = 'map' | 'bag' | 'party' | 'quests' | 'settings' | 'pokedex';

export interface MenuDeps {
  world: World;
  minimap: Minimap;
  player(): { x: number; z: number; yaw: number };
  partner(): { x: number; z: number; name: string } | null;
  destination(): {x:number;z:number;label:string} | null;
  setDestination(p: {x:number;z:number;label:string} | null): void;
  quests(): Quest[];
  bag(): Record<string, number>;
  party(): Creature[];
  portrait(species: string): string;
  trainerPortrait(): Promise<string>;
  useItem(id: string, uid: string): boolean;
  /** The party order changed in the menu. */
  onPartyChanged(): void;
  levelCap(): number;
  settings: Settings;
  onSettings(s: Settings): void;
  onSave(): void;
  onResume(): void;
  onQuitToTitle(): void;
}

const TABS: { id: MenuTab; label: string; action?: Action }[] = [
  { id: 'map', label: 'Map', action: 'map' },
  { id: 'bag', label: 'Bag', action: 'bag' },
  { id: 'party', label: 'Party', action: 'party' },
  { id: 'quests', label: 'Quests', action: 'quests' },
  { id: 'pokedex', label: 'Pokédex' },
  { id: 'settings', label: 'Settings' },
];

/** Full-screen menu with tabs: map, bag, party, quests and settings (also the pause screen). */
export class GameMenu {
  readonly el = h('div.menu');
  private tabBar = h('div.menu-tabs');
  private body = h('div.menu-body');
  private tab: MenuTab = 'map';
  private open_ = false;
  private bagCategory: ItemCategory = 'items';
  private selectedItem: string | null = null;
  private selectedMon = 0;
  private listening: Action | null = null;
  private map: MapView | null = null;
  private trainerImage = '';
  private itemTarget = false;

  constructor(private deps: MenuDeps) {
    void deps.trainerPortrait().then(src => {this.trainerImage = src; if (this.open_ && this.tab === 'party') this.render();});
    this.el.append(
      h('div.menu-panel', {}, h('div.menu-head', {}, this.tabBar, h('button.act', {onclick: (e: Event)=>{this.deps.onSave();const button=e.currentTarget as HTMLButtonElement;button.textContent='Saved';setTimeout(()=>{button.textContent='Save progress';},1500);}}, 'Save progress'), h('button.menu-close', { onclick: () => this.close(), title: 'Close (Esc)' }, '✕')), this.body, h('div.menu-footer', {}, 'Esc · Back to exploring')),
    );
    this.el.addEventListener('mousedown', (e) => {
      if (e.target === this.el) this.close();
    });
    // Capture so a key press while rebinding never reaches the game.
    addEventListener('keydown', (e) => this.onKey(e), true);
  }

  get isOpen(): boolean {
    return this.open_;
  }

  get current(): MenuTab {
    return this.tab;
  }

  open(tab: MenuTab): void {
    this.tab = tab;
    this.open_ = true;
    this.el.classList.add('show');
    this.render();
  }

  close(): void {
    if (!this.open_) return;
    this.open_ = false;
    this.listening = null;
    this.el.classList.remove('show');
    this.map?.dispose();
    this.map = null;
    this.deps.onResume();
  }

  /** Same key that opened a tab closes it; another menu key switches tabs. */
  toggle(tab: MenuTab): void {
    if (this.open_ && this.tab === tab) this.close();
    else this.open(tab);
  }

  /** Redraw after the data behind the open tab changed. */
  refresh(): void {
    if (this.open_ && this.tab === 'party') this.render();
  }

  /** Called each frame while open so the map shows live positions. */
  update(): void {
    this.map?.draw();
  }

  private onKey(e: KeyboardEvent): void {
    if (!this.open_) return;
    if (this.listening) {
      e.preventDefault();
      e.stopPropagation();
      if (e.code !== 'Escape') {
        this.deps.settings.keys = rebind(this.deps.settings.keys, this.listening, e.code);
        this.deps.onSettings(this.deps.settings);
      }
      this.listening = null;
      this.render();
      return;
    }
    if (e.code === 'Escape') {
      // Stop here so the game doesn't read the same Esc as "pause" and reopen the menu.
      e.preventDefault();
      e.stopPropagation();
      this.close();
    }
  }

  private render(): void {
    this.tabBar.replaceChildren(
      ...TABS.map((t) =>
        h(
          'button.menu-tab' + (t.id === this.tab ? '.on' : ''),
          { onclick: () => this.open(t.id) },
          t.label,
          t.action ? h('span.key', {}, keyLabel(this.deps.settings.keys[t.action])) : null,
        ),
      ),
    );
    this.map?.dispose();
    this.map = null;
    switch (this.tab) {
      case 'map':
        this.map = new MapView(this.deps);
        this.body.replaceChildren(this.map.el);
        requestAnimationFrame(() => this.map?.draw());
        break;
      case 'bag':
        this.body.replaceChildren(this.renderBag());
        break;
      case 'party':
        this.body.replaceChildren(this.renderParty());
        break;
      case 'quests':
        this.body.replaceChildren(this.renderQuests());
        break;
      case 'pokedex':
        this.body.replaceChildren(this.renderPokedex());
        break;
      case 'settings':
        this.body.replaceChildren(this.renderSettings());
        break;
    }
  }

  private renderBag(): HTMLElement {
    const bag = this.deps.bag();
    const entries = Object.entries(bag).filter(([id, n]) => n > 0 && ITEMS[id]?.category === this.bagCategory);
    const selected = this.selectedItem && ITEMS[this.selectedItem]?.category === this.bagCategory ? this.selectedItem : entries[0]?.[0] ?? null;
    const info = selected ? ITEMS[selected] : null;
    return h(
      'div.bag',
      {},
      h(
        'div.bag-cats',
        {},
        ...ITEM_CATEGORIES.map((c) =>
          h('button.chip' + (c.id === this.bagCategory ? '.on' : ''), {
            onclick: () => {
              this.bagCategory = c.id;
              this.selectedItem = null;
              this.render();
            },
          }, c.label),
        ),
      ),
      h(
        'div.bag-main',
        {},
        h(
          'div.bag-grid',
          {},
          ...(entries.length
            ? entries.map(([id, n]) =>
                h('button.bag-slot' + (id === selected ? '.on' : ''), {
                  onclick: () => {
                    this.selectedItem = id;
                    this.render();
                  },
                }, this.itemArt(id), h('span.bag-count', {}, `×${n}`)),
              )
            : [h('p.empty', {}, 'Nothing here yet.')]),
        ),
        h(
          'div.bag-detail',
          {},
          info ? h('h3', {}, this.itemArt(selected!), info.name) : h('h3', {}, 'Bag'),
          h('p', {}, info ? info.description : 'Gather materials out in the wild, and buy supplies in towns. Prices in Sijord are steep.'),
          info?.heal && selected ? h('button.btn', {onclick: () => {this.itemTarget = !this.itemTarget; this.render();}}, 'Use on Pokémon') : null,
          this.itemTarget && info?.heal && selected ? h('div.item-targets', {}, ...this.deps.party().map(c => h('button.act', {disabled:c.hp <= 0 || c.hp >= maxHp(c), onclick: () => {this.deps.useItem(selected,c.uid); this.itemTarget = false; this.render();}}, h('img', {src:this.deps.portrait(c.species),alt:''}), `${displayName(c)} · ${c.hp}/${maxHp(c)}`))) : null,
        ),
      ),
    );
  }

  private itemArt(id: string): HTMLElement {
    const item = ITEMS[id];
    return item.sprite ? h('img.bag-icon', {src:assetUrl(`items/${item.sprite}.png`),alt:item.name}) : h('span.bag-icon', {}, item.icon);
  }

  private renderPokedex(): HTMLElement {
    const search = h('input.dex-search', {placeholder:'Search Pokémon, number or form', 'aria-label':'Search Pokédex'});
    const list = h('div.dex-list');
    const draw = () => {
      const term = search.value.toLowerCase();
      const entries = catalogue.models.filter(m => `${m.name} ${m.dex} ${m.form}`.toLowerCase().includes(term));
      list.replaceChildren(...entries.slice(0,150).map(m => h('a.dex-entry', {href:assetUrl(`pokemon.html?model=${encodeURIComponent(m.id)}`),target:'_blank',rel:'noopener'}, h('span', {}, String(m.dex ?? '—').padStart(3,'0')), h('b', {},m.name), h('small', {},m.form === 'regular' ? 'Regular' : m.form), h('span', {},m.animations.length ? 'Animated ↗' : 'View model ↗'))));
      if (!entries.length) list.append(h('p.empty', {}, 'No matching Pokémon.'));
    };
    search.addEventListener('input',draw);draw();
    return h('div.dex-screen', {}, h('h2', {},'Pokédex · model collection'), h('p.hint-dark', {},`${catalogue.models.length.toLocaleString()} models and forms. Search to narrow the list; the first 150 matches are shown. World encounters currently use 21 species.`), search,list);
  }

  private renderParty(): HTMLElement {
    const party = this.deps.party();
    if (!party.length) {
      return h(
        'div.party-grid',
        {},
        ...Array.from({ length: 6 }, (_, i) =>
          h('div.party-slot', {}, h('div.party-ball', {}, '◓'), h('div', {}, i < 2 ? `Slot ${i + 1} · battles first` : `Slot ${i + 1}`), h('small', {}, 'Empty')),
        ),
        h('p.hint-dark', {}, 'Every battle is a double battle: the first two Pokemon in your party go out together. Professor Hazel will give you your first partner.'),
      );
    }
    this.selectedMon = Math.min(this.selectedMon, party.length - 1);
    const leads = party.filter(isUsable).slice(0, 2);
    const cards = party.map((c, i) => {
      const r = c.hp / maxHp(c);
      return h(
        'button.mon-card' + (i === this.selectedMon ? '.on' : '') + (c.hp <= 0 ? '.fainted' : ''),
        { onclick: () => { this.selectedMon = i; this.render(); } },
        h('img.mon-portrait', { src: this.deps.portrait(c.species), alt: '' }),
        h(
          'div.mon-main',
          {},
          h('div.mon-name', {}, displayName(c), h('span.mon-lv', {}, `Lv. ${c.level}`)),
          h('div.party-hp', {}, h('i', { style: `width:${Math.round(r * 100)}%`, class: r > 0.5 ? '' : r > 0.2 ? 'mid' : 'low' })),
          h('div.mon-sub', {}, `${c.hp}/${maxHp(c)} HP`, c.status ? h('span.status-chip.s-' + c.status, {}, STATUS_LABEL[c.status]) : c.hp <= 0 ? h('span.status-chip.s-fnt', {}, 'FNT') : null, leads.includes(c) ? h('span.lead-tag', {}, 'Leads') : null),
        ),
      );
    });
    return h(
      'div.party-screen',
      {},
      h('div.trainer-preview', {}, this.trainerImage ? h('img', {src:this.trainerImage,alt:'Your trainer'}) : null, h('span', {}, 'Your team')),
      h('div.mon-list', {}, ...cards, h('p.hint-dark', {}, 'Solo: the first two healthy Pokémon lead. Co-op: each trainer commands one. Reorder to choose your lead.')),
      this.renderMon(party, this.selectedMon),
    );
  }

  private renderMon(party: Creature[], i: number): HTMLElement {
    const c = party[i];
    const sp = species(c.species);
    const stats = creatureStats(c);
    const nature = NATURES[c.nature];
    const cap = this.deps.levelCap();
    const from = xpForLevel(sp.growth, c.level);
    const to = xpForLevel(sp.growth, c.level + 1);
    const xpRatio = c.level >= 100 ? 1 : Math.max(0, Math.min(1, (c.xp - from) / Math.max(1, to - from)));
    const ability = ABILITIES[c.ability];
    const statRow = (k: StatName, label: string) => {
      const mark = nature?.plus === k ? h('span.up', {}, '▲') : nature?.minus === k ? h('span.down', {}, '▼') : null;
      const v = k === 'hp' ? maxHp(c) : stats[k];
      return h('div.stat-row', {}, h('span', {}, label, mark), h('div.stat-bar', {}, h('i', { style: `width:${Math.min(100, (v / (c.level * 3 + 40)) * 100)}%` })), h('b', {}, String(v)));
    };
    const move = (slot: Creature['moves'][number]) => {
      const m = moveData(slot.id);
      return h(
        'div.mon-move',
        { style: `--type:${TYPE_COLORS[m.type]}`, title: m.description },
        h('div.mon-move-top', {}, h('b', {}, m.name), h('span.type-chip', { style: `background:${TYPE_COLORS[m.type]}` }, m.type)),
        h('div.mon-move-meta', {}, `${m.category} · power ${m.power || '—'} · acc ${m.accuracy === true ? '—' : m.accuracy} · PP ${slot.pp}/${m.pp}`),
      );
    };
    const swap = (a: number, b: number) => {
      [party[a], party[b]] = [party[b], party[a]];
      this.selectedMon = b;
      this.deps.onPartyChanged();
      this.render();
    };
    return h(
      'div.mon-detail',
      {},
      h(
        'div.mon-head',
        {},
        h('img.mon-big', { src: this.deps.portrait(c.species), alt: '' }),
        h(
          'div',
          {},
          h('h3.mon-title', {}, displayName(c), h('small', {}, ` ${sp.dex} · ${sp.name}`)),
          h('div.mon-types', {}, ...sp.types.map((t) => h('span.type-chip', { style: `background:${TYPE_COLORS[t]}` }, t))),
          h('div.mon-xp', {}, h('span', {}, `Lv. ${c.level}`), h('div.xp-bar', {}, h('i', { style: `width:${Math.round(xpRatio * 100)}%` })), h('small', {}, c.level >= cap ? `At the level cap (${cap})` : `${Math.max(0, to - c.xp)} XP to Lv. ${c.level + 1}`)),
          h('p.mon-desc', {}, sp.description),
        ),
      ),
      h(
        'div.mon-cols',
        {},
        h(
          'div',
          {},
          h('h3', {}, 'Stats'),
          statRow('hp', 'HP'), statRow('atk', 'Attack'), statRow('def', 'Defense'), statRow('spa', 'Sp. Atk'), statRow('spd', 'Sp. Def'), statRow('spe', 'Speed'),
          h('p.hint-dark', {}, `${nature?.name ?? c.nature} nature`, ability ? ` · ${ability.name}: ${ability.description}` : ''),
          c.item ? h('p.hint-dark', {}, `Holding: ${ITEMS[c.item]?.name ?? c.item.replace(/-/g, ' ')}`) : null,
        ),
        h('div', {}, h('h3', {}, 'Moves'), ...c.moves.map(move)),
      ),
      h(
        'div.set-buttons',
        {},
        h('button.btn.secondary', { disabled: i === 0, onclick: () => swap(i, i - 1) }, '▲ Move up'),
        h('button.btn.secondary', { disabled: i === party.length - 1, onclick: () => swap(i, i + 1) }, '▼ Move down'),
      ),
    );
  }

  private renderQuests(): HTMLElement {
    const quests = this.deps.quests();
    return h(
      'div.quest-list',
      {},
      ...quests.map((q) =>
        h('div.quest-row' + (q.done ? '.done' : ''), {}, h('span.quest-kind', {}, q.main ? 'Story' : 'Side'), h('b', {}, q.text), h('span.quest-state', {}, q.done ? 'Done' : 'Active')),
      ),
    );
  }

  private renderSettings(): HTMLElement {
    const s = this.deps.settings;
    const commit = () => {
      this.deps.onSettings(s);
      this.render();
    };
    const slider = (label: string, min: number, max: number, step: number, value: number, fmt: (v: number) => string, set: (v: number) => void) => {
      const out = h('span.set-value', {}, fmt(value));
      const input = h('input', { type: 'range', min, max, step, value });
      input.addEventListener('input', () => {
        set(Number(input.value));
        out.textContent = fmt(Number(input.value));
        this.deps.onSettings(s);
      });
      return h('label.set-row', {}, h('span', {}, label), input, out);
    };
    const toggle = (label: string, value: boolean, set: (v: boolean) => void) =>
      h('label.set-row', {}, h('span', {}, label), h('input', { type: 'checkbox', checked: value, onchange: (e: Event) => { set((e.target as HTMLInputElement).checked); commit(); } }), h('span'));

    return h(
      'div.settings',
      {},
      h(
        'div.set-col',
        {},
        h('h3', {}, 'Game'),
        h('div.set-buttons', {}, h('button.btn', { onclick: () => this.close() }, 'Resume'), h('button.btn.secondary', { onclick: () => this.deps.onQuitToTitle() }, 'Save and quit to title')),
        h('h3', {}, 'Camera and mouse'),
        slider('Mouse sensitivity', 0.2, 3, 0.05, s.mouseSensitivity, (v) => `${v.toFixed(2)}×`, (v) => (s.mouseSensitivity = v)),
        toggle('Invert vertical look', s.invertY, (v) => (s.invertY = v)),
        slider('Field of view', 50, 90, 1, s.fov, (v) => `${v}°`, (v) => (s.fov = v)),
        h('h3', {}, 'Graphics'),
        h(
          'label.set-row',
          {},
          h('span', {}, 'Quality'),
          h(
            'div.chips',
            {},
            ...(['low', 'medium', 'high'] as const).map((q) =>
              h('button.chip' + (s.quality === q ? '.on' : ''), { onclick: () => { s.quality = q; commit(); } }, q[0].toUpperCase() + q.slice(1)),
            ),
          ),
          h('span'),
        ),
        toggle('Show FPS', s.showFps, (v) => (s.showFps = v)),
        toggle('Show controls hint', s.showControlsHint, (v) => (s.showControlsHint = v)),
      ),
      h(
        'div.set-col',
        {},
        h('h3', {}, 'Controls'),
        h('p.hint-dark', {}, 'Click a key, then press the new key. Esc cancels.'),
        ...(Object.keys(ACTION_LABELS) as Action[]).map((a) =>
          h(
            'div.set-row',
            {},
            h('span', {}, ACTION_LABELS[a]),
            h('button.keybtn' + (this.listening === a ? '.listening' : ''), { onclick: () => { this.listening = a; this.render(); } }, this.listening === a ? 'Press a key…' : keyLabel(s.keys[a])),
            h('span'),
          ),
        ),
        h('button.btn.secondary', { onclick: () => { s.keys = { ...DEFAULT_SETTINGS.keys }; commit(); } }, 'Reset controls'),
      ),
    );
  }
}

/** North-up map of the whole region with pan (drag) and zoom (wheel). */
class MapView {
  readonly el = h('div.map-wrap');
  private canvas = h('canvas.map-canvas');
  private ctx = this.canvas.getContext('2d')!;
  private viewX: number;
  private viewZ: number;
  /** Screen pixels per metre. */
  private scale = 1;
  private dragging = false;
  private dragged = false;
  private info = h('div.map-info');
  private onUp = () => (this.dragging = false);

  constructor(private deps: MenuDeps) {
    const p = deps.player();
    this.viewX = p.x;
    this.viewZ = p.z;
    this.el.append(this.canvas, this.info, h('div.map-controls', {}, h('button.act', {onclick:()=>{const p=this.deps.player();this.viewX=p.x;this.viewZ=p.z;}}, 'Recenter'), h('button.act', {onclick:()=>{this.scale=Math.min(6,this.scale*1.3);}}, '+'), h('button.act', {onclick:()=>{this.scale=Math.max(.35,this.scale/1.3);}}, '−')), h('div.map-legend', {}, h('span', {}, '▲ You'), h('span.legend-partner', {}, '● Partner'), h('span.legend-quest', {}, '◆ Quest'), h('span', {}, 'Drag to pan · scroll to zoom')));
    this.canvas.addEventListener('mousedown', () => {this.dragging = true;this.dragged = false;});
    this.canvas.addEventListener('click', e => {if(this.dragged)return;const rect=this.canvas.getBoundingClientRect();const x=this.viewX-(e.clientX-rect.left-rect.width/2)/this.scale,z=this.viewZ-(e.clientY-rect.top-rect.height/2)/this.scale;this.deps.setDestination({x,z,label:'Destination'});this.drawInfo();});
    this.drawInfo();
    addEventListener('mouseup', this.onUp);
    this.canvas.addEventListener('mousemove', (e) => {
      if (!this.dragging) return;
      this.dragged = true;
      // Screen right is world -X (east), screen down is world -Z (south).
      this.viewX += e.movementX / this.scale;
      this.viewZ += e.movementY / this.scale;
    });
    this.canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.scale = Math.max(0.35, Math.min(6, this.scale * Math.exp(-e.deltaY * 0.0015)));
    });
  }

  private drawInfo(): void {
    const landmarks = this.deps.world.anchors.landmarks;
    const selected = h('select.map-place', {'aria-label':'Landmark'},...landmarks.map((l,i)=>h('option',{value:String(i)},l.label)));
    const detail = h('p');
    const update = () => {const l=landmarks[Number(selected.value)],p=this.deps.player();if(l)detail.textContent=`${Math.round(Math.hypot(p.x-l.position.x,p.z-l.position.z))} m from you`;};
    selected.addEventListener('change',update);update();
    this.info.replaceChildren(h('h3', {},'Sijord region'), selected,detail,
      h('button.act',{onclick:()=>{const l=landmarks[Number(selected.value)];if(l){this.deps.setDestination({x:l.position.x,z:l.position.z,label:l.label});this.viewX=l.position.x;this.viewZ=l.position.z;}}},'Set destination'),
      h('button.act',{onclick:()=>this.deps.setDestination(null)},'Clear marker'),h('small',{},'Click the map to place a marker.'));
  }

  dispose(): void {
    removeEventListener('mouseup', this.onUp);
  }

  draw(): void {
    const w = this.el.clientWidth;
    const ht = this.el.clientHeight;
    if (!w || !ht) return;
    const dpr = Math.min(devicePixelRatio, 2);
    if (this.canvas.width !== Math.round(w * dpr) || this.canvas.height !== Math.round(ht * dpr)) {
      this.canvas.width = Math.round(w * dpr);
      this.canvas.height = Math.round(ht * dpr);
      if (this.scale === 1) this.scale = Math.min(w, ht) / 500;
    }
    const { minimap, world } = this.deps;
    const half = world.halfSize;
    const ctx = this.ctx;
    const s = this.scale;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#3d6f97';
    ctx.fillRect(0, 0, w, ht);
    const toScreen = (x: number, z: number) => [w / 2 + (this.viewX - x) * s, ht / 2 + (this.viewZ - z) * s] as const;

    ctx.save();
    ctx.translate(w / 2, ht / 2);
    ctx.scale(-s * minimap.metresPerPx, -s * minimap.metresPerPx);
    ctx.translate(-(this.viewX + half) / minimap.metresPerPx, -(this.viewZ + half) / minimap.metresPerPx);
    ctx.drawImage(minimap.terrain, 0, 0);
    ctx.restore();

    const destination = this.deps.destination();
    if(destination){const [x,y]=toScreen(destination.x,destination.z);dot(ctx,x,y,9,'#62ddff');label(ctx,destination.label,x,y-18,13,'#dcf8ff');}
    // Settlement boundaries (no building inside these).
    for (const r of world.regions) {
      const [sx, sy] = toScreen(r.centerX, r.centerZ);
      ctx.beginPath();
      ctx.arc(sx, sy, r.radius * s, 0, Math.PI * 2);
      ctx.setLineDash([6, 5]);
      ctx.strokeStyle = 'rgba(255,255,255,.8)';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.setLineDash([]);
      label(ctx, r.name, sx, sy - r.radius * s - 10, 15, '#fff7d6');
    }
    for (const l of world.anchors.landmarks) {
      const [sx, sy] = toScreen(l.position.x, l.position.z);
      dot(ctx, sx, sy, 5, '#ffffff');
      if (s > 3.5) label(ctx, l.label, sx, sy - 12, 12, '#ffffff');
    }
    const q = this.deps.quests().find((x) => !x.done && x.target);
    if (q?.target) {
      const [sx, sy] = toScreen(q.target.x, q.target.z);
      ctx.save();
      ctx.translate(sx, sy);
      ctx.rotate(Math.PI / 4);
      ctx.fillStyle = '#ffd34d';
      ctx.strokeStyle = '#4a2a00';
      ctx.lineWidth = 2;
      ctx.fillRect(-7, -7, 14, 14);
      ctx.strokeRect(-7, -7, 14, 14);
      ctx.restore();
      label(ctx, q.text, sx, sy - 16, 13, '#ffd34d');
    }
    const partner = this.deps.partner();
    if (partner) {
      const [sx, sy] = toScreen(partner.x, partner.z);
      dot(ctx, sx, sy, 8, '#2e86de');
      label(ctx, partner.name, sx, sy - 14, 12, '#cfe6ff');
    }
    const p = this.deps.player();
    const [px, py] = toScreen(p.x, p.z);
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(-p.yaw);
    ctx.beginPath();
    ctx.moveTo(0, -13);
    ctx.lineTo(9, 10);
    ctx.lineTo(0, 5);
    ctx.lineTo(-9, 10);
    ctx.closePath();
    ctx.fillStyle = '#3fb5ff';
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.fill();
    ctx.restore();

    // Compass rose
    label(ctx, 'N', w - 34, 34, 18, '#ffffff');
    ctx.beginPath();
    ctx.moveTo(w - 34, 42);
    ctx.lineTo(w - 34, 62);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.stroke();
  }
}

function dot(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string): void {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = '#1d2b38';
  ctx.stroke();
}

function label(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, color: string): void {
  ctx.font = `800 ${size}px Nunito, 'Segoe UI', system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.lineWidth = 4;
  ctx.strokeStyle = 'rgba(0,0,0,.6)';
  ctx.strokeText(text, x, y);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}
