import { assert } from '../utils/assert.js';
import { TagRegistry } from '../registries/TagRegistry.js';
import { Tag } from '../models/Tag.js';

/**
 * TagPickerView
 *
 * A small dropdown for searching known tags (via an injected
 * TagRegistry) and picking or creating one. Dispatches the chosen Tag
 * back through onPick -- it never touches a Bullet/NotePage directly.
 */
export class TagPickerView {
  #node;
  #registry;
  #onPick;
  #input;
  #results;

  /**
   * @param {TagRegistry} registry
   * @param {(tag: Tag) => void} onPick
   */
  constructor(registry, onPick) {
    assert.instanceOf(registry, TagRegistry, 'registry');
    assert.function_(onPick, 'onPick');
    this.#registry = registry;
    this.#onPick = onPick;
    this.#node = this.#buildNode();
  }

  get node() {
    return this.#node;
  }

  #buildNode() {
    const root = document.createElement('div');
    root.className = 'BRIEFS-tag-picker';

    this.#input = document.createElement('input');
    this.#input.type = 'text';
    this.#input.className = 'BRIEFS-tag-picker__input';
    this.#input.placeholder = 'Find or create a tag\u2026';
    this.#input.addEventListener('input', () => this.#renderResults());
    this.#input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        this.#createFromInput();
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        this.close();
      }
    });
    root.appendChild(this.#input);

    this.#results = document.createElement('ul');
    this.#results.className = 'BRIEFS-tag-picker__results';
    root.appendChild(this.#results);

    return root;
  }

  #renderResults() {
    const query = this.#input.value;
    const matches = this.#registry.find(query);
    this.#results.textContent = '';
    matches.forEach((tag) => {
      const item = document.createElement('li');
      item.className = 'BRIEFS-tag-picker__result';
      item.textContent = tag.label;
      item.addEventListener('click', () => {
        this.#onPick(tag);
        this.close();
      });
      this.#results.appendChild(item);
    });
    if (
      query.trim().length > 0 &&
      !matches.some((tag) => tag.label.toLowerCase() === query.trim().toLowerCase())
    ) {
      const createItem = document.createElement('li');
      createItem.className = 'BRIEFS-tag-picker__result BRIEFS-tag-picker__result--create';
      createItem.textContent = `Create tag \u201c${query.trim()}\u201d`;
      createItem.addEventListener('click', () => this.#createFromInput());
      this.#results.appendChild(createItem);
    }
  }

  async #createFromInput() {
    const label = this.#input.value.trim();
    if (label.length === 0) return;
    const tag = await this.#registry.createTag(label);
    this.#onPick(tag);
    this.close();
  }

  /** Opens the picker, focuses its input, and shows the full tag list. */
  open() {
    this.#input.value = '';
    this.#renderResults();
    this.#node.classList.add('BRIEFS-tag-picker--open');
    this.#input.focus();
  }

  close() {
    this.#node.classList.remove('BRIEFS-tag-picker--open');
  }

  destroy() {
    this.#node.remove();
  }

  static fromObject(obj) {
    assert.plainObject(obj, 'obj');
    return new TagPickerView(
      obj.tagRegistry,
      obj.onPick
    )
  }
}
