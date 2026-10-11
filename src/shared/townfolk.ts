import type { Appearance } from './types';
import { BIOMES, biomeAt, nearestSettlement, type Settlement } from './region';
import type { NpcSpot } from './settlement-layout';

/**
 * The people of Sijord's towns (DESIGN §12): who stands at each of a settlement's NPC spots,
 * what they look like and what they have to say. Deterministic per settlement and spot, so both
 * players meet the same people. Names avoid the canon cast (gym leaders, the rival, the Tether
 * admins, the League).
 */
export interface Townsperson {
  id: string;
  name: string;
  role: NpcSpot['role'];
  look: Appearance;
  size: number;
  lines: string[];
}

const NAMES = [
  'Aksel', 'Alma', 'Arvid', 'Birgit', 'Dagny', 'Einar', 'Elin', 'Erik', 'Frida', 'Gro', 'Hakon', 'Hedda', 'Hilde', 'Ivar', 'Jorunn',
  'Kaja', 'Kjell', 'Lars', 'Linnea', 'Malin', 'Nils', 'Oda', 'Ola', 'Ragnhild', 'Rune', 'Saga', 'Sigrid', 'Solveig', 'Steinar', 'Tora',
  'Trond', 'Ulf', 'Unni', 'Vidar', 'Yngve', 'Agnes', 'Mats', 'Ebba', 'Folke', 'Greta', 'Henrik', 'Ingeborg', 'Joar', 'Karin', 'Leif',
  'Maja', 'Nora', 'Otto', 'Petra', 'Roald', 'Sanna', 'Vera', 'Wilma', 'Halvor', 'Embla', 'Brage', 'Idun', 'Jens', 'Kari-Anne', 'Liss',
];

const SKIN = ['#f2c9a0', '#e8b48a', '#d9a77e', '#c68c62', '#a8714a', '#8a5a3a', '#f6d7b8', '#6e4630'];
const HAIR = ['#2b1d14', '#5a3a22', '#8b5a2b', '#c9a26a', '#e6d3a3', '#8b8b8b', '#d9d9d9', '#a33a2a', '#3a2a1a'];
const JACKET: Record<Settlement['style'], string[]> = {
  meadow: ['#4f86c6', '#6b7f3a', '#c8473a', '#d9a24a', '#7d5bb8'],
  timber: ['#8a3a2c', '#5a6b3a', '#3d5f7a', '#b07a46'],
  stilt: ['#5a6b4a', '#6e6252', '#4a5a5a', '#8a7a52'],
  stone: ['#5a6878', '#7a5a8a', '#4d5866', '#8a6a4a'],
  ice: ['#3d6fc4', '#f4f6f8', '#8ab4d8', '#c8473a'],
  adobe: ['#d9553f', '#3d8fc4', '#f0c43a', '#4fa86a'],
  basalt: ['#3a3836', '#6a4a3a', '#8a3a2c', '#5a5a62'],
  harbour: ['#c8473a', '#f0c43a', '#3d6fc4', '#2f4f5f'],
  castle: ['#3d5f9a', '#f0c43a', '#d8d2c4', '#7a2a3a'],
};
const PANTS = ['#3d4a5c', '#5a4632', '#2f2f36', '#6a5a4a', '#4a5a3a'];

function rng(seed: string): () => number {
  let a = 2166136261;
  for (let i = 0; i < seed.length; i++) a = Math.imul(a ^ seed.charCodeAt(i), 16777619);
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(r: () => number, list: readonly T[]): T {
  return list[Math.floor(r() * list.length)];
}

function compass(dx: number, dz: number): string {
  const names = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];
  return names[(Math.round(Math.atan2(-dx, dz) / (Math.PI / 4)) + 8) % 8];
}

/** Advice a local gives, by what lies around their town. */
function localTips(s: Settlement): string[] {
  const b = biomeAt(s.x, s.z);
  const tips: Record<string, string> = {
    meadow: 'Weaken a wild Pokémon in battle before you throw. A full-health one shrugs off a ball, and the strong ones turn on you.',
    mirefen: 'Mind the bog after dark: the Gastly come out of the mist, and they don\'t like lanterns any more than you\'d like them.',
    elderwood: 'Paras spores send you to sleep on your feet. Keep to the paths under the big trees.',
    heath: 'The standing stones hum when the aurora\'s out. Folk say the Lysfolk built them to listen to the sky.',
    fjord: 'The water in the fjords is cold enough to stop your heart. Don\'t try to swim it, find the ferry.',
    badlands: 'Carry water in the badlands. Two canteens if you\'ve any sense. The canyons don\'t forgive.',
    skerry: 'The reef Pokémon are strong out here. If you\'ve fewer than five badges, keep your head down.',
    ashen: 'Don\'t step in the bright channels. That\'s not water, that\'s the mountain\'s blood.',
    tundra: 'Up here a lantern is life. And a full belly: the cold eats at you faster than you\'d think.',
    peaks: 'The Pokémon on the Stormcrown answer to nobody below seventy. If yours won\'t listen, it isn\'t sulking. It\'s wild.',
  };
  const near = nearestSettlement(s.x, s.z, (o) => o.tier === 'large' && o.id !== s.id).s;
  const d = Math.hypot(near.x - s.x, near.z - s.z);
  const gym = near.gym ? `${near.name}'s gym is ${Math.round(d / 100) / 10} km ${compass(near.x - s.x, near.z - s.z)} of here. Leader ${near.gym.leader} trains ${near.gym.type} types, and they say you'll need a partner just to get through the door.` : `${near.name} is ${Math.round(d / 100) / 10} km ${compass(near.x - s.x, near.z - s.z)} of here. ${near.lock ? `They only let you in with ${near.lock.badges} badges.` : ''}`;
  return [tips[b], gym, `This is ${BIOMES[b].name} country. ${BIOMES[b].blurb} The wild ones round here run from level ${BIOMES[b].levels[0]} to ${BIOMES[b].levels[1]}.`];
}

const GENERAL = [
  'Every gym leader adapts to the trainers who come through their doors. Beat a strong one and the rest will be waiting with stronger teams.',
  'Your Pokémon won\'t grow past what your badges allow. They keep learning, mind. It all comes out the day you earn the next one.',
  'Catch something far above your level and it may not listen to you. Treats help. So does time.',
  'Armour won\'t win a battle, but it\'ll keep you standing when a wild one charges.',
  'Krane Industries are hiring again. Good money, they say. My cousin went to Jernhamn and stopped writing.',
  'There\'s talk of men in grey coats in the hills at night, with cages on their carts. Krane people, or so they claim.',
  'Prices at the Poké Mart went up again. They say the supply carts are being robbed on the roads.',
  'The aurora was bright last month. My grandmother says that means something is waking up in the north.',
  'A Pokémon Center will put you on their register. After that their flying taxis will take you between Centers you\'ve visited.',
  'The inn will put you up for a night. Worth it, if you\'ve been living on mushrooms.',
  'Sunniva came through here, the professor\'s niece. Beat every trainer on the square and left without buying anything.',
  'Never build inside a town\'s bounds. The wardens will have it down before you\'ve laid the second wall.',
];

/** The person at one NPC spot of a settlement. */
export function townsperson(s: Settlement, index: number, spot: NpcSpot): Townsperson {
  const r = rng(`${s.id}:${index}`);
  const name = pick(r, NAMES);
  const look: Appearance = {
    trainerModel: 'custom', skinTone: pick(r, SKIN), hairColor: pick(r, HAIR), hairStyle: Math.floor(r() * 4),
    jacketColor: pick(r, JACKET[s.style]), pantsColor: pick(r, PANTS), build: r() < 0.5 ? 0 : 1,
  };
  const child = spot.role === 'villager' && r() < 0.18;
  const size = child ? 0.72 : 0.94 + r() * 0.1;
  let lines: string[];
  switch (spot.role) {
    case 'nurse': lines = [`Welcome to the ${s.name} Pokémon Center. Step inside if your team needs looking after.`]; break;
    case 'clerk': lines = ['Fresh stock in this morning. Come in and have a look.']; break;
    case 'innkeeper': lines = ['Beds upstairs, stew on the hob. Come in out of the wind.']; break;
    case 'guide': lines = s.gym ? [`The ${s.gym.puzzle} trial is no joke. You'll need a partner on the other plate, and you'll need to talk to each other.`, `Leader ${s.gym.leader} plays to win. Bring items, bring a plan.`] : ['The tower opens to trainers with five badges. Floor by floor, it only gets harder.']; break;
    case 'guard': lines = ['Ten badges, or turn around. Those are the League\'s rules, not mine.']; break;
    case 'elder': lines = [s.quirk ? `Welcome to ${s.name}. You'll have heard: ${s.quirk.charAt(0).toLowerCase()}${s.quirk.slice(1)} We're proud of it.` : `Welcome to ${s.name}, traveller. ${s.tagline}. Mind your manners and you'll be welcome back.`, ...localTips(s).slice(1, 2)]; break;
    default: {
      const pool = [...localTips(s), ...GENERAL];
      if (s.quirk) pool.push(`You know what they say about ${s.name}? ${s.quirk}`);
      const a = pick(r, pool);
      let b = pick(r, pool);
      if (b === a) b = pool[(pool.indexOf(a) + 3) % pool.length];
      lines = child ? [pick(r, ['When I grow up I\'m going to catch a Dragonite. Or a Magikarp. Whichever comes first.', 'My dad says I can have a Pokémon when I can carry one. I\'ve been practising with a pumpkin.', 'Have you got a badge? Can I hold it? I won\'t run off. Probably.'])] : [a, b];
    }
  }
  return { id: `${s.id}:${index}`, name: spot.role === 'villager' || spot.role === 'elder' ? (spot.role === 'elder' ? `Elder ${name}` : name) : roleName(spot.role, name), role: spot.role, look, size, lines };
}

function roleName(role: NpcSpot['role'], name: string): string {
  return role === 'nurse' ? `Nurse ${name}` : role === 'clerk' ? `Clerk ${name}` : role === 'innkeeper' ? `Innkeeper ${name}` : role === 'guide' ? `Guide ${name}` : role === 'guard' ? `Guard ${name}` : name;
}

