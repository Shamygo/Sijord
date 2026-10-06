/**
 * Hand-placed things to find in Hearthmeadow Vale (DESIGN §12.2-12.3): supply caches with a few
 * scarce supplies, Lysfolk tablets (lore; Professor Hazel pays for rubbings) and pages of
 * Hazel's old field notes (how the vale's Pokémon behave). Each player finds each one once, in
 * their own save, so both friends get the same chances.
 *
 * Positions are world metres (north = +Z, east = -X). `onTop` places a find on top of the rock or
 * cliff under it (climb to reach it) rather than on the ground.
 */
export type DiscoveryKind = 'cache' | 'tablet' | 'note';

export interface Discovery {
  /** Save id. Never rename one: saves remember finds by id. */
  id: string;
  kind: DiscoveryKind;
  x: number;
  z: number;
  /** Facing (yaw) of the prop. */
  yaw?: number;
  onTop?: boolean;
  /** Cache contents, item id to count. */
  loot?: Record<string, number>;
  /** Tablet inscription or field note text, one dialogue page per entry. */
  text?: string[];
}

export const DISCOVERIES: Discovery[] = [
  // ---- Supply caches: the harder to reach, the better the haul ----
  { id: 'cache-arch', kind: 'cache', x: 57, z: -135, yaw: 0.4, loot: { 'poke-ball': 1 } },
  { id: 'cache-camp', kind: 'cache', x: 125, z: -255, yaw: -2.1, loot: { bandage: 1 } },
  { id: 'cache-lone-tree', kind: 'cache', x: 217.6, z: -122.4, yaw: 2.4, loot: { treat: 1 } },
  { id: 'cache-junction-rock', kind: 'cache', x: 65, z: -30, yaw: 1, onTop: true, loot: { 'poke-ball': 2 } },
  { id: 'cache-pond', kind: 'cache', x: -127.1, z: 121.6, yaw: -1.1, loot: { 'bramble-berry': 2 } },
  { id: 'cache-lake', kind: 'cache', x: -98, z: -260, yaw: 2.6, loot: { 'water-flask': 1, 'poke-ball': 1 } },
  { id: 'cache-bridge', kind: 'cache', x: -203.2, z: -13.8, yaw: -1.45, loot: { 'poke-ball': 2 } },
  { id: 'cache-stones', kind: 'cache', x: -300, z: 303.4, yaw: 0, loot: { bandage: 1, treat: 1 } },
  { id: 'cache-rock-west', kind: 'cache', x: 346, z: 121, yaw: 0.6, onTop: true, loot: { treat: 1 } },
  { id: 'cache-rock-east', kind: 'cache', x: -433, z: -301, yaw: -0.4, onTop: true, loot: { 'poke-ball': 2 } },
  { id: 'cache-rock-north-east', kind: 'cache', x: -399, z: 182, yaw: 2, onTop: true, loot: { bandage: 1 } },
  { id: 'cache-mesa-ruins', kind: 'cache', x: 262, z: 183, yaw: -0.5, onTop: true, loot: { 'great-ball': 1, bandage: 1 } },
  { id: 'cache-mesa-north', kind: 'cache', x: 165, z: 300, yaw: 1.2, onTop: true, loot: { 'poke-ball': 2, treat: 1 } },
  { id: 'cache-mesa-twin-arches', kind: 'cache', x: 338, z: 18, yaw: 1.2, onTop: true, loot: { 'great-ball': 1 } },
  { id: 'cache-mesa-temple', kind: 'cache', x: 414, z: 260, yaw: Math.PI / 2, onTop: true, loot: { 'great-ball': 2, bandage: 1 } },
  { id: 'cache-mesa-small', kind: 'cache', x: 95, z: 375, yaw: -0.8, onTop: true, loot: { bandage: 1, 'poke-ball': 1 } },
  { id: 'cache-north-west-woods', kind: 'cache', x: 450, z: 440, yaw: 2.6, loot: { 'bramble-berry': 2, 'poke-ball': 1 } },

  // ---- Lysfolk tablets ----
  { id: 'tablet-arch', kind: 'tablet', x: 54, z: -121, yaw: 0.4, text: ['We raised this gate where the meadow meets the first light. Walk through it facing north, and remember who walked before you.'] },
  { id: 'tablet-stones', kind: 'tablet', x: -300, z: 293, yaw: 0, text: ['Nine stones for nine winters. In the tenth the sky-dancer came, and the snow went quiet.'] },
  { id: 'tablet-mesa-ruins', kind: 'tablet', x: 263.1, z: 178.5, yaw: -0.5, onTop: true, text: ['The beasts of the vale are not ours to keep. They walk beside us by choice, and a choice can be unmade.'] },
  { id: 'tablet-mesa-twin-arches', kind: 'tablet', x: 352, z: 32, yaw: 1.2, onTop: true, text: ['When the sun would not set, the grass burned. When the sun would not rise, the rivers froze.', 'Only the dancing light held the two apart.'] },
  { id: 'tablet-mesa-temple', kind: 'tablet', x: 402, z: 260, yaw: Math.PI / 2, onTop: true, text: ['Keep the Vigil. Light the fires on the longest night, and the dancer will come to see who still remembers.'] },
  { id: 'tablet-mesa-north-foot', kind: 'tablet', x: 165, z: 242, yaw: Math.PI, text: ['The strong climbed the bare rock and rested only where the rock allowed. The wise rested first.'] },
  { id: 'tablet-north-meadow', kind: 'tablet', x: 0, z: 450, yaw: Math.PI, text: ['Here the herds gathered every spring. We counted them, and they counted us.'] },
  { id: 'tablet-riverside', kind: 'tablet', x: -330, z: 100, yaw: -1.6, text: ['The river remembers the mountain. Follow it far enough and it will tell you where it was born.'] },
  { id: 'tablet-south-woods', kind: 'tablet', x: 430, z: -420, yaw: 0.8, text: ['A light runs under this land like water under ice. Where it rises, the stones hum and the creatures gather.'] },
  { id: 'tablet-lake-outlet', kind: 'tablet', x: -300, z: -380, yaw: -2.4, text: ['Do not chain what gives you warmth. The ones who tried are under the lake.'] },

  // ---- Hazel's lost field notes ----
  { id: 'note-gate', kind: 'note', x: 8, z: -262, yaw: Math.PI, text: ['Come at their backs. A Pokémon that hasn\'t noticed you is far easier to catch, but they watch a wide arc to either side, and once one is alert it stays alert.', '— H.'] },
  { id: 'note-junction', kind: 'note', x: -14, z: -50, yaw: 0.5, text: ['Mind the temperaments. A skittish one bolts the moment a trainer sprints at it, and takes its skittish friends along. A territorial one doesn\'t run at all.', '— H.'] },
  { id: 'note-pond', kind: 'note', x: -96, z: 141, yaw: -2.2, text: ['Water-lovers keep to the water. Poliwag in the shallows here, Psyduck along the lake. You won\'t find them out on the dry meadow.', '— H.'] },
  { id: 'note-camp', kind: 'note', x: 124, z: -269, yaw: -2.1, text: ['A failed ball makes enemies. When one charges, don\'t run in a straight line: it stops dead just before it lunges. Roll aside the moment it commits.', '— H.'] },
  { id: 'note-lone-tree', kind: 'note', x: 210, z: -130, yaw: 2.4, text: ['Treats are worth more than a ball. An angry Pokémon stops to eat one, and a calm one that\'s eating won\'t notice you creeping up from any side.', '— H.'] },
  { id: 'note-mesa-foot', kind: 'note', x: 262, z: 104, yaw: Math.PI, text: ['The mesa walls can be climbed, but they\'re cruel to tired arms. Catch your breath before you start: one face takes everything you have.', '— H.'] },
  { id: 'note-bridge', kind: 'note', x: -236, z: -20, yaw: 1.6, text: ['Geodude sit so still on the mesa slopes you\'ll walk right past them. Rarer still: I\'ve seen Pikachu and Eevee in this vale, and an Abra that vanished the moment it saw me.', '— H.'] },
  { id: 'note-north-east', kind: 'note', x: -470, z: 430, yaw: -2.6, text: ['Herds don\'t stay put. Clear a meadow and it fills up again before long, often with different faces.', '— H.'] },
  { id: 'note-east-woods', kind: 'note', x: -420, z: -250, yaw: -1.2, text: ['A ball that lands short is not just a lost throw. Every Pokémon near where it lands hears it.', '— H.'] },
];

export const DISCOVERY_LABEL: Record<DiscoveryKind, { one: string; many: string; prompt: string }> = {
  cache: { one: 'Supply cache', many: 'Supply caches', prompt: 'Open the supply cache' },
  tablet: { one: 'Lysfolk tablet', many: 'Lysfolk tablets', prompt: 'Read the Lysfolk tablet' },
  note: { one: 'Field note', many: 'Field notes', prompt: 'Take the field note' },
};

/** Found and total per kind. */
export function discoveryCounts(found: readonly string[]): Record<DiscoveryKind, { found: number; total: number }> {
  const have = new Set(found);
  const out: Record<DiscoveryKind, { found: number; total: number }> = { cache: { found: 0, total: 0 }, tablet: { found: 0, total: 0 }, note: { found: 0, total: 0 } };
  for (const d of DISCOVERIES) {
    out[d.kind].total++;
    if (have.has(d.id)) out[d.kind].found++;
  }
  return out;
}

/** Hazel pays one Great Ball for every this many tablets you tell her about. */
export const TABLETS_PER_REWARD = 3;

/** Great Balls Hazel owes for the tablets read since she last heard about them, and the new reported count. */
export function tabletReward(found: readonly string[], reported: number): { balls: number; reported: number } {
  const read = discoveryCounts(found).tablet.found;
  return { balls: Math.max(0, Math.floor(read / TABLETS_PER_REWARD) - Math.floor(reported / TABLETS_PER_REWARD)), reported: Math.max(read, reported) };
}

export function discoveryById(id: string): Discovery | undefined {
  return DISCOVERIES.find((d) => d.id === id);
}
