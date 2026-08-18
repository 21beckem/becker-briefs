import { assert } from '../utils/assert.js';
import { NotePage } from '../models/NotePage.js';
import { HeadingBlock } from '../models/HeadingBlock.js';
import { Bullet } from '../models/Bullet.js';
import { TypeRegistry } from '../registries/TypeRegistry.js';
import { TagRegistry } from '../registries/TagRegistry.js';
import { HeadingBlockView } from './HeadingBlockView.js';
import { BulletView } from './BulletView.js';
import { TagChipView } from './TagChipView.js';
import { TagPickerView } from './TagPickerView.js';
import { BriefsEvents } from '../events/BriefsEvents.js';

/**
 * PageView
 *
 * Owns the DOM for one whole page: the metadata header (name, date,
 * page-level tags) and the ordered content list of heading/bullet
 * views. Rebuilds its content section from scratch on every render()
 * call, which keeps the tree logic simple; BulletView avoids losing
 * focus/caret on plain text edits by not triggering a render() for
 * those (see BriefsEditor).
 */
export class PageView {
  #node;
  #page;
  #typeRegistry;
  #tagRegistry;
  #metaNode;
  #nameNode;
  #dateNode;
  #pageTagRow;
  #pageTagPicker;
  #contentNode;
  #blockViews;

  /**
   * @param {NotePage} page
   * @param {TypeRegistry} typeRegistry
   * @param {TagRegistry} tagRegistry
   */
  constructor(page, typeRegistry, tagRegistry) {
    assert.instanceOf(page, NotePage, 'page');
    assert.instanceOf(typeRegistry, TypeRegistry, 'typeRegistry');
    assert.instanceOf(tagRegistry, TagRegistry, 'tagRegistry');
    this.#page = page;
    this.#typeRegistry = typeRegistry;
    this.#tagRegistry = tagRegistry;
    this.#blockViews = [];
    this.#node = this.#buildNode();
  }

  get node() {
    return this.#node;
  }

  get page() {
    return this.#page;
  }

  #dispatchPageChanged(kind, updater) {
    assert.nonEmptyString(kind, 'kind');
    assert.function_(updater, 'updater');
    this.#node.dispatchEvent(
      new CustomEvent(BriefsEvents.PAGE_CHANGED, {
        bubbles: true,
        detail: { kind, updater },
      })
    );
  }

  #buildNode() {
    const root = document.createElement('div');
    root.className = 'BRIEFS-page';

    this.#metaNode = document.createElement('div');
    this.#metaNode.className = 'BRIEFS-page__meta';

    this.#nameNode = document.createElement('div');
    this.#nameNode.className = 'BRIEFS-page__name';
    this.#nameNode.contentEditable = 'true';
    this.#nameNode.dataset.placeholder = 'Untitled page';
    this.#nameNode.textContent = this.#page.name ?? '';
    this.#nameNode.addEventListener('input', () => {
      const value = this.#nameNode.textContent.trim();
      this.#dispatchPageChanged('text', (page) => page.withName(value.length > 0 ? value : null));
    });
    this.#metaNode.appendChild(this.#nameNode);

    this.#dateNode = document.createElement('div');
    this.#dateNode.className = 'BRIEFS-page__date';
    this.#dateNode.textContent = this.#formatDate(this.#page.date);
    this.#metaNode.appendChild(this.#dateNode);

    this.#pageTagRow = document.createElement('span');
    this.#pageTagRow.className = 'BRIEFS-page__tags';
    this.#renderPageTagChips();
    this.#metaNode.appendChild(this.#pageTagRow);

    const addTagButton = document.createElement('button');
    addTagButton.type = 'button';
    addTagButton.className = 'BRIEFS-page__add-tag';
    addTagButton.textContent = '+ tag';
    addTagButton.addEventListener('click', () => {
      if (this.#pageTagPicker.node.classList.contains('BRIEFS-tag-picker--open')) {
        this.#pageTagPicker.close();
      } else {
        this.#pageTagPicker.open();
      }
    });
    this.#metaNode.appendChild(addTagButton);

    this.#pageTagPicker = new TagPickerView(this.#tagRegistry, (tag) => {
      this.#dispatchPageChanged('tag', (page) => page.withTagAdded(tag));
    });
    this.#pageTagPicker.node.classList.add('BRIEFS-page__tag-picker');
    this.#metaNode.appendChild(this.#pageTagPicker.node);

    root.appendChild(this.#metaNode);

    this.#contentNode = document.createElement('div');
    this.#contentNode.className = 'BRIEFS-page__content';
    root.appendChild(this.#contentNode);

    this.#renderContent();

    return root;
  }

  #formatDate(date) {
    return date.toLocaleDateString(undefined, {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
  }

  #renderPageTagChips() {
    this.#pageTagRow.textContent = '';
    for (const tag of this.#page.tags) {
      const chip = new TagChipView(tag, (tagId) => {
        this.#dispatchPageChanged('tag', (page) => page.withTagRemoved(tagId));
      });
      this.#pageTagRow.appendChild(chip.node);
    }
  }

  #renderContent() {
    this.#contentNode.textContent = '';
    this.#blockViews = this.#page.content.map((block) => {
      if (block instanceof HeadingBlock) {
        const view = new HeadingBlockView(block);
        this.#contentNode.appendChild(view.node);
        return view;
      }
      const view = new BulletView(block, this.#typeRegistry, this.#tagRegistry);
      this.#contentNode.appendChild(view.node);
      return view;
    });
  }

  /**
   * Finds the BulletView or HeadingBlockView anywhere in this page's
   * tree with the given block id, or null if none matches.
   * @param {string} blockId
   * @returns {BulletView|HeadingBlockView|null}
   */
  findBlockView(blockId) {
    assert.nonEmptyString(blockId, 'blockId');
    const search = (views) => {
      for (const view of views) {
        if (view instanceof HeadingBlockView && view.heading.id === blockId) return view;
        if (view instanceof BulletView) {
          if (view.bullet.id === blockId) return view;
          const found = search(view.childViews);
          if (found !== null) return found;
        }
      }
      return null;
    };
    return search(this.#blockViews);
  }

  /**
   * Rebuilds the whole view from a fresh NotePage instance. Used for
   * structural changes and page-metadata changes.
   * @param {NotePage} page
   */
  render(page) {
    assert.instanceOf(page, NotePage, 'page');
    this.#page = page;
    if (document.activeElement !== this.#nameNode) this.#nameNode.textContent = page.name ?? '';
    this.#dateNode.textContent = this.#formatDate(page.date);
    this.#renderPageTagChips();
    this.#renderContent();
  }

  destroy() {
    this.#pageTagPicker.destroy();
    this.#blockViews.forEach((view) => view.destroy());
    this.#node.remove();
  }
}
