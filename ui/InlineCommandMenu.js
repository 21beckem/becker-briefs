import { assert } from '../utils/assert.js';

/**
 * InlineCommandMenu
 *
 * A small popup used for both the "/type-name" and "#tag-name" inline
 * triggers. It knows nothing about types or tags specifically -- it
 * just renders a list of { id, label } items, tracks a highlighted
 * index (cycled with Tab), and reports the chosen item back through
 * onSelect. The owner (BulletView) is responsible for deciding what
 * "selecting" an item actually means.
 */
export class InlineCommandMenu {
  #node;
  #list;
  #items;
  #highlightIndex;
  #onSelect;

  /**
   * @param {(item: {id: string, label: string}) => void} onSelect
   */
  constructor(onSelect) {
    assert.function_(onSelect, 'onSelect');
    this.#onSelect = onSelect;
    this.#items = [];
    this.#highlightIndex = 0;
    this.#node = this.#buildNode();
  }

  get node() {
    return this.#node;
  }

  get isOpen() {
    return this.#node.classList.contains('BRIEFS-inline-menu--open');
  }

  get itemCount() {
    return this.#items.length;
  }

  #buildNode() {
    const root = document.createElement('div');
    root.className = 'BRIEFS-inline-menu';
    this.#list = document.createElement('ul');
    this.#list.className = 'BRIEFS-inline-menu__list';
    root.appendChild(this.#list);
    return root;
  }

  /**
   * @param {{id: string, label: string}[]} items
   */
  setItems(items) {
    assert.array(items, 'items');
    this.#items = items;
    this.#highlightIndex = 0;
    this.#list.textContent = '';
    items.forEach((item, index) => {
      const entry = document.createElement('li');
      entry.className = 'BRIEFS-inline-menu__item';
      entry.textContent = item.label;
      entry.addEventListener('mousedown', (event) => event.preventDefault());
      entry.addEventListener('click', () => this.#onSelect(item));
      this.#list.appendChild(entry);
    });
    this.#applyHighlight();
  }

  #applyHighlight() {
    [...this.#list.children].forEach((child, index) => {
      child.classList.toggle('BRIEFS-inline-menu__item--highlighted', index === this.#highlightIndex);
    });
  }

  /** Moves the highlight to the next item, wrapping around. */
  cycle(direction='down') {
    if (!['down', 'up'].includes(direction))
      throw new TypeError('unknown direction. Cycle expects either "up" or "down"');
    if (this.#items.length === 0) return;
    const dir = direction === 'down' ? 1 : -1;
    this.#highlightIndex = (this.#highlightIndex + dir) % this.#items.length;
    if (this.#applyHighlight < 0) this.#applyHighlight = this.#items.length - 1;
    this.#applyHighlight();
  }


  /** Invokes onSelect with the currently highlighted item, if any. */
  selectHighlighted() {
    if (this.#items.length === 0) return;
    this.#onSelect(this.#items[this.#highlightIndex]);
  }

  /**
   * @param {number} left position in px, relative to the nearest
   *   positioned ancestor
   * @param {number} top position in px
   */
  show(left, top) {
    assert.integer(Math.round(left), 'left');
    assert.integer(Math.round(top), 'top');
    this.#node.style.left = `${left}px`;
    this.#node.style.top = `${top}px`;
    this.#node.classList.add('BRIEFS-inline-menu--open');
  }

  hide() {
    this.#node.classList.remove('BRIEFS-inline-menu--open');
  }

  destroy() {
    this.#node.remove();
  }
}
