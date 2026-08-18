import { assert } from '../utils/assert.js';
import { HeadingBlock } from '../models/HeadingBlock.js';
import { RichTextDom } from '../utils/RichTextDom.js';
import { CaretNav } from '../utils/CaretNav.js';
import { BriefsEvents } from '../events/BriefsEvents.js';

/**
 * HeadingBlockView
 *
 * Owns the DOM node for a single heading block. Edits are applied to
 * its own model instance and reported upward as a bubbling
 * 'briefs:heading-changed' CustomEvent, mirroring BulletView's
 * contract for local edits. Also participates in line-to-line
 * ArrowUp/ArrowDown navigation and Alt+ArrowUp/ArrowDown reordering,
 * same as bullets, since a heading is just another line on the page.
 */
export class HeadingBlockView {
  #node;
  #heading;

  /**
   * @param {HeadingBlock} heading
   */
  constructor(heading) {
    assert.instanceOf(heading, HeadingBlock, 'heading');
    this.#heading = heading;
    this.#node = this.#buildNode();
  }

  get node() {
    return this.#node;
  }

  get heading() {
    return this.#heading;
  }

  #dispatchChanged(updater) {
    assert.function_(updater, 'updater');
    this.#node.dispatchEvent(
      new CustomEvent(BriefsEvents.HEADING_CHANGED, {
        bubbles: true,
        detail: { blockId: this.#heading.id, kind: 'text', updater },
      })
    );
  }

  #dispatchStructural(action, payload = {}) {
    this.#node.dispatchEvent(
      new CustomEvent(BriefsEvents.STRUCTURAL_ACTION, {
        bubbles: true,
        detail: { bulletId: this.#heading.id, action, payload },
      })
    );
  }

  #dispatchNavigate(direction) {
    this.#node.dispatchEvent(
      new CustomEvent(BriefsEvents.NAVIGATE_REQUESTED, {
        bubbles: true,
        detail: { lineId: this.#heading.id, direction },
      })
    );
  }

  #buildNode() {
    const tagName = `h${this.#heading.level}`;
    const node = document.createElement(tagName);
    node.className = `BRIEFS-heading BRIEFS-heading--${this.#heading.level}`;
    node.contentEditable = 'true';
    node.dataset.blockId = this.#heading.id;
    node.dataset.placeholder = 'Heading\u2026';
    RichTextDom.applyToNode(node, this.#heading.text);

    node.addEventListener('input', () => {
      const richText = RichTextDom.toRichText(node);
      this.#dispatchChanged((heading) => heading.withText(richText));
    });

    node.addEventListener('focus', () => {
      node.dispatchEvent(
        new CustomEvent(BriefsEvents.LINE_FOCUSED, {
          bubbles: true,
          detail: { lineId: this.#heading.id },
        })
      );
    });

    node.addEventListener('keydown', (event) => {
      if (event.altKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
        event.preventDefault();
        this.#dispatchStructural(event.key === 'ArrowUp' ? 'move-up' : 'move-down');
        return;
      }
      if (event.key === 'ArrowUp' && !event.shiftKey && CaretNav.isAtFirstVisualLine(node)) {
        event.preventDefault();
        this.#dispatchNavigate('up');
        return;
      }
      if (event.key === 'ArrowDown' && !event.shiftKey && CaretNav.isAtLastVisualLine(node)) {
        event.preventDefault();
        this.#dispatchNavigate('down');
        return;
      }
      if (event.key === 'Enter') {
        event.preventDefault();
      }
    });

    return node;
  }

  /** Focuses this heading's text and places the caret at the end. */
  focusText() {
    this.#node.focus();
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(this.#node);
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);
  }

  /**
   * @param {HeadingBlock} heading
   */
  update(heading) {
    assert.instanceOf(heading, HeadingBlock, 'heading');
    this.#heading = heading;
    if (document.activeElement !== this.#node) {
      RichTextDom.applyToNode(this.#node, heading.text);
    }
  }

  destroy() {
    this.#node.remove();
  }
}
