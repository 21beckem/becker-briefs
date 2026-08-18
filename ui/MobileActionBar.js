import { assert } from '../utils/assert.js';
import { BriefsEvents } from '../events/BriefsEvents.js';

const LINE_TYPE_OPTIONS = [
  { value: 'bullet', label: 'Bullet' },
  { value: 'heading-1', label: 'Heading 1' },
  { value: 'heading-2', label: 'Heading 2' },
  { value: 'heading-3', label: 'Heading 3' },
];

/**
 * MobileActionBar
 *
 * A row of controls meant to dock above the on-screen keyboard on
 * mobile. It dispatches intent events only -- it never knows which
 * bullet is focused or what the page tree looks like; BriefsEditor
 * resolves everything and calls updateContext() to keep this bar's
 * enabled/active states in sync with whatever line currently has
 * focus (and with the undo/redo stacks).
 */
export class MobileActionBar {
  #node;
  #undoButton;
  #redoButton;
  #indentButton;
  #outdentButton;
  #moveUpButton;
  #moveDownButton;
  #lineTypeSelect;
  #boldButton;
  #italicButton;
  #deleteButton;

  constructor() {
    this.#node = this.#buildNode();

    if ("virtualKeyboard" in navigator) {
      navigator.virtualKeyboard.overlaysContent = true;
    } else {
      alert('no virtualKeyboard!');
    }
  }

  get node() {
    return this.#node;
  }

  #dispatchAction(action, payload = {}) {
    assert.nonEmptyString(action, 'action');
    this.#node.dispatchEvent(
      new CustomEvent(BriefsEvents.ACTION_REQUESTED, {
        bubbles: true,
        detail: { action, payload },
      })
    );
  }

  #buildButton(label, ariaLabel, action, payload) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'BRIEFS-action-bar__button';
    button.setAttribute('aria-label', ariaLabel);
    button.textContent = label;
    // Prevent the contenteditable line from losing focus before the
    // click handler fires.
    button.addEventListener('mousedown', (event) => event.preventDefault());
    button.addEventListener('click', () => {
      if (button.disabled) return;
      this.#dispatchAction(action, payload);
    });
    return button;
  }

  #buildDivider() {
    const divider = document.createElement('span');
    divider.className = 'BRIEFS-action-bar__divider';
    return divider;
  }

  #buildNode() {
    const bar = document.createElement('div');
    bar.className = 'BRIEFS-action-bar';

    this.#undoButton = this.#buildButton('\u21b6', 'Undo', 'undo');
    this.#redoButton = this.#buildButton('\u21b7', 'Redo', 'redo');
    bar.appendChild(this.#undoButton);
    bar.appendChild(this.#redoButton);
    bar.appendChild(this.#buildDivider());

    this.#indentButton = this.#buildButton('\u21e5', 'Indent', 'indent');
    this.#outdentButton = this.#buildButton('\u21e4', 'Outdent', 'outdent');
    this.#moveUpButton = this.#buildButton('\u2191', 'Move line up', 'move-up');
    this.#moveDownButton = this.#buildButton('\u2193', 'Move line down', 'move-down');
    bar.appendChild(this.#indentButton);
    bar.appendChild(this.#outdentButton);
    bar.appendChild(this.#moveUpButton);
    bar.appendChild(this.#moveDownButton);
    bar.appendChild(this.#buildDivider());

    this.#lineTypeSelect = document.createElement('select');
    this.#lineTypeSelect.className = 'BRIEFS-action-bar__line-type';
    this.#lineTypeSelect.setAttribute('aria-label', 'Line type');
    for (const option of LINE_TYPE_OPTIONS) {
      const optionNode = document.createElement('option');
      optionNode.value = option.value;
      optionNode.textContent = option.label;
      this.#lineTypeSelect.appendChild(optionNode);
    }
    this.#lineTypeSelect.addEventListener('mousedown', (event) => event.stopPropagation());
    this.#lineTypeSelect.addEventListener('change', () => {
      this.#dispatchAction('set-line-type', { lineType: this.#lineTypeSelect.value });
    });
    // bar.appendChild(this.#lineTypeSelect);
    // bar.appendChild(this.#buildDivider());

    this.#boldButton = this.#buildButton('B', 'Toggle bold', 'toggle-bold');
    this.#boldButton.classList.add('BRIEFS-action-bar__button--bold');
    this.#italicButton = this.#buildButton('I', 'Toggle italic', 'toggle-italic');
    this.#italicButton.classList.add('BRIEFS-action-bar__button--italic');
    bar.appendChild(this.#boldButton);
    bar.appendChild(this.#italicButton);
    // bar.appendChild(this.#buildDivider());

    this.#deleteButton = this.#buildButton('\u2716', 'Delete line', 'delete');
    // bar.appendChild(this.#deleteButton);

    this.updateContext({
      hasFocus: false,
      kind: null,
      canIndent: false,
      canOutdent: false,
      canMoveUp: false,
      canMoveDown: false,
      lineType: null,
      isBold: false,
      isItalic: false,
      canUndo: false,
      canRedo: false,
    });

    return bar;
  }

  /**
   * Refreshes every button/control's enabled and active state.
   * @param {object} context
   * @param {boolean} context.hasFocus
   * @param {'bullet'|'heading'|null} context.kind
   * @param {boolean} context.canIndent
   * @param {boolean} context.canOutdent
   * @param {boolean} context.canMoveUp
   * @param {boolean} context.canMoveDown
   * @param {'bullet'|'heading-1'|'heading-2'|'heading-3'|null} context.lineType
   * @param {boolean} context.isBold
   * @param {boolean} context.isItalic
   * @param {boolean} context.canUndo
   * @param {boolean} context.canRedo
   */
  updateContext(context) {
    assert.plainObject(context, 'context');

    this.#undoButton.disabled = !context.canUndo;
    this.#redoButton.disabled = !context.canRedo;

    const isBullet = context.hasFocus && context.kind === 'bullet';
    this.#indentButton.disabled = !isBullet || !context.canIndent;
    this.#outdentButton.disabled = !isBullet || !context.canOutdent;
    this.#moveUpButton.disabled = !context.hasFocus || !context.canMoveUp;
    this.#moveDownButton.disabled = !context.hasFocus || !context.canMoveDown;

    this.#lineTypeSelect.disabled = !context.hasFocus;
    if (context.lineType !== null) this.#lineTypeSelect.value = context.lineType;

    this.#boldButton.disabled = !context.hasFocus;
    this.#italicButton.disabled = !context.hasFocus;
    this.#boldButton.classList.toggle('BRIEFS-action-bar__button--active', Boolean(context.isBold));
    this.#italicButton.classList.toggle('BRIEFS-action-bar__button--active', Boolean(context.isItalic));

    this.#deleteButton.disabled = !isBullet;
  }

  destroy() {
    this.#node.remove();
  }
}
