import { assert } from '../utils/assert.js';

/**
 * ModalView
 *
 * Generic modal dialog chrome: a backdrop, a dialog box, and a close
 * button, wrapping whatever content node a caller supplies. This
 * class owns the dialog *mechanics* (open/close, backdrop click,
 * escape-to-close) -- it has no idea what's inside it. A
 * TypeDefinition supplies the content node; this class is what
 * actually presents it, keeping "what the modal shows" and "how a
 * modal behaves" as separate concerns.
 */
export class ModalView {
  #node;
  #backdrop;
  #contentHost;
  #onClose;
  #keydownHandler;

  /**
   * @param {HTMLElement} contentNode
   * @param {() => void} onClose called once, when the modal closes
   *   for any reason (backdrop click, escape, close button)
   */
  constructor(contentNode, onClose) {
    assert.htmlElement(contentNode, 'contentNode');
    assert.function_(onClose, 'onClose');
    this.#onClose = onClose;
    this.#node = this.#buildNode(contentNode);
  }

  get node() {
    return this.#node;
  }

  #buildNode(contentNode) {
    const backdrop = document.createElement('div');
    backdrop.className = 'BRIEFS-modal-backdrop';
    backdrop.addEventListener('click', (event) => {
      if (event.target === backdrop) this.close();
    });
    this.#backdrop = backdrop;

    const dialog = document.createElement('div');
    dialog.className = 'BRIEFS-modal';
    dialog.setAttribute('role', 'dialog');

    const closeButton = document.createElement('button');
    closeButton.type = 'button';
    closeButton.className = 'BRIEFS-modal__close';
    closeButton.setAttribute('aria-label', 'Close');
    closeButton.textContent = '\u00d7';
    closeButton.addEventListener('click', () => this.close());
    dialog.appendChild(closeButton);

    this.#contentHost = document.createElement('div');
    this.#contentHost.className = 'BRIEFS-modal__content';
    this.#contentHost.appendChild(contentNode);
    dialog.appendChild(this.#contentHost);

    backdrop.appendChild(dialog);
    return backdrop;
  }

  /** Mounts the modal into the document and wires escape-to-close. */
  open() {
    document.body.appendChild(this.#node);
    this.#keydownHandler = (event) => {
      if (event.key === 'Escape') this.close();
    };
    document.addEventListener('keydown', this.#keydownHandler);
  }

  /** Removes the modal from the document and notifies onClose once. */
  close() {
    if (this.#keydownHandler !== null) {
      document.removeEventListener('keydown', this.#keydownHandler);
      this.#keydownHandler = null;
    }
    this.#node.remove();
    this.#onClose();
  }

  destroy() {
    if (this.#keydownHandler !== null) document.removeEventListener('keydown', this.#keydownHandler);
    this.#node.remove();
  }

  static fromObject(obj) {
    assert.plainObject(obj, 'obj');
    return new ModalView(
      obj.contentNode,
      obj.onClose
    )
  }
}
