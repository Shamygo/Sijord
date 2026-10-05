import { h } from './dom';

export interface TitleResult {
  /** Room code both players type to share a world. */
  room: string;
  /** Whether to reuse the saved trainer instead of opening the creator. */
  continueSaved: boolean;
}

export function showTitle(parent: HTMLElement, hasSave: boolean, savedRoom: string): Promise<TitleResult> {
  return new Promise((resolve) => {
    const room = h('input', { value: savedRoom, maxLength: 32, placeholder: 'e.g. bramblewick', spellcheck: false });
    const finish = (continueSaved: boolean) => {
      screen.remove();
      resolve({ room: room.value.trim().toLowerCase() || 'bramblewick', continueSaved });
    };
    const screen = h(
      'div.screen',
      {},
      h(
        'div.title-card',
        {},
        h('h1.logo', {}, 'Sijord'),
        h('p.subtitle', {}, 'A two-player open world adventure'),
        h('label.field', {}, 'World code (share it with your partner)', room),
        hasSave ? h('button.btn', { onclick: () => finish(true) }, 'Continue') : null,
        h('button.btn' + (hasSave ? '.secondary' : ''), { onclick: () => finish(false) }, hasSave ? 'New trainer' : 'Start'),
        h('a', { href: location.protocol === 'file:' ? 'https://shamygo.github.io/Sijord/pokemon.html' : './pokemon.html', style: 'display:block;margin-top:18px' }, 'Explore the Pokémon model library'),
        h('p.hint', {}, 'Both players type the same world code to play together. Your partner appears once they join.'),
      ),
    );
    parent.append(screen);
  });
}
