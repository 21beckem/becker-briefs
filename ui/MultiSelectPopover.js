import { MultiSelectOption } from './MultiSelectOption.js';

export class MultiSelectPopover {
  #label;
  #options;
  #selectedIds;
  #onChange;
  #isOpen;
  #outsideClickHandler;

  #node;
  #triggerNode;
  #triggerLabelNode;
  #panelNode;
  #searchInputNode;
  #optionsListNode;

  constructor(label, options, selectedIds, onChange) {
    if (typeof label !== 'string' || label.length === 0) {
      throw new TypeError('label must be a non-empty string.');
    }
    if (!Array.isArray(options) || !options.every((option) => option instanceof MultiSelectOption)) {
      throw new TypeError('options must be an array of MultiSelectOption instances.');
    }
    if (!Array.isArray(selectedIds) || !selectedIds.every((id) => typeof id === 'string')) {
      throw new TypeError('selectedIds must be an array of strings.');
    }
    if (typeof onChange !== 'function') {
      throw new TypeError('onChange must be a function.');
    }

    this.#label = label;
    this.#options = [...options];
    this.#selectedIds = new Set(selectedIds);
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

  getSelectedIds() {
    return [...this.#selectedIds];
  }

  destroy() {
    document.removeEventListener('mousedown', this.#outsideClickHandler);
  }

  static fromObject(obj) {
    if (typeof obj !== 'object' || obj === null) throw new TypeError('fromObject expects an object.');
    if (!Array.isArray(obj.options)) throw new TypeError('obj.options must be an array.');
    const options = obj.options.map((option) => (
      option instanceof MultiSelectOption ? option : MultiSelectOption.fromObject(option)
    ));
    return new MultiSelectPopover(
      obj.label,
      options,
      obj.selectedIds === undefined ? [] : obj.selectedIds,
      obj.onChange
    );
  }

  #buildNode() {
    const wrapper = document.createElement('div');
    wrapper.className = 'briefs-multiselect';

    this.#triggerNode = document.createElement('button');
    this.#triggerNode.type = 'button';
    this.#triggerNode.className = 'briefs-multiselect__trigger';
    this.#triggerNode.addEventListener('click', () => {
      if (this.#isOpen) this.#close(); else this.#open();
    });
    wrapper.appendChild(this.#triggerNode);

    this.#triggerLabelNode = document.createElement('span');
    this.#triggerNode.appendChild(this.#triggerLabelNode);

    const chevron = document.createElement('span');
    chevron.className = 'briefs-multiselect__chevron';
    chevron.setAttribute('aria-hidden', 'true');
    chevron.textContent = '⌄';
    this.#triggerNode.appendChild(chevron);

    this.#panelNode = document.createElement('div');
    this.#panelNode.className = 'briefs-multiselect__panel';
    this.#panelNode.hidden = true;
    wrapper.appendChild(this.#panelNode);

    this.#searchInputNode = document.createElement('input');
    this.#searchInputNode.type = 'text';
    this.#searchInputNode.className = 'briefs-multiselect__search';
    this.#searchInputNode.placeholder = `Filter ${this.#label.toLowerCase()}…`;
    this.#searchInputNode.addEventListener('input', () => this.#renderOptions());
    this.#panelNode.appendChild(this.#searchInputNode);

    this.#optionsListNode = document.createElement('div');
    this.#optionsListNode.className = 'briefs-multiselect__options';
    this.#panelNode.appendChild(this.#optionsListNode);

    this.#renderOptions();
    this.#updateTriggerLabel();

    return wrapper;
  }

  #renderOptions() {
    const query = this.#searchInputNode.value.trim().toLowerCase();
    this.#optionsListNode.replaceChildren();

    const filteredOptions = query.length === 0
      ? this.#options
      : this.#options.filter((option) => option.label.toLowerCase().includes(query));

    if (filteredOptions.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'briefs-multiselect__empty';
      empty.textContent = 'No matches.';
      this.#optionsListNode.appendChild(empty);
      return;
    }

    for (const option of filteredOptions) {
      const row = document.createElement('label');
      row.className = 'briefs-multiselect__option';

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.className = 'briefs-multiselect__checkbox';
      checkbox.checked = this.#selectedIds.has(option.id);
      checkbox.addEventListener('change', () => {
        if (checkbox.checked) this.#selectedIds.add(option.id); else this.#selectedIds.delete(option.id);
        this.#updateTriggerLabel();
        this.#onChange(this.getSelectedIds());
      });
      row.appendChild(checkbox);

      const swatch = document.createElement('span');
      swatch.className = 'briefs-multiselect__swatch';
      if (option.color !== null) {
        swatch.style.setProperty('--briefs-multiselect-swatch-color', option.color);
      }
      row.appendChild(swatch);

      const text = document.createElement('span');
      text.className = 'briefs-multiselect__option-label';
      text.textContent = option.label;
      row.appendChild(text);

      this.#optionsListNode.appendChild(row);
    }
  }

  #updateTriggerLabel() {
    const count = this.#selectedIds.size;
    this.#triggerLabelNode.textContent = count > 0 ? `${this.#label} · ${count}` : this.#label;
    this.#triggerNode.classList.toggle('briefs-multiselect__trigger--active', count > 0);
  }

  #open() {
    this.#isOpen = true;
    this.#panelNode.hidden = false;
    this.#searchInputNode.value = '';
    this.#searchInputNode.focus();
    this.#renderOptions();
    window.setTimeout(() => document.addEventListener('mousedown', this.#outsideClickHandler), 0);
  }

  #close() {
    this.#isOpen = false;
    this.#panelNode.hidden = true;
    document.removeEventListener('mousedown', this.#outsideClickHandler);
  }
}