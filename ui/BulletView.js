import { assert } from '../utils/assert.js';
import { Bullet } from '../models/Bullet.js';
import { TypeRegistry } from '../registries/TypeRegistry.js';
import { TagRegistry } from '../registries/TagRegistry.js';
import { RichTextDom } from '../utils/RichTextDom.js';
import { CaretNav } from '../utils/CaretNav.js';
import { TypePillView } from './TypePillView.js';
import { TagChipView } from './TagChipView.js';
import { InlineCommandMenu } from './InlineCommandMenu.js';
import { BriefsEvents } from '../events/BriefsEvents.js';

/**
 * BulletView
 *
 * Owns the DOM subtree for exactly one bullet, including its own
 * nested child BulletView instances. Local edits (text, type, tags,
 * collapse) are applied to the DOM directly and reported upward via a
 * bubbling 'briefs:bullet-changed' CustomEvent carrying a pure
 * updater function plus a `kind` used for undo grouping. Structural
 * changes that require sibling/parent awareness (indent, outdent,
 * new sibling, delete, move) are reported via a bubbling
 * 'briefs:structural-action' CustomEvent instead, since this class
 * only ever owns its own subtree and must never reach outside of it.
 *
 * Inline "/type-name" and "#tag-name" triggers are detected as the
 * user types and resolved through an InlineCommandMenu popup -- this
 * is now the only way to add a type or tag to a bullet; there is no
 * button for it.
 */
export class BulletView {
  #node;
  #bullet;
  #typeRegistry;
  #tagRegistry;
  #textNode;
  #pillSlot;
  #dotNode;
  #disclosure;
  #tagRow;
  #childrenNode;
  #childViews;
  #typePill;
  #commandMenu;
  #activeCommand;

  /**
   * @param {Bullet} bullet
   * @param {TypeRegistry} typeRegistry
   * @param {TagRegistry} tagRegistry
   */
  constructor(bullet, typeRegistry, tagRegistry) {
    assert.instanceOf(bullet, Bullet, 'bullet');
    assert.instanceOf(typeRegistry, TypeRegistry, 'typeRegistry');
    assert.instanceOf(tagRegistry, TagRegistry, 'tagRegistry');
    this.#bullet = bullet;
    this.#typeRegistry = typeRegistry;
    this.#tagRegistry = tagRegistry;
    this.#childViews = [];
    this.#typePill = null;
    this.#activeCommand = null;
    this.#buildNode();
  }

  get node() {
    return this.#node;
  }

  get bullet() {
    return this.#bullet;
  }

  get childViews() {
    return [...this.#childViews];
  }

  #dispatchChanged(kind, updater) {
    assert.nonEmptyString(kind, 'kind');
    assert.function_(updater, 'updater');
    this.#node.dispatchEvent(
      new CustomEvent(BriefsEvents.BULLET_CHANGED, {
        bubbles: true,
        detail: { bulletId: this.#bullet.id, kind, updater },
      })
    );
  }

  #dispatchStructural(action, payload = {}) {
    assert.nonEmptyString(action, 'action');
    this.#node.dispatchEvent(
      new CustomEvent(BriefsEvents.STRUCTURAL_ACTION, {
        bubbles: true,
        detail: { bulletId: this.#bullet.id, action, payload },
      })
    );
  }

  #dispatchNavigate(direction) {
    this.#node.dispatchEvent(
      new CustomEvent(BriefsEvents.NAVIGATE_REQUESTED, {
        bubbles: true,
        detail: { lineId: this.#bullet.id, direction },
      })
    );
  }

  #buildNode() {
    const row = document.createElement('div');
    row.className = 'BRIEFS-bullet';
    row.dataset.bulletId = this.#bullet.id;
    this.#node = row;

    const rowMain = document.createElement('div');
    rowMain.className = 'BRIEFS-bullet__row';

    this.#pillSlot = document.createElement('span');
    this.#pillSlot.className = 'BRIEFS-bullet__pill-slot';
    this.#dotNode = document.createElement('span');
    this.#dotNode.className = 'BRIEFS-bullet__dot';
    this.#dotNode.textContent = '\u2022';
    rowMain.appendChild(this.#pillSlot);

    this.#textNode = document.createElement('div');
    this.#textNode.className = 'BRIEFS-bullet__text';
    this.#textNode.contentEditable = 'true';
    this.#textNode.dataset.placeholder = 'Write a note\u2026';
    RichTextDom.applyToNode(this.#textNode, this.#bullet.text);
    this.#textNode.classList.toggle('is-empty', this.#bullet.text.isEmpty());
    this.#attachTextHandlers();
    rowMain.appendChild(this.#textNode);

    this.#tagRow = document.createElement('span');
    this.#tagRow.className = 'BRIEFS-bullet__tags';
    this.#renderTagChips();
    rowMain.appendChild(this.#tagRow);
    
    this.#disclosure = document.createElement('button');
    // this.#disclosure.type = 'button';
    // this.#disclosure.className = 'BRIEFS-bullet__disclosure';
    // this.#disclosure.setAttribute('aria-label', 'Toggle children');
    // this.#disclosure.addEventListener('mousedown', (event) => event.preventDefault());
    // this.#disclosure.addEventListener('click', () => {
    //   this.#dispatchChanged('collapse', (bullet) => bullet.withCollapsed(!bullet.collapsed));
    // });
    // rowMain.appendChild(this.#disclosure);

    row.appendChild(rowMain);

    this.#commandMenu = InlineCommandMenu.fromObject({
      onSelect: (item) => this.#applyInlineCommand(item)
    });
    row.appendChild(this.#commandMenu.node);

    this.#childrenNode = document.createElement('div');
    this.#childrenNode.className = 'BRIEFS-bullet__children';
    this.#renderChildren();
    row.appendChild(this.#childrenNode);

    this.#renderPillOrDot();
    this.#renderDisclosure();
    if (this.#bullet.collapsed) row.classList.add('BRIEFS-bullet--collapsed');

    return row;
  }

  #renderDisclosure() {
    const hasChildren = this.#bullet.children.length > 0;
    this.#disclosure.textContent = hasChildren ? (this.#bullet.collapsed ? '\u25b2' : '\u25be') : '';
    this.#disclosure.classList.toggle('BRIEFS-bullet__disclosure--empty', !hasChildren);
  }

  #renderPillOrDot() {
    this.#node.classList.remove('BRIEFS-bullet--strikethrough');

    if (this.#bullet.type !== null && this.#typeRegistry.has(this.#bullet.type.typeId)) {
      const definition = this.#typeRegistry.get(this.#bullet.type.typeId);
      if (this.#typePill !== null && this.#typePill.typeId === this.#bullet.type.typeId) {
        // Same type, only its data changed: update in place so an
        // actively-open modal (owned by the existing pill) isn't torn
        // down out from under the user.
        this.#typePill.update(this.#bullet.type);
      } else {
        if (this.#typePill !== null) this.#typePill.destroy();
        this.#pillSlot.textContent = '';
        this.#typePill = TypePillView.fromObject({
          typeInstance: this.#bullet.type,
          definition,
          onDataChange: (patch) =>
            this.#dispatchChanged('type', (bullet) => bullet.withType(bullet.type.withData(patch))),
          onRemove: () =>
            this.#dispatchChanged('type', (bullet) => bullet.withType(null))
        });
        this.#pillSlot.appendChild(this.#typePill.node);
      }
      if (definition.isStrikethrough(this.#bullet.type))
        this.#node.classList.add('BRIEFS-bullet--strikethrough');
      return;
    }

    if (this.#typePill !== null) {
      this.#typePill.destroy();
      this.#typePill = null;
    }
    this.#pillSlot.textContent = '';
    if (!this.#bullet.text.isEmpty()) {
      this.#pillSlot.appendChild(this.#dotNode);
    }
  }

  #renderTagChips() {
    this.#tagRow.textContent = '';
    for (const tag of this.#bullet.tags) {
      const chip = TagChipView.fromObject({
        tag,
        onRemove: (tagId) =>
          this.#dispatchChanged('tag', (bullet) => bullet.withTagRemoved(tagId))
      });
      this.#tagRow.appendChild(chip.node);
    }
  }

  #renderChildren() {
    this.#childrenNode.textContent = '';
    this.#childViews = this.#bullet.children.map((child) => {
      const view = BulletView.fromObject({
        bullet: child,
        typeRegistry: this.#typeRegistry,
        tagRegistry: this.#tagRegistry
      });
      this.#childrenNode.appendChild(view.node);
      return view;
    });
  }

  #attachTextHandlers() {
    this.#textNode.addEventListener('input', () => {
      const richText = RichTextDom.toRichText(this.#textNode);
      this.#textNode.classList.toggle('is-empty', richText.isEmpty());
      this.#dispatchChanged('text', (bullet) => bullet.withText(richText));
      if (this.#bullet.type === null) this.#renderPillOrDot();
      this.#detectInlineCommand();
    });

    this.#textNode.addEventListener('focus', () => {
      this.#node.dispatchEvent(
        new CustomEvent(BriefsEvents.LINE_FOCUSED, {
          bubbles: true,
          detail: { lineId: this.#bullet.id },
        })
      );
    });

    this.#textNode.addEventListener('blur', () => {
      this.#commandMenu.hide();
      this.#activeCommand = null;
    });

    this.#textNode.addEventListener('keydown', (event) => this.#handleKeydown(event));
  }

  #handleKeydown(event) {
    if (this.#commandMenu.isOpen) {
      if (event.key === 'Tab' || event.key === 'Enter') {
        event.preventDefault();
        this.#commandMenu.selectHighlighted();
        return;
      }
      if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
        event.preventDefault();
        this.#commandMenu.cycle(event.key === 'ArrowUp' ? 'up' : 'down');
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        this.#commandMenu.hide();
        this.#activeCommand = null;
        return;
      }
    }

    if (event.altKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
      event.preventDefault();
      this.#dispatchStructural(event.key === 'ArrowUp' ? 'move-up' : 'move-down');
      return;
    }
    if (event.key === 'ArrowUp' && !event.shiftKey && CaretNav.isAtFirstVisualLine(this.#textNode)) {
      event.preventDefault();
      this.#dispatchNavigate('up');
      return;
    }
    if (event.key === 'ArrowDown' && !event.shiftKey && CaretNav.isAtLastVisualLine(this.#textNode)) {
      event.preventDefault();
      this.#dispatchNavigate('down');
      return;
    }
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.#dispatchStructural('new-sibling');
      return;
    }
    if (event.altKey && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
      event.preventDefault();
      this.#dispatchStructural(event.key === 'ArrowLeft' ? 'outdent' : 'indent');
      return;
    }
    if (event.key === 'Tab') {
      event.preventDefault();
      this.#dispatchStructural(event.shiftKey ? 'outdent' : 'indent');
      return;
    }
    if (event.key === 'Backspace' && this.#isCaretAtStart()) {
      event.preventDefault();
      this.#dispatchStructural('merge-with-previous');
      return;
    }
  }

  #isCaretAtStart() {
    const selection = window.getSelection();
    if (selection === null || selection.rangeCount === 0) return false;
    const range = selection.getRangeAt(0);
    if (!range.collapsed) return false;
    const preCaretRange = range.cloneRange();
    preCaretRange.selectNodeContents(this.#textNode);
    preCaretRange.setEnd(range.startContainer, range.startOffset);
    return preCaretRange.toString().length === 0;
  }

  /**
   * Scans backward from the caret for an active "/" or "#" trigger
   * (a run of non-whitespace characters starting with one of those,
   * with no whitespace between the trigger and the caret) within the
   * same text node, and opens/updates/hides the inline command menu
   * accordingly. This is a deliberate simplification: it only looks
   * within the single DOM text node containing the caret, which
   * covers the common case of typing a trigger fresh.
   */
  #detectInlineCommand() {
    const selection = window.getSelection();
    if (selection === null || selection.rangeCount === 0 || !selection.isCollapsed) {
      this.#commandMenu.hide();
      this.#activeCommand = null;
      return;
    }
    const range = selection.getRangeAt(0);
    const node = range.startContainer;
    if (node.nodeType !== Node.TEXT_NODE || !this.#textNode.contains(node)) {
      this.#commandMenu.hide();
      this.#activeCommand = null;
      return;
    }
    const text = node.textContent;
    const offset = range.startOffset;
    let i = offset - 1;
    while (i >= 0 && !/\s/.test(text[i]) && text[i] !== '/' && text[i] !== '#') i--;
    if (i < 0 || (text[i] !== '/' && text[i] !== '#')) {
      this.#commandMenu.hide();
      this.#activeCommand = null;
      return;
    }

    const triggerChar = text[i];
    const query = text.slice(i + 1, offset).toLowerCase();
    this.#activeCommand = { triggerChar, triggerIndex: i, textNode: node };

    const items =
      triggerChar === '/' ? this.#buildTypeMenuItems(query) : this.#buildTagMenuItems(query);

    if (items.length === 0) {
      this.#commandMenu.hide();
      return;
    }
    this.#commandMenu.setItems(items);
    const caretRect = range.getClientRects()[0] ?? this.#textNode.getBoundingClientRect();
    const hostRect = this.#node.getBoundingClientRect();
    this.#commandMenu.show(caretRect.left - hostRect.left, caretRect.bottom - hostRect.top);
  }

  #buildTypeMenuItems(query) {
    return this.#typeRegistry
      .list()
      .filter(
        (definition) =>
          definition.id.toLowerCase().includes(query) ||
          definition.label.toLowerCase().includes(query)
      )
      .map((definition) => ({ id: definition.id, label: definition.label }));
  }

  #buildTagMenuItems(query) {
    const matches = this.#tagRegistry.find(query).map((tag) => ({ id: tag.id, label: tag.label }));
    const trimmed = query.trim();
    if (trimmed.length > 0 && !matches.some((item) => item.label.toLowerCase() === trimmed)) {
      matches.push({ id: '__create__', label: `Create "${trimmed}"`, createLabel: trimmed });
    }
    return matches;
  }

  #applyInlineCommand(item) {
    if (this.#activeCommand === null) return;
    const { triggerChar, triggerIndex, textNode } = this.#activeCommand;
    const selection = window.getSelection();
    const currentRange = selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
    const endOffset = currentRange !== null && currentRange.startContainer === textNode
      ? currentRange.startOffset
      : textNode.textContent.length;

    const deleteRange = document.createRange();
    deleteRange.setStart(textNode, Math.min(triggerIndex, textNode.textContent.length));
    deleteRange.setEnd(textNode, Math.min(endOffset, textNode.textContent.length));
    deleteRange.deleteContents();

    const richText = RichTextDom.toRichText(this.#textNode);
    this.#dispatchChanged('text', (bullet) => bullet.withText(richText));

    const newRange = document.createRange();
    const caretIndex = Math.min(triggerIndex, textNode.textContent.length);
    newRange.setStart(textNode, caretIndex);
    newRange.collapse(true);
    selection.removeAllRanges();
    selection.addRange(newRange);

    if (triggerChar === '/') {
      const definition = this.#typeRegistry.get(item.id);
      this.#dispatchChanged('type', (bullet) => bullet.withType(definition.createInstance()));
    } else if (item.id === '__create__') {
      this.#tagRegistry.createTag(item.createLabel).then((tag) => {
        this.#dispatchChanged('tag', (bullet) => bullet.withTagAdded(tag));
      });
    } else {
      const tag = this.#tagRegistry.get(item.id);
      this.#dispatchChanged('tag', (bullet) => bullet.withTagAdded(tag));
    }

    this.#commandMenu.hide();
    this.#activeCommand = null;
  }

  /**
   * Focuses this bullet's text node and places the caret at the end.
   */
  focusText() {
    this.#textNode.focus();
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(this.#textNode);
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);
  }

  /**
   * Re-renders this view's non-text chrome (pill/dot, tags, children,
   * disclosure) from a fresh Bullet instance. The text node is left
   * untouched if the plain-text content is unchanged, to avoid
   * disrupting an in-progress edit / caret position.
   * @param {Bullet} bullet
   */
  update(bullet) {
    assert.instanceOf(bullet, Bullet, 'bullet');
    const textChanged = bullet.text.toPlainText() !== this.#bullet.text.toPlainText();
    this.#bullet = bullet;
    if (textChanged && document.activeElement !== this.#textNode) {
      RichTextDom.applyToNode(this.#textNode, bullet.text);
    }
    this.#renderPillOrDot();
    this.#renderTagChips();
    this.#renderChildren();
    this.#renderDisclosure();
    this.#node.classList.toggle('BRIEFS-bullet--collapsed', bullet.collapsed);
  }

  destroy() {
    if (this.#typePill !== null) this.#typePill.destroy();
    this.#commandMenu.destroy();
    this.#childViews.forEach((view) => view.destroy());
    this.#node.remove();
  }
  

  static fromObject(obj) {
    assert.plainObject(obj, 'obj');
    return new BulletView(
      obj.bullet,
      obj.typeRegistry,
      obj.tagRegistry
    )
  }
}
