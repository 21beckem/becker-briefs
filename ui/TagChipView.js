import { assert } from '../utils/assert.js';
import { Tag } from '../models/Tag.js';

/**
 * TagChipView
 *
 * A small pill displaying one Tag, with a remove control. Purely
 * presentational -- it dispatches a 'remove' request but never
 * mutates any model itself; the owning BulletView/PageView decides
 * what to do with that request.
 */
export class TagChipView {
  #node;
  #tag;
  #onRemove;

  /**
   * @param {Tag} tag
   * @param {(tagId: string) => void} onRemove
   */
  constructor(tag, onRemove) {
    assert.instanceOf(tag, Tag, 'tag');
    assert.function_(onRemove, 'onRemove');
    this.#tag = tag;
    this.#onRemove = onRemove;
    this.#node = this.#buildNode();
  }

  get node() {
    return this.#node;
  }

  get tag() {
    return this.#tag;
  }

  #buildNode() {
    const chip = document.createElement('span');
    chip.className = 'BRIEFS-tag-chip';
    if (this.#tag.color !== null) chip.style.setProperty('--BRIEFS-tag-color', this.#tag.color);

    const label = document.createElement('span');
    label.className = 'BRIEFS-tag-chip__label';
    label.textContent = this.#tag.label;
    chip.appendChild(label);

    const removeButton = document.createElement('button');
    removeButton.type = 'button';
    removeButton.className = 'BRIEFS-tag-chip__remove';
    removeButton.setAttribute('aria-label', `Remove tag ${this.#tag.label}`);
    removeButton.textContent = '\u00d7';
    removeButton.addEventListener('click', (event) => {
      event.stopPropagation();
      this.#onRemove(this.#tag.id);
    });
    chip.appendChild(removeButton);

    return chip;
  }

  destroy() {
    this.#node.remove();
  }

  static fromObject(obj) {
    assert.plainObject(obj, 'obj');
    return new TagChipView(
      obj.tag, obj.onRemove
    )
  }
}
