import { afterEach, describe, expect, it } from 'vitest';
import { acceptsEditorShortcut } from './shortcuts';
afterEach(() => { document.body.innerHTML = ''; });
function allowed(target: HTMLElement) {
  let accepted = false;
  const listener = (event: KeyboardEvent) => { accepted = acceptsEditorShortcut(event); };
  window.addEventListener('keydown', listener);
  target.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true, cancelable: true }));
  window.removeEventListener('keydown', listener);
  return accepted;
}
describe('editor keyboard scope', () => {
  it('allows canvas commands but gives forms and portalled controls priority', () => {
    expect(allowed(document.body)).toBe(true);
    document.body.innerHTML = '<form><button>Apply</button></form><div role="combobox"><span>Arial</span></div>';
    expect(allowed(document.querySelector('button')!)).toBe(false);
    expect(allowed(document.querySelector('span')!)).toBe(false);
    document.body.innerHTML = '<div role="dialog" data-open></div>';
    expect(allowed(document.body)).toBe(false);
  });
  it('respects events already handled by controls', () => {
    const event = new KeyboardEvent('keydown', { cancelable: true });
    event.preventDefault();
    expect(acceptsEditorShortcut(event)).toBe(false);
  });
});
