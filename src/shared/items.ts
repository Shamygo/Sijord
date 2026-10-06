export type ItemCategory = 'items' | 'balls' | 'battle' | 'materials' | 'tools' | 'key';

export interface ItemInfo {
  id: string;
  name: string;
  category: ItemCategory;
  description: string;
  /** Short glyph shown in the bag grid until item art exists. */
  icon: string;
  sprite?: string;
  heal?: number;
}

export const ITEM_CATEGORIES: { id: ItemCategory; label: string }[] = [
  { id: 'items', label: 'Items' },
  { id: 'balls', label: 'Balls' },
  { id: 'battle', label: 'Battle' },
  { id: 'materials', label: 'Materials' },
  { id: 'tools', label: 'Tools' },
  { id: 'key', label: 'Key items' },
];

export const ITEMS: Record<string, ItemInfo> = {
  'bramble-berry': {
    id: 'bramble-berry', name: 'Oran Berry', category: 'items', icon: '🫐', sprite: 'oran-berry', heal:10,
    description: 'A berry that restores 10 HP to one Pokémon.',
  },
  'water-flask': {
    id: 'water-flask', name: 'Fresh Water', category: 'items', icon: '💧', sprite:'fresh-water', heal:30,
    description: 'Refreshing drinking water. Restores 30 HP to one Pokémon.',
  },
  'bandage': {
    id: 'bandage', name: 'Potion', category: 'items', icon: '🩹', sprite:'potion', heal:20,
    description: 'A spray medicine that restores 20 HP to one Pokémon. In a pinch it also patches up a trainer (30 HP).',
  },
  'treat': {
    id: 'treat', name: 'Treat', category: 'items', icon: '🍪', sprite: 'lava-cookie',
    description: 'A crumbly honey biscuit Pokémon can\'t resist. Throw it while aiming: an angry Pokémon calms down to eat it, and a calm one is too busy eating to notice you.',
  },
  'poke-ball': {
    id: 'poke-ball', name: 'Poke Ball', category: 'balls', icon: '◓', sprite:'poke-ball',
    description: 'A standard ball. Works best on Pokemon weakened in battle and close to your level.',
  },
  'great-ball': {
    id: 'great-ball', name: 'Great Ball', category: 'balls', icon: '◓', sprite: 'great-ball',
    description: 'A better ball with a stronger seal. Half again as likely to hold as a Poke Ball.',
  },
  'ultra-ball': {
    id: 'ultra-ball', name: 'Ultra Ball', category: 'balls', icon: '◓', sprite: 'ultra-ball',
    description: 'A high-grade ball. Twice as likely to hold as a Poke Ball.',
  },
  'wood': {
    id: 'wood', name: 'Wood', category: 'materials', icon: '🪵',
    description: 'Gathered from trees: fallen branches by hand, more with a hatchet. Used for tools.',
  },
  'stone': {
    id: 'stone', name: 'Stone', category: 'materials', icon: '🪨', sprite: 'common-stone',
    description: 'Picked up from the ground, or broken off boulders with a pick. Used for tools.',
  },
  'fiber': {
    id: 'fiber', name: 'Plant Fiber', category: 'materials', icon: '🌾',
    description: 'Pulled from bushes. Twisted into rope and springs for tools and Poke Balls.',
  },
  'red-apricorn': {
    id: 'red-apricorn', name: 'Red Apricorn', category: 'materials', icon: '🍎', sprite: 'red-apricorn',
    description: 'A hard red fruit from apricorn trees. Hollowed out, it becomes the shell of a Poke Ball.',
  },
  'copper-ore': {
    id: 'copper-ore', name: 'Copper Ore', category: 'materials', icon: '🟠', sprite: 'relic-copper',
    description: 'Mined from copper veins with a pick. Hammered into the clasp of a Poke Ball.',
  },
  'stone-hatchet': {
    id: 'stone-hatchet', name: 'Stone Hatchet', category: 'tools', icon: '🪓',
    description: 'A sharpened stone lashed to a handle. Chops a tree for 2-3 Wood instead of a fallen branch. Wears out after 30 uses.',
  },
  'stone-pick': {
    id: 'stone-pick', name: 'Stone Pick', category: 'tools', icon: '⛏',
    description: 'A heavy stone point on a handle. Mines copper veins and breaks stone off boulders. Wears out after 30 uses.',
  },
  'trainer-journal': {
    id: 'trainer-journal', name: 'Trainer Journal', category: 'key', icon: '📓', sprite:'fashion-case',
    description: 'Your notes on the journey so far. Quests are tracked here.',
  },
  'region-map': {
    id: 'region-map', name: 'Sijord Map', category: 'key', icon: '🗺', sprite:'town-map',
    description: 'A hand-drawn map of the Sijord region from Professor Hazel. Fills in as you explore.',
  },
};

/** Most creatures a trainer carries; the rest go to the PC box. */
export const PARTY_MAX = 6;

/** What a new trainer leaves home with. Supplies are thin on purpose. */
export const STARTING_BAG: Record<string, number> = {
  'bramble-berry': 3,
  'water-flask': 1,
  'bandage': 1,
  'trainer-journal': 1,
  'region-map': 1,
};
