import { h } from './dom';

export interface DialogueLine {
  speaker: string;
  text: string;
  /** Optional choices shown after the line; the chosen index is passed to the script. */
  choices?: string[];
}

/** Typewriter dialogue box. `play` resolves with the choice indexes picked along the way. */
export class DialogueBox {
  readonly el: HTMLDivElement;
  private speaker = h('div.speaker');
  private line = h('div.line');
  private more = h('div.more', {}, '▼ E / Space');
  private choices = h('div.choices');
  private advance: (() => void) | null = null;
  private typing = false;
  private full = '';

  constructor() {
    this.el = h('div.dialogue', { onclick: () => this.next() }, this.speaker, this.line, this.choices, this.more);
  }

  get open(): boolean {
    return this.el.classList.contains('show');
  }

  /** Called on E / Space / click: finish the typewriter, or move to the next line. */
  next(): void {
    if (this.typing) {
      this.typing = false;
      this.line.textContent = this.full;
      return;
    }
    if (this.choices.childElementCount) return;
    this.advance?.();
  }

  async play(lines: DialogueLine[]): Promise<number[]> {
    const picked: number[] = [];
    this.el.classList.add('show');
    for (const l of lines) {
      this.speaker.textContent = l.speaker;
      this.speaker.style.display = l.speaker ? '' : 'none';
      this.choices.replaceChildren();
      await this.type(l.text);
      if (l.choices) {
        this.more.style.visibility = 'hidden';
        picked.push(
          await new Promise<number>((resolve) => {
            this.choices.replaceChildren(
              ...l.choices!.map((c, i) =>
                h('button', {
                  onclick: (e: Event) => {
                    e.stopPropagation();
                    this.choices.replaceChildren();
                    resolve(i);
                  },
                }, c),
              ),
            );
          }),
        );
      } else {
        this.more.style.visibility = '';
        await new Promise<void>((resolve) => (this.advance = resolve));
        this.advance = null;
      }
    }
    this.el.classList.remove('show');
    return picked;
  }

  private type(text: string): Promise<void> {
    this.full = text;
    this.typing = true;
    this.line.textContent = '';
    return new Promise((resolve) => {
      let i = 0;
      const step = () => {
        if (!this.typing) {
          resolve();
          return;
        }
        i += 2;
        this.line.textContent = text.slice(0, i);
        if (i >= text.length) {
          this.typing = false;
          resolve();
        } else setTimeout(step, 22);
      };
      step();
    });
  }
}
