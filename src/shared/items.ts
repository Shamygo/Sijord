export type ItemCategory = 'items' | 'balls' | 'battle' | 'materials' | 'key';

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
    description: 'A spray medicine that restores 20 HP to one Pokémon.',
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
    description: 'Gathered from trees. Used for tools, fences and your first workbench.',
  },
  'stone': {
    id: 'stone', name: 'Stone', category: 'materials', icon: '🪨',
    description: 'Gathered from rocks. Used for tools and sturdier buildings.',
  },
  'fiber': {
    id: 'fiber', name: 'Plant Fiber', category: 'materials', icon: '🌾',
    description: 'Pulled from tall grass. Used for rope, bandages and basic clothing.',
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
