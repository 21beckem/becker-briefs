import { SingleSelectOption } from './SingleSelectOption.js';
import { assert } from '../utils/assert.js';

export class SingleSelectDropdown {
  #options;
  #selectedId;
  #onChange;
  #isOpen;
  #outsideClickHandler;

  #node;
  #triggerNode;
  #triggerLabelNode;
  #panelNode;

  constructor(options, selectedId, onChange) {
    assert.arrayOf(options, SingleSelectOption, 'options');
    assert.string(selectedId, 'selectedId');
    assert.function_(onChange, 'onChange');
    if (!options.some((option) => option.id === selectedId))
      throw new TypeError('selectedId must match the id of one of the given options.');

    this.#options = [...options];
    this.#selectedId = selectedId;
    this.#onChange = onChange;
    this.#isOpen = false;
    this.#outsideClickHandler = (event) => {
      if (!this.#node.contains(event.target)) this.#close();
    };

    this.#node = this.#buildNode();
  }

  get node() {
    return this.#node;
  }

  getSelectedId() {
    return this.#selectedId;
  }

  destroy() {
    document.removeEventListener('mousedown', this.#outsideClickHandler);
  }

  static fromObject(obj) {
    assert.plainObject(obj, 'obj');
    assert.array(obj.options, 'obj.options');
    const options = obj.options.map((option) => (
      option instanceof SingleSelectOption ? option : SingleSelectOption.fromObject(option)
    ));
    return new SingleSelectDropdown(options, obj.selectedId, obj.onChange);
  }

  #buildNode() {
    const wrapper = document.createElement('div');
    wrapper.className = 'briefs-dropdown';

    this.#triggerNode = document.createElement('button');
    this.#triggerNode.type = 'button';
    this.#triggerNode.className = 'briefs-dropdown__trigger';
    this.#triggerNode.addEventListener('click', () => {
      if (this.#isOpen) this.#close(); else this.#open();
    });
    wrapper.appendChild(this.#triggerNode);

    this.#triggerLabelNode = document.createElement('span');
    this.#triggerNode.appendChild(this.#triggerLabelNode);

    const chevron = document.createElement('span');
    chevron.className = 'briefs-dropdown__chevron';
    chevron.setAttribute('aria-hidden', 'true');
    chevron.textContent = '⌄';
    this.#triggerNode.appendChild(chevron);

    this.#panelNode = document.createElement('div');
    this.#panelNode.className = 'briefs-dropdown__panel';
    this.#panelNode.style.display = 'none';
    wrapper.appendChild(this.#panelNode);

    this.#renderOptions();
    this.#updateTriggerLabel();

    return wrapper;
  }

  #renderOptions() {
    this.#panelNode.replaceChildren();
    for (const option of this.#options) {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'briefs-dropdown__option';
      if (option.id === this.#selectedId) item.classList.add('briefs-dropdown__option--selected');
      item.textContent = option.label;
      item.addEventListener('click', () => {
        this.#selectedId = option.id;
        this.#updateTriggerLabel();
        this.#renderOptions();
        this.#close();
        this.#onChange(this.#selectedId);
      });
      this.#panelNode.appendChild(item);
    }
  }

  #updateTriggerLabel() {
    const selectedOption = this.#options.find((option) => option.id === this.#selectedId);
    this.#triggerLabelNode.textContent = selectedOption !== undefined ? selectedOption.label : '';
  }

  #open() {
    this.#isOpen = true;
    this.#panelNode.style.display = 'block';
    window.setTimeout(() => document.addEventListener('mousedown', this.#outsideClickHandler), 0);
  }

  #close() {
    this.#isOpen = false;
    this.#panelNode.style.display = 'none';
    document.removeEventListener('mousedown', this.#outsideClickHandler);
  }
}