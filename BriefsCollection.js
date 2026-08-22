import { Query } from './models/Query.js';
import { QueryResponse } from './models/QueryResponse.js';
import { BriefsEditor } from './BriefsEditor.js';
import { MultiSelectOption } from './ui/MultiSelectOption.js';
import { MultiSelectPopover } from './ui/MultiSelectPopover.js';
import { assert } from './utils/assert.js';
import { TypeRegistry } from './registries/TypeRegistry.js';
import { TagRegistry } from './registries/TagRegistry.js';
import { PersistenceAdapter } from './persistence/PersistenceAdapter.js';

export class BriefsCollection {
  static get layouts() {
    return Object.freeze({
      GRID: 'grid',
      LIST: 'list',
      CALENDAR: 'calendar',
      USER_PREFERENCE: 'user-preference'
    });
  }

  static get briefLaunchModes() {
    return Object.freeze({
      MODAL: 'modal',
      FULLSCREEN: 'fullscreen',
      SIDEBAR: 'sidebar',
      USER_PREFERENCE: 'user-preference'
    });
  }

  static get searchTriggers() {
    return Object.freeze({
      DEBOUNCED: 'debounced',
      SUBMIT: 'submit'
    });
  }

  static get paginationStyles() {
    return Object.freeze({
      NUMBERED: 'numbered',
      INFINITE_SCROLL: 'infinite-scroll'
    });
  }

  static #LAYOUT_STORAGE_KEY = 'briefs-collection:layout';
  static #LAUNCH_MODE_STORAGE_KEY = 'briefs-collection:launch-mode';
  static #SEARCH_DEBOUNCE_MS = 300;
  static #STYLE_ELEMENT_ID = 'briefs-collection-styles';

  #container;
  #onQuery;
  #typeRegistry;
  #tagRegistry;
  #persistenceAdapter;
  #head;
  #configuredLayout;
  #configuredLaunchMode;
  #searchTrigger;
  #paginationStyle;
  #showNewBriefButton;

  #currentQuery;
  #effectiveLayout;
  #effectiveLaunchMode;
  #lastResponse;
  #searchDebounceHandle;
  #infiniteScrollObserver;
  #activeLauncherNode;
  #activeEditor;

  #node;
  #toolbarNode;
  #searchInputNode;
  #layoutSwitcherNode;
  #launchModeSwitcherNode;
  #resultsNode;
  #paginationNode;

  constructor(
    container,
    onQuery,
    typeRegistry,
    tagRegistry,
    persistenceAdapter,
    head,
    layout,
    briefLaunchMode,
    initialQuery,
    searchTrigger,
    paginationStyle,
    showNewBriefButton
  ) {
    assert.instanceOf(container, HTMLElement, 'container');
    assert.function_(onQuery, 'onQuery');
    assert.instanceOf(typeRegistry, TypeRegistry, 'typeRegistry');
    assert.instanceOf(tagRegistry, TagRegistry, 'tagRegistry');
    assert.instanceOf(persistenceAdapter, PersistenceAdapter, 'persistenceAdapter');
    assert.instanceOf(head, HTMLHeadElement, 'head');
    if (!Object.values(BriefsCollection.layouts).includes(layout))
      throw new TypeError(`layout must be one of: ${Object.values(BriefsCollection.layouts).join(', ')}.`);
    if (!Object.values(BriefsCollection.briefLaunchModes).includes(briefLaunchMode))
      throw new TypeError(`briefLaunchMode must be one of: ${Object.values(BriefsCollection.briefLaunchModes).join(', ')}.`);
    assert.instanceOf(initialQuery, Query, 'initialQuery');
    if (!Object.values(BriefsCollection.searchTriggers).includes(searchTrigger))
      throw new TypeError(`searchTrigger must be one of: ${Object.values(BriefsCollection.searchTriggers).join(', ')}.`);
    if (!Object.values(BriefsCollection.paginationStyles).includes(paginationStyle))
      throw new TypeError(`paginationStyle must be one of: ${Object.values(BriefsCollection.paginationStyles).join(', ')}.`);
    assert.boolean(showNewBriefButton, 'showNewBriefButton');

    this.#container = container;
    this.#onQuery = onQuery;
    this.#typeRegistry = typeRegistry;
    this.#tagRegistry = tagRegistry;
    this.#persistenceAdapter = persistenceAdapter;
    this.#head = head;
    this.#configuredLayout = layout;
    this.#configuredLaunchMode = briefLaunchMode;
    this.#currentQuery = initialQuery;
    this.#searchTrigger = searchTrigger;
    this.#paginationStyle = paginationStyle;
    this.#showNewBriefButton = showNewBriefButton;

    this.#lastResponse = null;
    this.#searchDebounceHandle = null;
    this.#infiniteScrollObserver = null;
    this.#activeLauncherNode = null;
    this.#activeEditor = null;

    this.#effectiveLayout = this.#resolveEffectiveLayout();
    this.#effectiveLaunchMode = this.#resolveEffectiveLaunchMode();

    this.#injectStylesheet();
    this.#node = this.#buildRootNode();
    this.#container.appendChild(this.#node);

    this.#runQuery();
  }

  get node() {
    return this.#node;
  }

  static fromObject(obj) {
    assert.plainObject(obj, 'obj');
    return new BriefsCollection(
      obj.container,
      obj.onQuery,
      obj.typeRegistry,
      obj.tagRegistry,
      obj.persistenceAdapter,
      obj.head,
      obj.layout === undefined ? BriefsCollection.layouts.USER_PREFERENCE : obj.layout,
      obj.briefLaunchMode === undefined ? BriefsCollection.briefLaunchModes.USER_PREFERENCE : obj.briefLaunchMode,
      obj.initialQuery === undefined ? Query.fromWindowSearchParams() : obj.initialQuery,
      obj.searchTrigger === undefined ? BriefsCollection.searchTriggers.DEBOUNCED : obj.searchTrigger,
      obj.paginationStyle === undefined ? BriefsCollection.paginationStyles.NUMBERED : obj.paginationStyle,
      obj.showNewBriefButton === undefined ? true : obj.showNewBriefButton
    );
  }

  refresh() {
    this.#runQuery();
  }

  getCurrentQuery() {
    return this.#currentQuery.clone();
  }

  destroy() {
    if (this.#searchDebounceHandle !== null) window.clearTimeout(this.#searchDebounceHandle);
    if (this.#infiniteScrollObserver !== null) this.#infiniteScrollObserver.disconnect();
    this.#closeBrief();
    this.#node.remove();
  }

  // ---- preference resolution ----

  #resolveEffectiveLayout() {
    if (this.#configuredLayout !== BriefsCollection.layouts.USER_PREFERENCE) return this.#configuredLayout;
    const stored = this.#readPreference(BriefsCollection.#LAYOUT_STORAGE_KEY);
    const validStoredLayout = stored !== null
      && Object.values(BriefsCollection.layouts).includes(stored)
      && stored !== BriefsCollection.layouts.USER_PREFERENCE;
    return validStoredLayout ? stored : BriefsCollection.layouts.LIST;
  }

  #resolveEffectiveLaunchMode() {
    if (this.#configuredLaunchMode !== BriefsCollection.briefLaunchModes.USER_PREFERENCE) return this.#configuredLaunchMode;
    const stored = this.#readPreference(BriefsCollection.#LAUNCH_MODE_STORAGE_KEY);
    const validStoredMode = stored !== null
      && Object.values(BriefsCollection.briefLaunchModes).includes(stored)
      && stored !== BriefsCollection.briefLaunchModes.USER_PREFERENCE;
    return validStoredMode ? stored : BriefsCollection.briefLaunchModes.MODAL;
  }

  #readPreference(key) {
    assert.string(key, 'key');
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  }

  #writePreference(key, value) {
    assert.string(key, 'key');
    assert.string(value, 'value');
    try {
      window.localStorage.setItem(key, value);
    } catch {
      // storage unavailable; the preference simply will not persist
    }
  }

  // ---- root layout ----

  #buildRootNode() {
    const root = document.createElement('div');
    root.className = 'briefs-collection';

    this.#toolbarNode = this.#buildToolbarNode();
    root.appendChild(this.#toolbarNode);

    this.#resultsNode = document.createElement('div');
    this.#resultsNode.className = 'briefs-collection__results';
    root.appendChild(this.#resultsNode);

    this.#paginationNode = document.createElement('div');
    this.#paginationNode.className = 'briefs-collection__pagination';
    root.appendChild(this.#paginationNode);

    return root;
  }

  // ---- toolbar ----

  #buildToolbarNode() {
    const toolbar = document.createElement('div');
    toolbar.className = 'briefs-collection__toolbar';

    toolbar.appendChild(this.#buildSearchNode());
    toolbar.appendChild(this.#buildFilterNode());
    toolbar.appendChild(this.#buildSortNode());

    if (this.#configuredLayout === BriefsCollection.layouts.USER_PREFERENCE) {
      this.#layoutSwitcherNode = this.#buildLayoutSwitcherNode();
      toolbar.appendChild(this.#layoutSwitcherNode);
    }

    if (this.#configuredLaunchMode === BriefsCollection.briefLaunchModes.USER_PREFERENCE) {
      this.#launchModeSwitcherNode = this.#buildLaunchModeSwitcherNode();
      toolbar.appendChild(this.#launchModeSwitcherNode);
    }

    if (this.#showNewBriefButton) {
      toolbar.appendChild(this.#buildNewBriefButtonNode());
    }

    return toolbar;
  }

  #buildSearchNode() {
    const wrapper = document.createElement('div');
    wrapper.className = 'briefs-collection__search';

    const input = document.createElement('input');
    input.type = 'search';
    input.className = 'briefs-collection__search-input';
    input.placeholder = 'Search briefs…';
    input.value = this.#currentQuery.text;
    this.#searchInputNode = input;
    wrapper.appendChild(input);

    const applyText = () => {
      this.#currentQuery.text = input.value;
      this.#currentQuery.pageIndex = 0;
      this.#runQuery();
    };

    if (this.#searchTrigger === BriefsCollection.searchTriggers.DEBOUNCED) {
      input.addEventListener('input', () => {
        if (this.#searchDebounceHandle !== null) window.clearTimeout(this.#searchDebounceHandle);
        this.#searchDebounceHandle = window.setTimeout(applyText, BriefsCollection.#SEARCH_DEBOUNCE_MS);
      });
    } else {
      const submitButton = document.createElement('button');
      submitButton.type = 'button';
      submitButton.className = 'briefs-collection__search-submit';
      submitButton.textContent = 'Search';
      submitButton.addEventListener('click', applyText);
      input.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') applyText();
      });
      wrapper.appendChild(submitButton);
    }

    return wrapper;
  }

  #buildFilterNode() {
    const wrapper = document.createElement('div');
    wrapper.className = 'briefs-collection__filters';

    const tagSelect = document.createElement('select');
    tagSelect.className = 'briefs-collection__tag-filter';
    tagSelect.multiple = true;
    tagSelect.setAttribute('aria-label', 'Filter by tag');
    for (const tag of this.#tagRegistry.list()) {
      const option = document.createElement('option');
      option.value = tag.id;
      option.textContent = tag.label;
      option.selected = this.#currentQuery.tagIds.includes(tag.id);
      tagSelect.appendChild(option);
    }
    tagSelect.addEventListener('change', () => {
      this.#currentQuery.tagIds = Array.from(tagSelect.selectedOptions).map((option) => option.value);
      this.#currentQuery.pageIndex = 0;
      this.#runQuery();
    });
    wrapper.appendChild(tagSelect);

    const typeSelect = document.createElement('select');
    typeSelect.className = 'briefs-collection__type-filter';
    typeSelect.multiple = true;
    typeSelect.setAttribute('aria-label', 'Filter by type');
    for (const typeDefinition of this.#typeRegistry.list()) {
      const option = document.createElement('option');
      option.value = typeDefinition.id;
      option.textContent = typeDefinition.label;
      option.selected = this.#currentQuery.typeIds.includes(typeDefinition.id);
      typeSelect.appendChild(option);
    }
    typeSelect.addEventListener('change', () => {
      this.#currentQuery.typeIds = Array.from(typeSelect.selectedOptions).map((option) => option.value);
      this.#currentQuery.pageIndex = 0;
      this.#runQuery();
    });
    wrapper.appendChild(typeSelect);

    return wrapper;
  }

  #buildSortNode() {
    const wrapper = document.createElement('div');
    wrapper.className = 'briefs-collection__sort';

    const select = document.createElement('select');
    select.className = 'briefs-collection__sort-by';
    select.setAttribute('aria-label', 'Sort by');

    const modifiedOption = document.createElement('option');
    modifiedOption.value = Query.sortFields.MODIFIED;
    modifiedOption.textContent = 'Last modified';
    select.appendChild(modifiedOption);

    const createdOption = document.createElement('option');
    createdOption.value = Query.sortFields.CREATED;
    createdOption.textContent = 'Date created';
    select.appendChild(createdOption);

    select.value = this.#currentQuery.sortBy;
    select.addEventListener('change', () => {
      this.#currentQuery.sortBy = select.value;
      this.#currentQuery.pageIndex = 0;
      this.#runQuery();
    });
    wrapper.appendChild(select);

    const directionButton = document.createElement('button');
    directionButton.type = 'button';
    directionButton.className = 'briefs-collection__sort-direction';
    directionButton.setAttribute('aria-label', 'Toggle sort direction');
    directionButton.textContent = this.#currentQuery.sortDirection === Query.sortDirections.ASC ? '↑' : '↓';
    directionButton.addEventListener('click', () => {
      this.#currentQuery.sortDirection = this.#currentQuery.sortDirection === Query.sortDirections.ASC
        ? Query.sortDirections.DESC
        : Query.sortDirections.ASC;
      directionButton.textContent = this.#currentQuery.sortDirection === Query.sortDirections.ASC ? '↑' : '↓';
      this.#currentQuery.pageIndex = 0;
      this.#runQuery();
    });
    wrapper.appendChild(directionButton);

    return wrapper;
  }

  #buildLayoutSwitcherNode() {
    const wrapper = document.createElement('div');
    wrapper.className = 'briefs-collection__layout-switcher';
    for (const [key, value] of Object.entries(BriefsCollection.layouts)) {
      if (value === BriefsCollection.layouts.USER_PREFERENCE) continue;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'briefs-collection__layout-button';
      button.dataset.layout = value;
      button.textContent = key.charAt(0) + key.slice(1).toLowerCase();
      button.setAttribute('aria-pressed', String(this.#effectiveLayout === value));
      button.addEventListener('click', () => {
        this.#effectiveLayout = value;
        this.#writePreference(BriefsCollection.#LAYOUT_STORAGE_KEY, value);
        this.#updateLayoutButtonStates();
        this.#renderResults();
      });
      wrapper.appendChild(button);
    }
    return wrapper;
  }

  #updateLayoutButtonStates() {
    if (this.#layoutSwitcherNode === undefined) return;
    for (const button of this.#layoutSwitcherNode.querySelectorAll('.briefs-collection__layout-button')) {
      button.setAttribute('aria-pressed', String(button.dataset.layout === this.#effectiveLayout));
    }
  }

  #buildLaunchModeSwitcherNode() {
    const wrapper = document.createElement('div');
    wrapper.className = 'briefs-collection__launch-mode-switcher';
    for (const [key, value] of Object.entries(BriefsCollection.briefLaunchModes)) {
      if (value === BriefsCollection.briefLaunchModes.USER_PREFERENCE) continue;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'briefs-collection__launch-mode-button';
      button.dataset.launchMode = value;
      button.textContent = key.charAt(0) + key.slice(1).toLowerCase();
      button.setAttribute('aria-pressed', String(this.#effectiveLaunchMode === value));
      button.addEventListener('click', () => {
        this.#effectiveLaunchMode = value;
        this.#writePreference(BriefsCollection.#LAUNCH_MODE_STORAGE_KEY, value);
        this.#updateLaunchModeButtonStates();
      });
      wrapper.appendChild(button);
    }
    return wrapper;
  }

  #updateLaunchModeButtonStates() {
    if (this.#launchModeSwitcherNode === undefined) return;
    for (const button of this.#launchModeSwitcherNode.querySelectorAll('.briefs-collection__launch-mode-button')) {
      button.setAttribute('aria-pressed', String(button.dataset.launchMode === this.#effectiveLaunchMode));
    }
  }

  #buildNewBriefButtonNode() {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'briefs-collection__new-brief-button';
    button.textContent = '+ New Brief';
    button.addEventListener('click', () => {
      this.#openBrief(null);
    });
    return button;
  }

  // ---- querying ----

  async #runQuery() {
    this.#resultsNode.setAttribute('aria-busy', 'true');
    this.#updateHistory();

    let response;
    try {
      response = await this.#onQuery(this.#currentQuery);
    } catch (error) {
      this.#resultsNode.removeAttribute('aria-busy');
      this.#renderError(error);
      return;
    }
    if (!(response instanceof QueryResponse)) {
      throw new TypeError('onQuery must resolve to a QueryResponse instance.');
    }

    this.#lastResponse = response;
    this.#resultsNode.removeAttribute('aria-busy');
    this.#renderResults();
    this.#renderPagination();
  }

  async #runQueryAppending() {
    let response;
    try {
      response = await this.#onQuery(this.#currentQuery);
    } catch (error) {
      this.#renderError(error);
      return;
    }
    if (!(response instanceof QueryResponse)) {
      throw new TypeError('onQuery must resolve to a QueryResponse instance.');
    }

    const combinedResults = [...this.#lastResponse.results, ...response.results];
    this.#lastResponse = new QueryResponse(combinedResults, response.totalCount);
    this.#appendResults(response.results);
    this.#renderPagination();
  }

  #updateHistory() {
    try {
      const params = this.#currentQuery.toSearchParams();
      const queryString = params.toString();
      const newUrl = `${window.location.pathname}${queryString.length > 0 ? `?${queryString}` : ''}${window.location.hash}`;
      window.history.replaceState(null, '', newUrl);
    } catch {
      // history API unavailable in this environment; ignore
    }
  }

  // ---- results rendering ----

  #renderError(error) {
    this.#resultsNode.replaceChildren();
    const message = document.createElement('p');
    message.className = 'briefs-collection__error';
    message.textContent = `Could not load briefs: ${error instanceof Error ? error.message : String(error)}`;
    this.#resultsNode.appendChild(message);
  }

  #renderResults() {
    if (this.#lastResponse === null) return;
    this.#resultsNode.replaceChildren();

    const results = this.#lastResponse.results;
    if (results.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'briefs-collection__empty';
      empty.textContent = 'No briefs found.';
      this.#resultsNode.appendChild(empty);
      return;
    }

    if (this.#effectiveLayout === BriefsCollection.layouts.CALENDAR) {
      this.#resultsNode.appendChild(this.#buildCalendarNode(results));
      return;
    }

    const list = document.createElement('div');
    list.className = this.#effectiveLayout === BriefsCollection.layouts.GRID
      ? 'briefs-collection__grid'
      : 'briefs-collection__list';
    for (const summary of results) {
      list.appendChild(this.#buildCardNode(summary));
    }
    this.#resultsNode.appendChild(list);
  }

  #appendResults(newResults) {
    if (this.#effectiveLayout === BriefsCollection.layouts.CALENDAR) {
      this.#renderResults();
      return;
    }
    const list = this.#resultsNode.querySelector('.briefs-collection__grid, .briefs-collection__list');
    if (list === null) {
      this.#renderResults();
      return;
    }
    for (const summary of newResults) {
      list.appendChild(this.#buildCardNode(summary));
    }
  }

  #buildCardNode(summary) {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = this.#effectiveLayout === BriefsCollection.layouts.GRID
      ? 'briefs-collection__card briefs-collection__card--grid'
      : 'briefs-collection__card briefs-collection__card--list';
    card.addEventListener('click', () => this.#openBrief(summary.id));

    const title = document.createElement('div');
    title.className = 'briefs-collection__card-title';
    title.textContent = summary.name !== null ? summary.name : 'Untitled brief';
    card.appendChild(title);

    const date = document.createElement('div');
    date.className = 'briefs-collection__card-date';
    date.textContent = summary.date.toLocaleDateString();
    card.appendChild(date);

    if (summary.snippet !== null) {
      const snippet = document.createElement('div');
      snippet.className = 'briefs-collection__card-snippet';
      snippet.textContent = summary.snippet;
      card.appendChild(snippet);
    }

    if (summary.tagIds.length > 0) {
      const tagRow = document.createElement('div');
      tagRow.className = 'briefs-collection__card-tags';
      for (const tagId of summary.tagIds) {
        const tag = this.#tagRegistry.get(tagId);
        const chip = document.createElement('span');
        chip.className = 'briefs-collection__tag-chip';
        chip.textContent = tag !== null && tag !== undefined ? tag.label : tagId;
        if (tag !== null && tag !== undefined && tag.color) {
          chip.style.setProperty('--briefs-collection-tag-color', tag.color);
        }
        tagRow.appendChild(chip);
      }
      card.appendChild(tagRow);
    }

    return card;
  }

  #buildCalendarNode(results) {
    const container = document.createElement('div');
    container.className = 'briefs-collection__calendar';

    const referenceDate = results[0].date;
    const visibleYear = referenceDate.getFullYear();
    const visibleMonth = referenceDate.getMonth();

    const monthLabel = document.createElement('div');
    monthLabel.className = 'briefs-collection__calendar-month-label';
    monthLabel.textContent = referenceDate.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    container.appendChild(monthLabel);

    const grid = document.createElement('div');
    grid.className = 'briefs-collection__calendar-grid';

    const daysInMonth = new Date(visibleYear, visibleMonth + 1, 0).getDate();
    const firstWeekday = new Date(visibleYear, visibleMonth, 1).getDay();

    const resultsByDay = new Map();
    for (const summary of results) {
      if (summary.date.getFullYear() !== visibleYear || summary.date.getMonth() !== visibleMonth) continue;
      const day = summary.date.getDate();
      if (!resultsByDay.has(day)) resultsByDay.set(day, []);
      resultsByDay.get(day).push(summary);
    }

    for (let i = 0; i < firstWeekday; i += 1) {
      const filler = document.createElement('div');
      filler.className = 'briefs-collection__calendar-cell briefs-collection__calendar-cell--empty';
      grid.appendChild(filler);
    }

    for (let day = 1; day <= daysInMonth; day += 1) {
      const cell = document.createElement('div');
      cell.className = 'briefs-collection__calendar-cell';

      const dayLabel = document.createElement('div');
      dayLabel.className = 'briefs-collection__calendar-day-label';
      dayLabel.textContent = String(day);
      cell.appendChild(dayLabel);

      const dayResults = resultsByDay.get(day);
      if (dayResults !== undefined) {
        for (const summary of dayResults) {
          const entry = document.createElement('button');
          entry.type = 'button';
          entry.className = 'briefs-collection__calendar-entry';
          entry.textContent = summary.name !== null ? summary.name : 'Untitled';
          entry.addEventListener('click', () => this.#openBrief(summary.id));
          cell.appendChild(entry);
        }
      }

      grid.appendChild(cell);
    }

    container.appendChild(grid);
    return container;
  }

  // ---- pagination rendering ----

  #renderPagination() {
    this.#paginationNode.replaceChildren();
    if (this.#lastResponse === null) return;

    if (this.#paginationStyle === BriefsCollection.paginationStyles.NUMBERED) {
      this.#renderNumberedPagination();
    } else {
      this.#renderInfiniteScrollSentinel();
    }
  }

  #renderNumberedPagination() {
    const totalPages = Math.max(1, Math.ceil(this.#lastResponse.totalCount / this.#currentQuery.pageLength));
    const currentPage = this.#currentQuery.pageIndex;

    const prevButton = document.createElement('button');
    prevButton.type = 'button';
    prevButton.className = 'briefs-collection__page-button';
    prevButton.textContent = 'Previous';
    prevButton.disabled = currentPage <= 0;
    prevButton.addEventListener('click', () => {
      this.#currentQuery.pageIndex = currentPage - 1;
      this.#runQuery();
    });
    this.#paginationNode.appendChild(prevButton);

    const label = document.createElement('span');
    label.className = 'briefs-collection__page-label';
    label.textContent = `Page ${currentPage + 1} of ${totalPages}`;
    this.#paginationNode.appendChild(label);

    const nextButton = document.createElement('button');
    nextButton.type = 'button';
    nextButton.className = 'briefs-collection__page-button';
    nextButton.textContent = 'Next';
    nextButton.disabled = currentPage >= totalPages - 1;
    nextButton.addEventListener('click', () => {
      this.#currentQuery.pageIndex = currentPage + 1;
      this.#runQuery();
    });
    this.#paginationNode.appendChild(nextButton);
  }

  #renderInfiniteScrollSentinel() {
    const hasMore = (this.#currentQuery.pageIndex + 1) * this.#currentQuery.pageLength < this.#lastResponse.totalCount;
    if (!hasMore) return;

    const sentinel = document.createElement('div');
    sentinel.className = 'briefs-collection__scroll-sentinel';
    this.#paginationNode.appendChild(sentinel);

    if (this.#infiniteScrollObserver !== null) this.#infiniteScrollObserver.disconnect();
    this.#infiniteScrollObserver = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          this.#infiniteScrollObserver.disconnect();
          this.#currentQuery.pageIndex += 1;
          this.#runQueryAppending();
        }
      }
    });
    this.#infiniteScrollObserver.observe(sentinel);
  }

  // ---- brief launching ----

  async #openBrief(briefId) {
    assert.stringOrNull(briefId, 'briefId');
    if (this.#activeLauncherNode !== null) return;

    let initialPage;
    if (briefId !== null) {
      try {
        initialPage = await this.#persistenceAdapter.load(briefId);
      } catch (error) {
        this.#renderError(error);
        return;
      }
    }

    const overlay = this.#buildLauncherOverlay(this.#effectiveLaunchMode);
    this.#activeLauncherNode = overlay.node;
    document.body.appendChild(overlay.node);

    const editorConfig = {
      container: overlay.editorContainer,
      head: this.#head,
      typeRegistry: this.#typeRegistry,
      tagRegistry: this.#tagRegistry,
      persistenceAdapter: this.#persistenceAdapter
    };
    if (initialPage !== undefined) editorConfig.initialPage = initialPage;

    this.#activeEditor = BriefsEditor.fromObject(editorConfig);
  }

  #buildLauncherOverlay(mode) {
    const overlay = document.createElement('div');
    overlay.className = `briefs-collection__launcher briefs-collection__launcher--${mode}`;

    if (mode === BriefsCollection.briefLaunchModes.MODAL) {
      const backdrop = document.createElement('div');
      backdrop.className = 'briefs-collection__launcher-backdrop';
      backdrop.addEventListener('click', () => this.#closeBrief());
      overlay.appendChild(backdrop);
    }

    const closeButton = document.createElement('button');
    closeButton.type = 'button';
    closeButton.className = 'briefs-collection__launcher-close';
    closeButton.textContent = 'Close';
    closeButton.addEventListener('click', () => this.#closeBrief());
    overlay.appendChild(closeButton);

    const editorContainer = document.createElement('div');
    editorContainer.className = 'briefs-collection__launcher-editor';
    overlay.appendChild(editorContainer);

    return { node: overlay, editorContainer };
  }

  #closeBrief() {
    if (this.#activeLauncherNode === null) return;
    if (this.#activeEditor !== null && typeof this.#activeEditor.destroy === 'function') {
      this.#activeEditor.destroy();
    }
    this.#activeEditor = null;
    this.#activeLauncherNode.remove();
    this.#activeLauncherNode = null;
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

  // ---- styling ----

  #injectStylesheet() {
    if (window['__BECKER_BRIEFS_COLLECTION_STYLES_INJECTED__'] !== true) {
        window['__BECKER_BRIEFS_COLLECTION_STYLES_INJECTED__'] = true;
        this.#appendPreconnect(this.#head, 'https://fonts.googleapis.com', false);
        this.#appendPreconnect(this.#head, 'https://fonts.gstatic.com', true);
        this.#appendStylesheet(this.#head, 'https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600&family=Source+Serif+4:ital,wght@0,400;0,600;1,400&family=IBM+Plex+Mono:wght@400;500&display=swap');
        this.#appendStylesheet(this.#head, './ui/styles.css');
    }

    if (this.#head.querySelector(`#${BriefsCollection.#STYLE_ELEMENT_ID}`) === null) {
        const style = document.createElement('style');
        style.id = BriefsCollection.#STYLE_ELEMENT_ID;
        style.textContent = `
          .briefs-collection {
            display: flex;
            flex-direction: column;
            gap: 1rem;
            font-family: var(--BRIEFS-font-body);
            color: var(--BRIEFS-ink);
            background: var(--BRIEFS-paper);
          }
          .briefs-collection__toolbar {
            display: flex;
            flex-wrap: wrap;
            align-items: center;
            gap: 0.75rem;
            padding: 0.75rem;
            background: var(--BRIEFS-paper-raised);
            border-bottom: 1px solid var(--BRIEFS-rule);
          }
          .briefs-collection__search-input,
          .briefs-collection__tag-filter,
          .briefs-collection__type-filter,
          .briefs-collection__sort-by {
            font-family: var(--BRIEFS-font-body);
            color: var(--BRIEFS-ink);
            background: var(--BRIEFS-paper);
            border: 1px solid var(--BRIEFS-rule);
            border-radius: 4px;
            padding: 0.4rem 0.6rem;
          }
          .briefs-collection__search-submit,
          .briefs-collection__sort-direction,
          .briefs-collection__layout-button,
          .briefs-collection__launch-mode-button,
          .briefs-collection__new-brief-button,
          .briefs-collection__page-button {
            font-family: var(--BRIEFS-font-mono);
            color: var(--BRIEFS-structural);
            background: var(--BRIEFS-paper);
            border: 1px solid var(--BRIEFS-structural-soft);
            border-radius: 4px;
            padding: 0.4rem 0.75rem;
            cursor: pointer;
          }
          .briefs-collection__layout-button[aria-pressed='true'],
          .briefs-collection__launch-mode-button[aria-pressed='true'] {
            background: var(--BRIEFS-structural);
            color: var(--BRIEFS-paper);
          }
          .briefs-collection__new-brief-button {
            color: var(--BRIEFS-paper);
            background: var(--BRIEFS-structural);
            border-color: var(--BRIEFS-structural);
          }
          .briefs-collection__results {
            padding: 0 0.75rem;
          }
          .briefs-collection__grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
            gap: 0.75rem;
          }
          .briefs-collection__list {
            display: flex;
            flex-direction: column;
            gap: 0.5rem;
          }
          .briefs-collection__card {
            display: flex;
            flex-direction: column;
            gap: 0.35rem;
            text-align: left;
            font-family: var(--BRIEFS-font-body);
            color: var(--BRIEFS-ink);
            background: var(--BRIEFS-paper-raised);
            border: 1px solid var(--BRIEFS-rule);
            border-radius: 6px;
            padding: 0.75rem;
            cursor: pointer;
          }
          .briefs-collection__card:hover {
            border-color: var(--BRIEFS-structural-soft);
          }
          .briefs-collection__card-title {
            font-family: var(--BRIEFS-font-display);
            font-size: 1.1rem;
          }
          .briefs-collection__card-date {
            font-family: var(--BRIEFS-font-mono);
            font-size: 0.75rem;
            color: var(--BRIEFS-ink-soft);
          }
          .briefs-collection__card-snippet {
            font-size: 0.9rem;
            color: var(--BRIEFS-ink-soft);
          }
          .briefs-collection__card-tags {
            display: flex;
            flex-wrap: wrap;
            gap: 0.3rem;
          }
          .briefs-collection__tag-chip {
            font-family: var(--BRIEFS-font-mono);
            font-size: 0.7rem;
            color: var(--BRIEFS-paper);
            background: var(--briefs-collection-tag-color, var(--BRIEFS-structural));
            border-radius: 999px;
            padding: 0.15rem 0.5rem;
          }
          .briefs-collection__empty,
          .briefs-collection__error {
            color: var(--BRIEFS-ink-soft);
            font-style: italic;
            padding: 2rem 0;
            text-align: center;
          }
          .briefs-collection__error {
            color: var(--BRIEFS-accent-todo);
          }
          .briefs-collection__calendar-month-label {
            font-family: var(--BRIEFS-font-display);
            font-size: 1.1rem;
            padding: 0 0 0.5rem;
          }
          .briefs-collection__calendar-grid {
            display: grid;
            grid-template-columns: repeat(7, 1fr);
            gap: 1px;
            background: var(--BRIEFS-rule);
            border: 1px solid var(--BRIEFS-rule);
          }
          .briefs-collection__calendar-cell {
            background: var(--BRIEFS-paper-raised);
            min-height: 90px;
            padding: 0.3rem;
            display: flex;
            flex-direction: column;
            gap: 0.2rem;
          }
          .briefs-collection__calendar-cell--empty {
            background: var(--BRIEFS-paper);
          }
          .briefs-collection__calendar-day-label {
            font-family: var(--BRIEFS-font-mono);
            font-size: 0.7rem;
            color: var(--BRIEFS-ink-soft);
          }
          .briefs-collection__calendar-entry {
            font-family: var(--BRIEFS-font-body);
            font-size: 0.75rem;
            text-align: left;
            background: none;
            border: none;
            color: var(--BRIEFS-structural);
            cursor: pointer;
            padding: 0;
          }
          .briefs-collection__pagination {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 0.75rem;
            padding: 0.75rem;
          }
          .briefs-collection__page-label {
            font-family: var(--BRIEFS-font-mono);
            font-size: 0.85rem;
            color: var(--BRIEFS-ink-soft);
          }
          .briefs-collection__scroll-sentinel {
            height: 1px;
          }
          .briefs-collection__launcher {
            position: fixed;
            inset: 0;
            z-index: 1000;
            display: flex;
          }
          .briefs-collection__launcher-backdrop {
            position: absolute;
            inset: 0;
            background: rgba(32, 38, 43, 0.5);
          }
          .briefs-collection__launcher--modal {
            align-items: center;
            justify-content: center;
          }
          .briefs-collection__launcher--modal .briefs-collection__launcher-editor {
            position: relative;
            width: min(90vw, 720px);
            max-height: 85vh;
            overflow-y: auto;
            background: var(--BRIEFS-paper);
            border-radius: 8px;
            padding: 1rem;
          }
          .briefs-collection__launcher--fullscreen .briefs-collection__launcher-editor {
            width: 100%;
            height: 100%;
            background: var(--BRIEFS-paper);
            overflow-y: auto;
            padding: 1rem;
          }
          .briefs-collection__launcher--sidebar {
            justify-content: flex-end;
          }
          .briefs-collection__launcher--sidebar .briefs-collection__launcher-editor {
            width: 50vw;
            height: 100%;
            background: var(--BRIEFS-paper);
            overflow-y: auto;
            padding: 1rem;
          }
          @media (max-width: 640px) {
            .briefs-collection__launcher--sidebar .briefs-collection__launcher-editor {
              width: 100vw;
            }
          }
          .briefs-collection__launcher-close {
            position: absolute;
            top: 0.5rem;
            right: 0.5rem;
            z-index: 1001;
            font-family: var(--BRIEFS-font-mono);
            background: var(--BRIEFS-paper-raised);
            border: 1px solid var(--BRIEFS-rule);
            border-radius: 4px;
            padding: 0.3rem 0.6rem;
            cursor: pointer;
          }
        `;
        this.#head.appendChild(style);
    }
  }
}