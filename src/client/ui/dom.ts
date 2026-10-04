type Child = Node | string | null | undefined | false;

/** Tiny DOM helper: h('div.a.b', { onclick }, child, 'text'). */
export function h<K extends keyof HTMLElementTagNameMap>(
  spec: K | `${K}.${string}`,
  props?: Partial<Record<string, unknown>>,
  ...children: Child[]
): HTMLElementTagNameMap[K];
export function h(spec: string, props?: Partial<Record<string, unknown>>, ...children: Child[]): HTMLElement;
export function h(spec: string, props: Partial<Record<string, unknown>> = {}, ...children: Child[]): HTMLElement {
  const [tag, ...classes] = spec.split('.');
  const el = document.createElement(tag);
  if (classes.length) el.className = classes.join(' ');
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v as EventListener);
    else if (k === 'style' && typeof v === 'string') el.setAttribute('style', v);
    else if (k in el) (el as unknown as Record<string, unknown>)[k] = v;
    else el.setAttribute(k, String(v));
  }
  for (const c of children) if (c) el.append(c);
  return el;
}
