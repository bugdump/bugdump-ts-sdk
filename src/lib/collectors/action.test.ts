/** @vitest-environment happy-dom */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ActionCollector } from './action';

// A browser retargets an event from inside a closed shadow root to its host, and happy-dom
// does not. So the test dispatches on the host, which is what a document listener receives.
function mountWithClosedShadow(tag: string): HTMLElement {
  const host = document.createElement(tag);
  host.attachShadow({ mode: 'closed' }).appendChild(document.createElement('button'));
  document.body.appendChild(host);
  return host;
}

function click(el: Element): void {
  el.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));
}

describe('ActionCollector', () => {
  let collector: ActionCollector;

  beforeEach(() => {
    collector = new ActionCollector();
    collector.start();
  });

  afterEach(() => {
    collector.stop();
    document.body.innerHTML = '';
  });

  it('records a click on the page', () => {
    const button = document.createElement('button');
    document.body.appendChild(button);

    click(button);

    expect(collector.snapshot()).toEqual([expect.objectContaining({ kind: 'click', selector: '<button>' })]);
  });

  it('skips clicks inside the widget', () => {
    click(mountWithClosedShadow('bugdump-widget'));

    expect(collector.snapshot()).toEqual([]);
  });

  it('skips clicks inside the screenshot annotation overlay', () => {
    click(mountWithClosedShadow('bugdump-annotation'));

    expect(collector.snapshot()).toEqual([]);
  });
});
