import { assert } from './utils/assert.js';
import { IdGenerator } from './utils/IdGenerator.js';
import { Tag } from './models/Tag.js';
import { BulletTreeOps } from './utils/BulletTreeOps.js';
import { UndoManager } from './utils/UndoManager.js';
import { NotePage } from './models/NotePage.js';
import { HeadingBlock } from './models/HeadingBlock.js';
import { Bullet } from './models/Bullet.js';
import { RichText } from './models/RichText.js';
import { TypeRegistry } from './registries/TypeRegistry.js';
import { TagRegistry } from './registries/TagRegistry.js';
import { PersistenceAdapter } from './persistence/PersistenceAdapter.js';
import { PageView } from './ui/PageView.js';
import { BulletView } from './ui/BulletView.js';
import { HeadingBlockView } from './ui/HeadingBlockView.js';
import { MobileActionBar } from './ui/MobileActionBar.js';
import { BriefsEvents } from './events/BriefsEvents.js';

const AUTOSAVE_DELAY_MS = 500;

/**
 * BriefsEditor
 *
 * The single public entry point for the briefs module. Mounts a
 * self-contained outline editor into a host-supplied container, using
 * only host-injected configuration (TypeRegistry, TagRegistry,
 * PersistenceAdapter). Never reaches outside of its own DOM subtree
 * or assumes anything about the app it's embedded in.
 */
export class BriefsEditor {
  #node;
  #page;
  #typeRegistry;
  #tagRegistry;
  #persistenceAdapter;
  #pageView;
  #actionBar;
  #statusNode;
  #focusedLineId;
  #saveTimer;
  #undoManager;
  #selectionChangeHandler;

  /**
   * @param {HTMLElement} container element to mount into
   * @param {TypeRegistry} typeRegistry
   * @param {TagRegistry} tagRegistry
   * @param {PersistenceAdapter} persistenceAdapter
   * @param {NotePage} initialPage
   */
  constructor(container, styleContainer, typeRegistry, tagRegistry, persistenceAdapter, initialPage) {
    assert.htmlElement(container, 'container');
    assert.htmlElement(styleContainer, 'styleContainer');
    assert.instanceOf(typeRegistry, TypeRegistry, 'typeRegistry');
    assert.instanceOf(tagRegistry, TagRegistry, 'tagRegistry');
    assert.instanceOf(persistenceAdapter, PersistenceAdapter, 'persistenceAdapter');
    assert.instanceOf(initialPage, NotePage, 'initialPage');
    
    this.#appendPreconnect(styleContainer, 'https://fonts.googleapis.com', false);
    this.#appendPreconnect(styleContainer, 'https://fonts.gstatic.com', true);
    this.#appendStylesheet(styleContainer, 'https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600&family=Source+Serif+4:ital,wght@0,400;0,600;1,400&family=IBM+Plex+Mono:wght@400;500&display=swap');
    this.#appendStylesheet(styleContainer, './ui/styles.css');

    this.#typeRegistry = typeRegistry;
    this.#tagRegistry = tagRegistry;
    this.#persistenceAdapter = persistenceAdapter;
    this.#page = initialPage;
    this.#focusedLineId = null;
    this.#saveTimer = null;

    this.#node = document.createElement('div');
    this.#node.className = 'BRIEFS-editor';
    this.#node.tabIndex = -1;

    this.#pageView = PageView.fromObject({
      page: this.#page,
      typeRegistry: this.#typeRegistry,
      tagRegistry: this.#tagRegistry
    });
    this.#node.appendChild(this.#pageView.node);

    this.#statusNode = document.createElement('div');
    this.#statusNode.className = 'BRIEFS-editor__status';
    this.#statusNode.textContent = 'Becker Briefs';
    this.#node.appendChild(this.#statusNode);

    this.#actionBar = MobileActionBar.fromObject({ navigator: navigator });
    this.#node.appendChild(this.#actionBar.node);

    this.#undoManager = this.#buildUndoManager();
    this.#attachListeners();

    container.appendChild(this.#node);
    this.#updateActionBarContext();
  }
  
  #appendStylesheet(container, linkToFile) {
    assert.htmlElement(container, 'container');
    assert.nonEmptyString(linkToFile, 'linkToFile');

    const rel = document.createElement('link');
    rel.rel = 'stylesheet';
    rel.href = (linkToFile.trim().startsWith('http')) ? linkToFile : new URL(linkToFile, import.meta.url).href;
    container.appendChild(rel);
  } 
  #appendPreconnect(container, link, isCrossOrigin) {
    assert.htmlElement(container, 'container');
    assert.nonEmptyString(link, 'link')
    assert.boolean(isCrossOrigin, 'isCrossOrigin');
    const rel = document.createElement('link');
    rel.rel = 'preconnect';
    rel.href = link;
    if (isCrossOrigin) rel.setAttribute('crossorigin', '');
    container.appendChild(rel);
  } 

  get node() {
    return this.#node;
  }

  #buildUndoManager() {
    return UndoManager.fromObject({
      getSnapshot: () => {
        return this.#page.toObject(this.#focusedLineId)
      },
      onRestore: (snapshot) => {
        this.#page = NotePage.fromObject(snapshot);
        this.#pageView.render(this.#page);
        this.#scheduleSave();
        this.#updateActionBarContext();
        // A full re-render tears down every focused contenteditable,
        // so keyboard focus would otherwise fall out of the editor
        // entirely -- refocus the editor root itself so a follow-up
        // shortcut (e.g. redo right after undo) still reaches us.
        this.#node.focus();

        if (snapshot.focusId)
          this.#refocus(snapshot.focusId);
      }
    });
  }

  #attachListeners() {
    this.#node.addEventListener(BriefsEvents.LINE_FOCUSED, (event) => {
      this.#focusedLineId = event.detail.lineId;
      this.#updateActionBarContext();
    });
    this.#node.addEventListener('focusout', (event) => {
      this.#updateActionBarContext();
    });

    if ('virtualKeyboard' in navigator) {
      navigator.virtualKeyboard.overlaysContent = true;
    } else {
      alert('no virtualKeyboard!');
      navigator.virtualKeyboard.addEventListener('geometrychange', (event) => {
        const { x, y, width, height } = event.target.boundingRect;
        const p = document.createElement('p');
        p.textContent = JSON.stringify({ x, y, width, height });
        this.node.parentElement.prepend(p);
      });
    }

    this.#node.addEventListener(BriefsEvents.BULLET_CHANGED, (event) => {
      const { bulletId, kind, updater } = event.detail;
      if (kind === 'text') this.#undoManager.beginTypingEditIfNeeded();
      else this.#undoManager.commitImmediateChange();

      this.#page = this.#page.replaceBulletById(bulletId, updater);

      if (kind === 'text') this.#undoManager.recordTypingEdit();
      this.#scheduleSave();

      // Targeted, not a full page render: BulletView.update() already
      // guards against clobbering an actively-focused contenteditable
      // text node, so this is safe to call on every change (including
      // plain typing) without disturbing the caret.
      const updatedBullet = this.#page.findBulletById(bulletId);
      const view = this.#pageView.findBlockView(bulletId);
      if (updatedBullet !== null && view instanceof BulletView) view.update(updatedBullet);
      if (kind !== 'text') this.#updateActionBarContext();
    });

    this.#node.addEventListener(BriefsEvents.HEADING_CHANGED, (event) => {
      const { blockId, kind, updater } = event.detail;
      if (kind === 'text') this.#undoManager.beginTypingEditIfNeeded();
      else this.#undoManager.commitImmediateChange();

      this.#page = this.#page.withContent(
        this.#page.content.map((block) =>
          block instanceof HeadingBlock && block.id === blockId ? updater(block) : block
        )
      );

      if (kind === 'text') this.#undoManager.recordTypingEdit();
      this.#scheduleSave();

      const updatedHeading = this.#page.content.find(
        (block) => block instanceof HeadingBlock && block.id === blockId
      );
      const view = this.#pageView.findBlockView(blockId);
      if (updatedHeading !== undefined && view instanceof HeadingBlockView) view.update(updatedHeading);
    });

    this.#node.addEventListener(BriefsEvents.PAGE_CHANGED, (event) => {
      const { kind, updater } = event.detail;
      if (kind === 'text') this.#undoManager.beginTypingEditIfNeeded();
      else this.#undoManager.commitImmediateChange();

      this.#page = updater(this.#page);

      if (kind === 'text') this.#undoManager.recordTypingEdit();
      this.#pageView.render(this.#page);
      this.#scheduleSave();
    });

    this.#node.addEventListener(BriefsEvents.STRUCTURAL_ACTION, (event) => {
      const { bulletId, action, payload } = event.detail;
      this.#handleStructuralAction(bulletId, action, payload);
    });

    this.#node.addEventListener(BriefsEvents.NAVIGATE_REQUESTED, (event) => {
      const { lineId, direction } = event.detail;
      const ids = this.#flattenFocusableIds();
      const index = ids.indexOf(lineId);
      if (index === -1) return;
      const targetIndex = direction === 'up' ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= ids.length) return;
      this.#refocus(ids[targetIndex]);
    });

    this.#node.addEventListener(BriefsEvents.ACTION_REQUESTED, (event) => {
      this.#handleActionBarRequest(event.detail.action, event.detail.payload);
    });

    this.#node.addEventListener('keydown', (event) => {
      const ctrlOrCmd = event.ctrlKey || event.metaKey;
      if (!ctrlOrCmd) return;
      const key = event.key.toLowerCase();
      if (key === 'z' && !event.shiftKey) {
        event.preventDefault();
        this.#undoManager.undo();
        return;
      }
      if ((key === 'z' && event.shiftKey) || key === 'y') {
        event.preventDefault();
        this.#undoManager.redo();
      }
    });

    this.#selectionChangeHandler = () => {
      if (!this.#node.contains(document.activeElement)) return;
      this.#updateActionBarContext();
    };
    document.addEventListener('selectionchange', this.#selectionChangeHandler);
  }

  #handleStructuralAction(bulletId, action, payload) {
    assert.nonEmptyString(bulletId, 'bulletId');
    assert.nonEmptyString(action, 'action');

    let focusTargetId = bulletId;

    if (action === 'new-sibling') {
      this.#undoManager.commitImmediateChange();
      const newBullet = Bullet.fromObject({
        id: IdGenerator.generate('bullet'),
        text: RichText.plain('')
      });
      this.#page = this.#page.withContent(
        BulletTreeOps.insertAfter(this.#page.content, bulletId, newBullet)
      );
      focusTargetId = newBullet.id;
    } else if (action === 'indent') {
      const next = BulletTreeOps.indent(this.#page.content, bulletId);
      if (next === this.#page.content) return;
      this.#undoManager.commitImmediateChange();
      this.#page = this.#page.withContent(next);
    } else if (action === 'outdent') {
      const next = BulletTreeOps.outdent(this.#page.content, bulletId);
      if (next === this.#page.content) return;
      this.#undoManager.commitImmediateChange();
      this.#page = this.#page.withContent(next);
    } else if (action === 'move-up') {
      const next = BulletTreeOps.moveUp(this.#page.content, bulletId);
      if (next === this.#page.content) return;
      this.#undoManager.commitImmediateChange();
      this.#page = this.#page.withContent(next);
    } else if (action === 'move-down') {
      const next = BulletTreeOps.moveDown(this.#page.content, bulletId);
      if (next === this.#page.content) return;
      this.#undoManager.commitImmediateChange();
      this.#page = this.#page.withContent(next);
    } else if (action === 'merge-with-previous') {
      const previousId = this.#findPreviousSiblingId(bulletId);
      this.#undoManager.commitImmediateChange();
      this.#page = this.#page.withContent(
        BulletTreeOps.mergeWithPrevious(this.#page.content, bulletId)
      );
      focusTargetId = previousId ?? bulletId;
    } else if (action === 'delete') {
      const block = this.#findBlock(bulletId);
      if (!(block instanceof Bullet)) return;
      const previousId = this.#findPreviousSiblingId(bulletId);
      this.#undoManager.commitImmediateChange();
      this.#page = this.#page.withContent(BulletTreeOps.remove(this.#page.content, bulletId));
      focusTargetId = previousId;
    } else {
      return;
    }

    this.#pageView.render(this.#page);
    this.#scheduleSave();
    this.#refocus(focusTargetId);
    this.#updateActionBarContext();
  }

  #handleActionBarRequest(action, payload) {
    if (action === 'undo') {
      this.#undoManager.undo();
      return;
    }
    if (action === 'redo') {
      this.#undoManager.redo();
      return;
    }
    if (action === 'toggle-bold') {
      document.execCommand('bold');
      this.#updateActionBarContext();
      return;
    }
    if (action === 'toggle-italic') {
      document.execCommand('italic');
      this.#updateActionBarContext();
      return;
    }
    if (this.#focusedLineId === null) return;
    const id = this.#focusedLineId;
    if (['indent', 'outdent', 'move-up', 'move-down', 'delete'].includes(action)) {
      this.#handleStructuralAction(id, action, payload);
      return;
    }
    if (action === 'set-line-type') {
      this.#handleSetLineType(id, payload.lineType);
    }
  }

  #handleSetLineType(id, lineType) {
    assert.nonEmptyString(id, 'id');
    assert.nonEmptyString(lineType, 'lineType');
    const block = this.#findBlock(id);
    if (block === null) return;

    let content = this.#page.content;

    if (lineType === 'bullet') {
      if (block instanceof Bullet) return;
      const newBullet = Bullet.fromObject({
        id: block.id,
        text: block.text
      });
      content = BulletTreeOps.replaceBlock(content, id, newBullet);
    } else {
      const level = Number.parseInt(lineType.split('-')[1], 10);
      if (block instanceof HeadingBlock) {
        if (block.level === level) return;
        content = BulletTreeOps.replaceBlock(content, id, block.withLevel(level));
      } else {
        let depth = BulletTreeOps.depthOf(content, id);
        while (depth > 0) {
          content = BulletTreeOps.outdent(content, id);
          depth = BulletTreeOps.depthOf(content, id);
        }
        const newHeading = HeadingBlock.fromObject({
          id: block.id,
          level: level,
          text: block.text
        });
        content = BulletTreeOps.replaceBlock(content, id, newHeading);
      }
    }

    this.#undoManager.commitImmediateChange();
    this.#page = this.#page.withContent(content);
    this.#pageView.render(this.#page);
    this.#scheduleSave();
    this.#refocus(id);
    this.#updateActionBarContext();
  }

  /**
   * Finds a block (HeadingBlock or Bullet) anywhere in the current
   * page by id.
   * @param {string} id
   * @returns {HeadingBlock|Bullet|null}
   */
  #findBlock(id) {
    const search = (list) => {
      for (const block of list) {
        if (block.id === id) return block;
        if (block instanceof Bullet) {
          const found = search(block.children);
          if (found !== null) return found;
        }
      }
      return null;
    };
    return search(this.#page.content);
  }

  /**
   * Flattens the current page's visible content into document order,
   * skipping the children of collapsed bullets.
   * @returns {string[]}
   */
  #flattenFocusableIds() {
    const ids = [];
    const walk = (list) => {
      for (const block of list) {
        ids.push(block.id);
        if (block instanceof Bullet && !block.collapsed) walk(block.children);
      }
    };
    walk(this.#page.content);
    return ids;
  }

  /**
   * Finds the id of the block immediately preceding `id` at the same
   * level, if any.
   * @param {string} id
   * @returns {string|null}
   */
  #findPreviousSiblingId(id) {
    const search = (list) => {
      const index = list.findIndex((block) => block.id === id);
      if (index !== -1) {
        const previous = list[index - 1];
        return previous ? previous.id : null;
      }
      for (const block of list) {
        if (block instanceof Bullet) {
          const found = search(block.children);
          if (found !== undefined) return found;
        }
      }
      return undefined;
    };
    const result = search(this.#page.content);
    return result === undefined ? null : result;
  }

  #refocus(id) {
    if (id === null) return;
    const view = this.#pageView.findBlockView(id);
    if (view instanceof BulletView || view instanceof HeadingBlockView) view.focusText();
  }

  #updateActionBarContext() {
    const id = this.#focusedLineId;
    const hasFocus = id !== null && this.#node.contains(document.activeElement);

    let kind = null;
    let lineType = null;
    let canIndent = false;
    let canOutdent = false;
    let canMoveUp = false;
    let canMoveDown = false;

    if (id !== null) {
      const block = this.#findBlock(id);
      if (block instanceof Bullet) {
        kind = 'bullet';
        lineType = 'bullet';
        canIndent = BulletTreeOps.indent(this.#page.content, id) !== this.#page.content;
        canOutdent = BulletTreeOps.outdent(this.#page.content, id) !== this.#page.content;
      } else if (block instanceof HeadingBlock) {
        kind = 'heading';
        lineType = `heading-${block.level}`;
      }
      if (block !== null) {
        canMoveUp = BulletTreeOps.moveUp(this.#page.content, id) !== this.#page.content;
        canMoveDown = BulletTreeOps.moveDown(this.#page.content, id) !== this.#page.content;
      }
    }

    let isBold = false;
    let isItalic = false;
    if (hasFocus) {
      try {
        isBold = document.queryCommandState('bold');
      } catch {
        isBold = false;
      }
      try {
        isItalic = document.queryCommandState('italic');
      } catch {
        isItalic = false;
      }
    }

    this.#actionBar.updateContext({
      hasFocus,
      kind,
      canIndent,
      canOutdent,
      canMoveUp,
      canMoveDown,
      lineType,
      isBold,
      isItalic,
      canUndo: this.#undoManager.canUndo,
      canRedo: this.#undoManager.canRedo,
    });
  }

  #scheduleSave() {
    this.#statusNode.textContent = 'Saving\u2026';
    if (this.#saveTimer !== null) clearTimeout(this.#saveTimer);
    this.#saveTimer = setTimeout(() => {
      this.#persistenceAdapter
        .save(this.#page)
        .then(() => {
          this.#statusNode.textContent = 'Becker Briefs';
        })
        .catch((err) => {
          this.#statusNode.textContent = 'Could not save';
          console.error(err);
        });
    }, AUTOSAVE_DELAY_MS);
  }

  /**
   * @returns {NotePage} the current in-memory page state
   */
  getPage() {
    return this.#page;
  }

  /**
   * Loads a different page via the injected persistence adapter and
   * re-renders. Resets undo/redo history, since it belonged to the
   * previous page.
   * @param {string} pageId
   * @returns {Promise<void>}
   */
  async loadPage(pageId) {
    assert.nonEmptyString(pageId, 'pageId');
    const page = await this.#persistenceAdapter.load(pageId);
    this.#page = page;
    this.#pageView.render(this.#page);
    this.#undoManager = this.#buildUndoManager();
    this.#focusedLineId = null;
    this.#updateActionBarContext();
  }

  /** Tears down all owned DOM and listeners. */
  destroy() {
    if (this.#saveTimer !== null) clearTimeout(this.#saveTimer);
    if (this.#selectionChangeHandler !== null)
      document.removeEventListener('selectionchange', this.#selectionChangeHandler);
    this.#pageView.destroy();
    this.#actionBar.destroy();
    this.#node.remove();
  }

  static fromObject(obj) {
    assert.plainObject(obj, 'obj');
    return new BriefsEditor(
      obj.container,
      obj.styleContainer ?? obj.head,
      obj.typeRegistry ?? TypeRegistry.fromArray([]),
      obj.tagRegistry,
      obj.persistenceAdapter,
      obj.initialPage ?? NotePage.fromObject({
        id: IdGenerator.generate('page'),
        name: obj.name,
        date: obj.date,
      })
    );
  }
}
