import catalogue from '../assets/pokemon-catalogue.json';
import { assetUrl } from '../assets/loader';
import { creatureStats, displayName, isUsable, maxHp } from '../../shared/battle/creature';
import { NATURES } from '../../shared/battle/natures';
import { xpForLevel } from '../../shared/battle/stats';
import type { Creature, StatName } from '../../shared/battle/types';
import { ABILITIES } from '../../shared/data/abilities';
import { moveData } from '../../shared/data/moves';
import { SPECIES_IDS, species } from '../../shared/data/species';
import { PARTY_MAX } from '../../shared/items';
import { DISCOVERIES, DISCOVERY_LABEL, discoveryCounts, type DiscoveryKind } from '../../shared/discoveries';
import { POKEMON_VISUALS } from '../../shared/pokemon-visuals';
import { ITEMS, ITEM_CATEGORIES, type ItemCategory } from '../../shared/items';
import { craftBlock, RECIPES, STATION_LABEL, type Recipe, type Station } from '../../shared/crafting';
import { TOOL_USES, type ToolId } from '../../shared/gathering';
import { CANTEEN_DRINKS, type Meters } from '../../shared/survival';
import { buyPrice, formatMoney, SELL_RATE, sellPrice, type Shop } from '../../shared/economy';
import { TYPE_COLORS } from '../battle/fx';
import { STATUS_LABEL } from '../battle/ui';
import { ACTION_LABELS, DEFAULT_SETTINGS, keyLabel, rebind, type Action, type Settings } from '../core/settings';
import type { World } from '../world/types';
import { h } from './dom';
import type { Quest } from './hud';
import type { Minimap } from './minimap';

export type MenuTab = 'map' | 'bag' | 'craft' | 'shop' | 'party' | 'quests' | 'settings' | 'pokedex';

export interface MenuDeps {
  world: World;
  minimap: Minimap;
  player(): { x: number; z: number; yaw: number };
  partner(): { x: number; z: number; name: string } | null;
  destination(): {x:number;z:number;label:string} | null;
  setDestination(p: {x:number;z:number;label:string} | null): void;
  quests(): Quest[];
  /** Discovery ids found so far (caches, tablets, field notes). */
  found(): string[];
  bag(): Record<string, number>;
  party(): Creature[];
  /** Creatures stored in the PC. */
  box(): Creature[];
  /** The PC in Hazel's lab is close enough to swap party and box. */
  nearPc(): boolean;
  dex(): { seen: string[]; caught: string[] };
  portrait(species: string): string;
  trainerPortrait(): Promise<string>;
  useItem(id: string, uid: string): boolean;
  /** The party order changed in the menu. */
  onPartyChanged(): void;
  levelCap(): number;
  /** The trainer's own level and progress through it (DESIGN §7.1). */
  trainer(): { level: number; into: number; need: number };
  /** Crafting stations within reach right now. */
  stations(): Station[];
  /** Seconds one craft of a recipe takes this trainer. */
  craftSeconds(id: string): number;
  /** Make one; false if it can't be made after all. */
  craft(id: string): boolean;
  /** Uses left on the tool in hand. */
  toolUses(id: string): number | undefined;
  /** Eat or drink an item; false if it did nothing. */
  eat(id: string): boolean;
  /** Hunger, thirst and queasiness right now. */
  meters(): Meters;
  /** Pokedollars in hand. */
  money(): number;
  /** The shop the trainer is standing at, if any. */
  shop(): Shop | null;
  /** Buy `n` of a shop's item; false if it can't be done. */
  buy(id: string, n: number): boolean;
  /** Sell `n` of an item; the money made (0 if none). */
  sell(id: string, n: number): number;
  settings: Settings;
  onSettings(s: Settings): void;
  onSave(): void;
  onResume(): void;
  onQuitToTitle(): void;
}

const TABS: { id: MenuTab; label: string; action?: Action }[] = [
  { id: 'map', label: 'Map', action: 'map' },
  { id: 'bag', label: 'Bag', action: 'bag' },
  { id: 'craft', label: 'Craft', action: 'craft' },
  { id: 'shop', label: 'Shop' },
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
  /** A PC box creature is selected instead of a party one. */
  private selectedBox: number | null = null;
  private selectedDex: string | null = null;
  private listening: Action | null = null;
  private map: MapView | null = null;
  private trainerImage = '';
  private itemTarget = false;
  /** The recipe being made, and when it started and finishes (performance.now ms). */
  private crafting: { id: string; start: number; end: number; bar: HTMLElement } | null = null;

  constructor(private deps: MenuDeps) {
    void deps.trainerPortrait().then(src => {this.trainerImage = src; if (this.open_ && this.tab === 'party') this.render();});
    this.el.append(
      h('div.menu-panel', {}, h('div.menu-head', {}, this.tabBar, h('button.act', {onclick: (e: Event)=>{this.deps.onSave();const button=e.currentTarget as HTMLButtonElement;button.textContent='Saved';setTimeout(()=>{button.textContent='Save progress';},1500);}}, 'Save progress'), h('button.menu-close', { onclick: () => this.close(), title: 'Close (Esc)' }, '✕')), this.body, h('div.menu-footer', {}, 'Esc · Back to exploring')),
    );
    this.el.addEventListener('click', (e) => {
      if (e.target === this.el) { e.stopPropagation(); this.close(); }
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
    this.crafting = null;
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
    if (this.open_ && (this.tab === 'party' || this.tab === 'pokedex' || this.tab === 'quests' || this.tab === 'craft' || this.tab === 'bag' || this.tab === 'shop')) this.render();
  }

  /** Called each frame while open so the map shows live positions. */
  update(): void {
    this.map?.draw();
    const c = this.crafting;
    if (c) {
      const now = performance.now();
      c.bar.style.width = `${Math.min(100, ((now - c.start) / (c.end - c.start)) * 100)}%`;
      if (now >= c.end) {
        this.crafting = null;
        this.deps.craft(c.id);
        if (this.open_ && this.tab === 'craft') this.render();
      }
    }
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
    // The Shop tab only exists while you're standing at a shop.
    const shop = this.deps.shop();
    if (this.tab === 'shop' && !shop) this.tab = 'bag';
    this.tabBar.replaceChildren(
      ...TABS.filter((t) => t.id !== 'shop' || shop).map((t) =>
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
      case 'craft':
        this.body.replaceChildren(this.renderCraft());
        break;
      case 'shop':
        this.body.replaceChildren(this.renderShop(shop!));
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
        h('span.purse', { title: 'Your money' }, formatMoney(this.deps.money())),
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
          selected && selected in TOOL_USES ? h('p.tool-wear', {}, `${this.deps.toolUses(selected) ?? TOOL_USES[selected as ToolId]} of ${TOOL_USES[selected as ToolId]} uses left on the one in hand`) : null,
          selected === 'canteen' ? h('p.tool-wear', {}, `Carrying ${bag['river-water'] ?? 0} of ${bag.canteen * CANTEEN_DRINKS} drinks of river water`) : null,
          info?.food && selected ? this.foodPanel(selected) : null,
          info?.heal && selected ? h('button.btn', {onclick: () => {this.itemTarget = !this.itemTarget; this.render();}}, 'Use on Pokémon') : null,
          this.itemTarget && info?.heal && selected ? h('div.item-targets', {}, ...this.deps.party().map(c => h('button.act', {disabled:c.hp <= 0 || c.hp >= maxHp(c), onclick: () => {this.deps.useItem(selected,c.uid); this.itemTarget = false; this.render();}}, h('img', {src:this.deps.portrait(c.species),alt:''}), `${displayName(c)} · ${c.hp}/${maxHp(c)}`))) : null,
        ),
      ),
    );
  }

  /** What a food or drink does for you, how you're doing, and the button to have it. */
  private foodPanel(id: string): HTMLElement {
    const food = ITEMS[id].food!, m = this.deps.meters();
    const gives = [
      food.hunger ? `+${food.hunger} hunger` : '',
      food.thirst ? `+${food.thirst} thirst` : '',
      food.queasy ? `${Math.round(food.queasy * 100)}% chance of feeling queasy` : '',
    ].filter(Boolean);
    const verb = food.hunger ? 'Eat' : 'Drink';
    return h('div.food-info', {},
      h('p.food-gives', {}, gives.join(' · ')),
      h('p.food-now', {}, `You: hunger ${Math.round(m.hunger)} · thirst ${Math.round(m.thirst)}${m.queasy > 0 ? ' · queasy' : ''}`),
      h('button.btn', { onclick: () => { this.deps.eat(id); this.render(); } }, verb),
    );
  }

  /** Recipes by station: what you can make, what you're short of, and why a recipe is locked. */
  private renderCraft(): HTMLElement {
    const bag = this.deps.bag(), tr = this.deps.trainer(), stations = this.deps.stations();
    const where = stations.includes('workbench') ? 'At the workbench' : stations.includes('campfire') ? 'At the campfire' : 'Crafting by hand';
    const card = (r: Recipe) => {
      const block = craftBlock(r, bag, tr.level, stations);
      const busy = this.crafting?.id === r.id;
      const reason = block === 'level' ? `Needs trainer Lv. ${r.level}` : block === 'station' ? `Needs the ${STATION_LABEL[r.station].toLowerCase()}` : block === 'materials' ? 'Not enough materials' : '';
      const bar = h('i');
      const button = h('button.btn.craft-go', {
        disabled: !!block || !!this.crafting,
        onclick: () => {
          if (this.crafting || craftBlock(r, this.deps.bag(), this.deps.trainer().level, this.deps.stations())) return;
          const now = performance.now();
          this.crafting = { id: r.id, start: now, end: now + this.deps.craftSeconds(r.id) * 1000, bar };
          this.render();
        },
      }, busy ? 'Making…' : 'Craft');
      if (busy && this.crafting) this.crafting.bar = bar;
      return h(
        'div.craft-card' + (block ? '.blocked' : ''),
        {},
        h('div.craft-head', {}, this.itemArt(r.out), h('div', {}, h('b', {}, ITEMS[r.out].name + (r.count > 1 ? ` ×${r.count}` : '')), h('small', {}, `You have ${bag[r.out] ?? 0}`))),
        h('div.craft-cost', {}, ...Object.entries(r.cost).map(([id, n]) => h('span.cost' + ((bag[id] ?? 0) < n ? '.short' : ''), { title: ITEMS[id].name }, this.itemArt(id), `${bag[id] ?? 0}/${n}`))),
        h('div.craft-foot', {}, reason ? h('small.craft-why', {}, reason) : h('small', {}, `${this.deps.craftSeconds(r.id).toFixed(1)} s`), busy ? h('div.craft-progress', {}, bar) : button),
      );
    };
    const NOTES: Record<Station, string> = { hand: '', campfire: 'the campfire at the campsite, north-west of Bramblewick', workbench: 'on the Craft Workshop porch in Bramblewick · trainer Lv. 3' };
    const order = [...new Set<Station>([...stations, 'hand', 'campfire', 'workbench'])];
    const section = (st: Station, note: string) => [
      h('h3', {}, STATION_LABEL[st], h('span.craft-note', {}, note)),
      h('div.craft-grid', {}, ...RECIPES.filter((r) => r.station === st).map(card)),
    ];
    return h(
      'div.craft',
      {},
      h('div.craft-top', {},
        h('div.craft-level', {}, h('b', {}, `Trainer Lv. ${tr.level}`), h('div.xp-bar', {}, h('i', { style: `width:${tr.need ? Math.round((tr.into / tr.need) * 100) : 100}%` })), h('small', {}, tr.need ? `${tr.need - tr.into} XP to Lv. ${tr.level + 1}` : 'Top level')),
        h('div.craft-where', {}, h('b', {}, where), h('small', {}, 'Catching, battling, finding things and crafting something new all give trainer experience.')),
      ),
      // The station you're standing at comes first, so its recipes aren't below the fold.
      ...order.flatMap((st) => section(st, st === 'hand' ? 'anywhere' : stations.includes(st) ? 'you are here' : NOTES[st])),
    );
  }

  /** Buy from the counter on the left, sell from your bag on the right. */
  private renderShop(shop: Shop): HTMLElement {
    const bag = this.deps.bag(), money = this.deps.money();
    const buyCard = (id: string) => {
      const price = buyPrice(id) ?? 0;
      const btn = (n: number) => h('button.btn.craft-go', {
        disabled: money < price * n,
        onclick: () => { this.deps.buy(id, n); this.render(); },
      }, n > 1 ? `Buy ${n}` : 'Buy');
      return h('div.craft-card' + (money < price ? '.blocked' : ''), {},
        h('div.craft-head', {}, this.itemArt(id), h('div', {}, h('b', {}, ITEMS[id].name), h('small', {}, `You have ${bag[id] ?? 0}`))),
        h('p.shop-desc', {}, ITEMS[id].description ?? ''),
        h('div.craft-foot', {}, h('b.price', {}, formatMoney(price)), h('div.shop-btns', {}, btn(1), btn(5))),
      );
    };
    const sellable = Object.entries(bag).filter(([id, n]) => n > 0 && ITEMS[id] && ITEMS[id].category !== 'key' && sellPrice(id) !== null);
    const sellRow = ([id, n]: [string, number]) => {
      const each = sellPrice(id)!;
      return h('div.sell-row', {},
        this.itemArt(id),
        h('div.sell-name', {}, h('b', {}, ITEMS[id].name), h('small', {}, `×${n} · ${formatMoney(each)} each`)),
        h('button.act', { onclick: () => { this.deps.sell(id, 1); this.render(); } }, 'Sell 1'),
        n > 1 ? h('button.act', { onclick: () => { this.deps.sell(id, n); this.render(); } }, `All ${formatMoney(each * n)}`) : null,
      );
    };
    return h('div.shop', {},
      h('div.craft-top', {},
        h('div.craft-level', {}, h('b', {}, 'Your purse'), h('span.purse.big', {}, formatMoney(money))),
        h('div.craft-where', {}, h('b', {}, shop.name), h('small', {}, `“${shop.greeting}”`)),
      ),
      h('div.shop-cols', {},
        h('div', {}, h('h3', {}, 'For sale'), h('div.craft-grid', {}, ...shop.stock.map(buyCard))),
        h('div', {}, h('h3', {}, 'Sell', h('span.craft-note', {}, `they pay ${Math.round(SELL_RATE * 100)}% of the price`)),
          h('div.sell-list', {}, ...(sellable.length ? sellable.map(sellRow) : [h('p.empty', {}, 'Nothing to sell.')]))),
      ),
    );
  }

  private itemArt(id: string): HTMLElement {
    const item = ITEMS[id];
    return item.sprite ? h('img.bag-icon', {src:assetUrl(`items/${item.sprite}.png`),alt:item.name}) : h('span.bag-icon', {}, item.icon);
  }

  /** The region Dex: every species in the game, silhouettes until seen, full entries once caught. */
  private renderPokedex(): HTMLElement {
    const dex = this.deps.dex();
    const seen = new Set(dex.seen);
    const caught = new Set(dex.caught);
    const ids = [...SPECIES_IDS].sort((x, y) => (POKEMON_VISUALS[x]?.dex ?? 9999) - (POKEMON_VISUALS[y]?.dex ?? 9999));
    const sel = this.selectedDex && ids.includes(this.selectedDex) ? this.selectedDex : ids.find((id) => seen.has(id)) ?? ids[0];
    const icon = (id: string) => {
      const n = POKEMON_VISUALS[id]?.dex;
      return n ? h('img.dex-icon' + (seen.has(id) ? '' : '.unseen'), { src: assetUrl(`pokemon-icons/${n}.png`), alt: '', loading: 'lazy' }) : h('span.dex-icon', {}, '?');
    };
    const num = (id: string) => `#${String(POKEMON_VISUALS[id]?.dex ?? '?').padStart(3, '0')}`;
    const cards = ids.map((id) =>
      h(
        'button.dex-card' + (id === sel ? '.on' : '') + (seen.has(id) ? '' : '.unseen'),
        { onclick: () => { this.selectedDex = id; this.render(); } },
        icon(id),
        h('small', {}, num(id)),
        h('b', {}, seen.has(id) ? species(id).name : '???'),
        caught.has(id) ? h('span.dex-caught', { title: 'Caught' }, '◓') : null,
      ),
    );
    const sp = species(sel);
    const known = seen.has(sel);
    const owned = caught.has(sel);
    const statRow = (label: string, v: number) => h('div.stat-row', {}, h('span', {}, label), h('div.stat-bar', {}, h('i', { style: `width:${Math.min(100, (v / 160) * 100)}%` })), h('b', {}, String(v)));
    const odds = sp.catchRate >= 190 ? 'Easy to catch' : sp.catchRate >= 120 ? 'Fairly easy to catch' : sp.catchRate >= 60 ? 'Hard to catch' : 'Very hard to catch';
    const model = catalogue.models.find((m) => m.dex === POKEMON_VISUALS[sel]?.dex && m.form === 'regular');
    const detail = h(
      'div.dex-detail',
      {},
      h('div.dex-detail-head', {}, icon(sel), h('div', {}, h('small', {}, num(sel)), h('h3', {}, known ? sp.name : 'Unknown Pokémon'), known ? h('div.mon-types', {}, ...sp.types.map((t) => h('span.type-chip', { style: `background:${TYPE_COLORS[t]}` }, t))) : null)),
      h('p.mon-desc', {}, known ? sp.description : 'Not seen yet. Explore Sijord to find it.'),
      owned
        ? h('div', {}, h('h3', {}, 'Base stats'), statRow('HP', sp.baseStats.hp), statRow('Attack', sp.baseStats.atk), statRow('Defense', sp.baseStats.def), statRow('Sp. Atk', sp.baseStats.spa), statRow('Sp. Def', sp.baseStats.spd), statRow('Speed', sp.baseStats.spe), h('p.hint-dark', {}, `${odds} · ${sp.temperament[0].toUpperCase() + sp.temperament.slice(1)} in the wild`))
        : known ? h('p.hint-dark', {}, `Catch one to record its stats. ${sp.temperament === 'aggressive' || sp.temperament === 'territorial' ? 'It fights back if a throw fails.' : sp.temperament === 'skittish' ? 'It runs from a sprinting trainer.' : ''}`) : null,
      known && model ? h('a.dex-link', { href: assetUrl(`pokemon.html?model=${encodeURIComponent(model.id)}`), target: '_blank', rel: 'noopener' }, 'View 3D model ↗') : null,
    );
    return h(
      'div.dex-screen',
      {},
      h('div.dex-top', {}, h('h2', {}, 'Pokédex'), h('span.dex-count', {}, `Seen ${seen.size} · Caught ${caught.size} of ${ids.length}`), h('a.dex-link', { href: assetUrl('pokemon.html'), target: '_blank', rel: 'noopener' }, 'Model explorer ↗')),
      h('div.dex-body', {}, h('div.dex-grid', {}, ...cards), detail),
    );
  }

  private renderParty(): HTMLElement {
    const party = this.deps.party();
    if (!party.length) {
      const professor = this.deps.world.anchors.professor;
      return h('div.party-screen.party-start', {},
        h('div.trainer-preview', {}, this.trainerImage ? h('img', {src:this.trainerImage,alt:'Your trainer'}) : null, h('span', {}, 'Your adventure begins')),
        h('div.mon-list', {}, h('h2', {}, 'Your party'), ...Array.from({length:6}, (_,i) =>
          h('div.mon-card.empty-mon', {}, h('span.empty-ball', {}, '◓'), h('div.mon-main', {}, h('div.mon-name', {}, `Partner ${i+1}`), h('small', {}, i === 0 ? 'Waiting for your first Pokémon' : 'An adventure still to come'))))),
        h('div.starter-welcome', {}, h('span.eyebrow', {}, 'FIRST STEPS'), h('h2', {}, 'Meet your first partner'),
          h('p', {}, 'Professor Hazel is waiting outside the laboratory. Find her in Bramblewick to choose the Pokémon that will travel with you.'),
          h('div.starter-portraits', {}, ...['fernfawn','cindlet','splashpup'].map(sp => h('img', {src:this.deps.portrait(sp),alt:species(sp).name}))),
          h('button.btn', {onclick: () => {this.deps.setDestination({x:professor.x,z:professor.z,label:'Professor Hazel'});this.close();}}, 'Guide me to Professor Hazel'),
          h('p.hint-dark', {}, 'Follow the compass marker to the laboratory. In co-op, each trainer commands their own Pokémon.')));

    }
    this.selectedMon = Math.min(this.selectedMon, party.length - 1);
    const box = this.deps.box();
    if (this.selectedBox !== null && this.selectedBox >= box.length) this.selectedBox = null;
    const leads = party.filter(isUsable).slice(0, 2);
    const cards = party.map((c, i) => {
      const r = c.hp / maxHp(c);
      return h(
        'button.mon-card' + (this.selectedBox === null && i === this.selectedMon ? '.on' : '') + (c.hp <= 0 ? '.fainted' : ''),
        { onclick: () => { this.selectedMon = i; this.selectedBox = null; this.render(); } },
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
      h(
        'div.mon-list',
        {},
        ...cards,
        h('p.hint-dark', {}, 'Solo: the first two healthy Pokémon lead. Co-op: each trainer commands one. Reorder to choose your lead.'),
        h('h3.box-head', {}, `PC box · ${box.length}`),
        box.length
          ? h('div.box-grid', {}, ...box.map((c, j) => h('button.box-slot' + (this.selectedBox === j ? '.on' : ''), { title: `${displayName(c)} Lv. ${c.level}`, onclick: () => { this.selectedBox = j; this.render(); } }, this.boxIcon(c.species), h('small', {}, `Lv. ${c.level}`))))
          : h('p.hint-dark', {}, 'Pokémon you catch with a full party go here.'),
        this.deps.nearPc() ? null : h('p.hint-dark', {}, 'Swap with the PC at Hazel’s lab.'),
      ),
      this.selectedBox !== null ? this.renderMon(box, this.selectedBox, true) : this.renderMon(party, this.selectedMon),
    );
  }

  private renderMon(party: Creature[], i: number, inBox = false): HTMLElement {
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
          h('h3.mon-title', {}, displayName(c), h('small', {}, ` #${String(POKEMON_VISUALS[c.species]?.dex ?? sp.dex).padStart(3, '0')} · ${sp.name}`)),
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
      inBox
        ? h(
            'div.set-buttons',
            {},
            h('button.btn', { disabled: !this.deps.nearPc() || this.deps.party().length >= PARTY_MAX, onclick: () => this.withdraw(i) }, 'Take into party'),
          )
        : h(
            'div.set-buttons',
            {},
            h('button.btn.secondary', { disabled: i === 0, onclick: () => swap(i, i - 1) }, '▲ Move up'),
            h('button.btn.secondary', { disabled: i === party.length - 1, onclick: () => swap(i, i + 1) }, '▼ Move down'),
            h('button.btn.secondary', { disabled: !this.canDeposit(i), onclick: () => this.deposit(i) }, 'Send to PC'),
          ),
    );
  }

  private boxIcon(id: string): HTMLElement {
    const n = POKEMON_VISUALS[id]?.dex;
    return n ? h('img', { src: assetUrl(`pokemon-icons/${n}.png`), alt: '' }) : h('img', { src: this.deps.portrait(id), alt: '' });
  }

  /** Keep at least one Pokémon that can still fight in the party. */
  private canDeposit(i: number): boolean {
    const party = this.deps.party();
    return this.deps.nearPc() && party.length > 1 && party.some((c, j) => j !== i && isUsable(c));
  }

  private deposit(i: number): void {
    if (!this.canDeposit(i)) return;
    const [c] = this.deps.party().splice(i, 1);
    this.deps.box().push(c);
    this.selectedMon = Math.max(0, i - 1);
    this.deps.onPartyChanged();
    this.render();
  }

  private withdraw(j: number): void {
    const party = this.deps.party();
    if (!this.deps.nearPc() || party.length >= PARTY_MAX) return;
    const [c] = this.deps.box().splice(j, 1);
    party.push(c);
    this.selectedBox = null;
    this.selectedMon = party.length - 1;
    this.deps.onPartyChanged();
    this.render();
  }

  private renderQuests(): HTMLElement {
    const quests = this.deps.quests();
    const found = this.deps.found();
    const counts = discoveryCounts(found);
    const have = new Set(found);
    const kinds: DiscoveryKind[] = ['cache', 'tablet', 'note'];
    // Tablets and notes stay readable once found, in the order they appear in the vale.
    const pages = DISCOVERIES.filter((d) => d.kind !== 'cache' && have.has(d.id));
    return h(
      'div.quest-list',
      {},
      ...quests.map((q) =>
        h('div.quest-row' + (q.done ? '.done' : ''), {}, h('span.quest-kind', {}, q.main ? 'Story' : 'Side'), h('b', {}, q.text), h('span.quest-state', {}, q.done ? 'Done' : 'Active')),
      ),
      h('h3.disc-head', {}, 'Hearthmeadow discoveries'),
      h('div.disc-counts', {}, ...kinds.map((k) => h(`div.disc-count.disc-${k}`, {}, h('b', {}, `${counts[k].found} / ${counts[k].total}`), h('span', {}, DISCOVERY_LABEL[k].many)))),
      pages.length
        ? h('div.disc-pages', {}, ...pages.map((d) => h(`div.disc-page.disc-${d.kind}`, {}, h('span.quest-kind', {}, DISCOVERY_LABEL[d.kind].one), h('p', {}, (d.text ?? []).join(' ')))))
        : h('p.hint-dark', {}, 'Lysfolk tablets and pages of field notes you find out in the vale can be read again here.'),
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
        h('h3', {}, 'Battles'),
        h(
          'label.set-row',
          {},
          h('span', {}, 'Solo battle mode'),
          h(
            'div.chips',
            {},
            ...([['ask', 'Ask each time'], ['tactical', 'Turn-based'], ['action', 'Action']] as const).map(([m, label]) =>
              h('button.chip' + (s.battleMode === m ? '.on' : ''), { onclick: () => { s.battleMode = m; commit(); } }, label),
            ),
          ),
          h('span'),
        ),
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
    this.el.append(this.canvas, this.info, h('div.map-controls', {}, h('button.act', {onclick:()=>{const p=this.deps.player();this.viewX=p.x;this.viewZ=p.z;}}, 'Recenter'), h('button.act', {onclick:()=>{this.scale=Math.min(6,this.scale*1.3);}}, '+'), h('button.act', {onclick:()=>{this.scale=Math.max(.35,this.scale/1.3);}}, '−')), h('div.map-legend', {}, h('span', {}, '▲ You'), h('span.legend-partner', {}, '● Partner'), h('span.legend-quest', {}, '◆ Quest'), h('span.legend-find', {}, '■ Found'), h('span', {}, 'Drag to pan · scroll to zoom')));
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
    const found = new Set(this.deps.found());
    for (const d of DISCOVERIES) {
      if (!found.has(d.id)) continue;
      const [sx, sy] = toScreen(d.x, d.z);
      ctx.save();
      ctx.translate(sx, sy);
      ctx.fillStyle = d.kind === 'cache' ? '#c98a4b' : d.kind === 'tablet' ? '#7fe3ff' : '#f4ecd8';
      ctx.strokeStyle = '#1d2b38';
      ctx.lineWidth = 2;
      ctx.fillRect(-4.5, -4.5, 9, 9);
      ctx.strokeRect(-4.5, -4.5, 9, 9);
      ctx.restore();
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
