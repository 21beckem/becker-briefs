import { Query } from './models/Query.js';
import { QueryResponse } from './models/QueryResponse.js';
import { BriefsEditor } from './BriefsEditor.js';
import { MultiSelectOption } from './ui/MultiSelectOption.js';
import { MultiSelectPopover } from './ui/MultiSelectPopover.js';
import { SingleSelectOption } from './ui/SingleSelectOption.js';
import { SingleSelectDropdown } from './ui/SingleSelectDropdown.js';
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
      MODAL: 'popup',
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
  #tagFilterPopover;
  #typeFilterPopover;

  #node;
  #toolbarNode;
  #searchInputNode;
  #layoutSwitcherNode;
  #resultsNode;
  #paginationNode;
  #activeLaunchModeDropdown;

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
    this.#tagFilterPopover = null;
    this.#typeFilterPopover = null;
    this.#activeLaunchModeDropdown = null;

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
      obj.showNewBriefButton === undefined ? false : obj.showNewBriefButton
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
    if (this.#tagFilterPopover !== null) this.#tagFilterPopover.destroy();
    if (this.#typeFilterPopover !== null) this.#typeFilterPopover.destroy();
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

    const tagOptions = this.#tagRegistry.list().map((tag) => MultiSelectOption.fromObject({
      id: tag.id,
      label: tag.label,
      color: tag.color === undefined ? null : tag.color
    }));
    this.#tagFilterPopover = MultiSelectPopover.fromObject({
      label: 'Tags',
      options: tagOptions,
      selectedIds: this.#currentQuery.tagIds,
      onChange: (selectedIds) => {
        this.#currentQuery.tagIds = selectedIds;
        this.#currentQuery.pageIndex = 0;
        this.#runQuery();
      }
    });
    wrapper.appendChild(this.#tagFilterPopover.node);

    const typeOptions = this.#typeRegistry.list().map((typeDefinition) => MultiSelectOption.fromObject({
      id: typeDefinition.id,
      label: typeDefinition.label,
      color: null
    }));
    this.#typeFilterPopover = MultiSelectPopover.fromObject({
      label: 'Types',
      options: typeOptions,
      selectedIds: this.#currentQuery.typeIds,
      onChange: (selectedIds) => {
        this.#currentQuery.typeIds = selectedIds;
        this.#currentQuery.pageIndex = 0;
        this.#runQuery();
      }
    });
    wrapper.appendChild(this.#typeFilterPopover.node);

    return wrapper;
  }

  #buildSortNode() {
    const wrapper = document.createElement('div');
    wrapper.className = 'briefs-collection__sort';

    // Sorty By dropdown
    // const select = document.createElement('select');
    // select.className = 'briefs-collection__sort-by';
    // select.setAttribute('aria-label', 'Sort by');

    // const modifiedOption = document.createElement('option');
    // modifiedOption.value = Query.sortFields.MODIFIED;
    // modifiedOption.textContent = 'Last modified';
    // select.appendChild(modifiedOption);

    // const createdOption = document.createElement('option');
    // createdOption.value = Query.sortFields.CREATED;
    // createdOption.textContent = 'Date created';
    // select.appendChild(createdOption);

    // select.value = this.#currentQuery.sortBy;
    // select.addEventListener('change', () => {
    //   this.#currentQuery.sortBy = select.value;
    //   this.#currentQuery.pageIndex = 0;
    //   this.#runQuery();
    // });
    // wrapper.appendChild(select);

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

  #buildNewBriefButtonNode() {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'briefs-collection__new-brief-button';
    button.textContent = 'New Brief';
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

        const dot = document.createElement('span');
        dot.className = 'briefs-collection__tag-dot';
        if (tag !== null && tag !== undefined && tag.color) {
          dot.style.setProperty('--briefs-collection-tag-color', tag.color);
        }
        chip.appendChild(dot);

        const label = document.createElement('span');
        label.textContent = tag !== null && tag !== undefined ? tag.label : tagId;
        chip.appendChild(label);

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
    prevButton.textContent = '‹ Previous';
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
    nextButton.textContent = 'Next ›';
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

    const editorContainer = document.createElement('div');
    editorContainer.className = 'briefs-collection__launcher-editor';
    overlay.appendChild(editorContainer);

    const controls = document.createElement('div');
    controls.className = 'briefs-collection__launcher-controls';
    editorContainer.appendChild(controls);

    if (this.#configuredLaunchMode === BriefsCollection.briefLaunchModes.USER_PREFERENCE) {
      const modeOptions = Object.entries(BriefsCollection.briefLaunchModes)
        .filter(([, value]) => value !== BriefsCollection.briefLaunchModes.USER_PREFERENCE)
        .map(([key, value]) => SingleSelectOption.fromObject({
          id: value,
          label: value.charAt(0).toUpperCase() + value.slice(1).toLowerCase()
        }));

      this.#activeLaunchModeDropdown = SingleSelectDropdown.fromObject({
        options: modeOptions,
        selectedId: mode,
        onChange: (newMode) => {
          this.#effectiveLaunchMode = newMode;
          this.#writePreference(BriefsCollection.#LAUNCH_MODE_STORAGE_KEY, newMode);
          this.#applyLauncherMode(newMode);
        }
      });
      controls.appendChild(this.#activeLaunchModeDropdown.node);
    }

    const closeButton = document.createElement('button');
    closeButton.type = 'button';
    closeButton.className = 'briefs-collection__launcher-close';
    closeButton.setAttribute('aria-label', 'Close');
    closeButton.textContent = '×';
    closeButton.addEventListener('click', () => this.#closeBrief());
    controls.appendChild(closeButton);

    return { node: overlay, editorContainer };
  }

  #applyLauncherMode(newMode) {
    if (this.#activeLauncherNode === null) return;
    this.#activeLauncherNode.className = `briefs-collection__launcher briefs-collection__launcher--${newMode}`;

    const existingBackdrop = this.#activeLauncherNode.querySelector('.briefs-collection__launcher-backdrop');
    const needsBackdrop = newMode === BriefsCollection.briefLaunchModes.MODAL;

    if (needsBackdrop && existingBackdrop === null) {
      const backdrop = document.createElement('div');
      backdrop.className = 'briefs-collection__launcher-backdrop';
      backdrop.addEventListener('click', () => this.#closeBrief());
      this.#activeLauncherNode.insertBefore(backdrop, this.#activeLauncherNode.firstChild);
    } else if (!needsBackdrop && existingBackdrop !== null) {
      existingBackdrop.remove();
    }
  }

  #closeBrief() {
    if (this.#activeLauncherNode === null) return;
    if (this.#activeEditor !== null && typeof this.#activeEditor.destroy === 'function')
      this.#activeEditor.destroy();
    if (this.#activeLaunchModeDropdown !== null)
      this.#activeLaunchModeDropdown.destroy();
    this.#activeEditor = null;
    this.#activeLaunchModeDropdown = null;
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
          --bc-space-1: 0.5rem;
          --bc-space-2: 0.75rem;
          --bc-space-3: 1.25rem;
          --bc-space-4: 2rem;
          --bc-label: 0.6875rem;
          --bc-radius: 6px;
          height: 100%;
          display: flex;
          flex-direction: column;
          gap: var(--bc-space-4);
          font-family: var(--BRIEFS-font-body);
          color: var(--BRIEFS-ink);
          background: var(--BRIEFS-paper);
        }
        .briefs-collection *,
        .briefs-collection *::before,
        .briefs-collection *::after {
          box-sizing: border-box;
        }
        .briefs-collection button {
          font: inherit;
        }
        .briefs-collection :focus-visible {
          outline: 1.5px solid var(--BRIEFS-structural);
          outline-offset: 2px;
        }

        /* ---- toolbar ---- */
        .briefs-collection__toolbar {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: var(--bc-space-2) var(--bc-space-3);
          padding-bottom: var(--bc-space-2);
          border-bottom: 1px solid var(--BRIEFS-rule);
            padding-top: var(--bc-space-2);
          }
          .briefs-collection__results {
            flex: 1 1 auto;
            overflow: auto;
        }
        .briefs-collection__search {
          display: flex;
          align-items: center;
          gap: var(--bc-space-1);
          flex: 1 1 220px;
          min-width: 160px;
        }
        .briefs-collection__search-input {
          width: 100%;
          font-family: var(--BRIEFS-font-body);
          font-size: 0.95rem;
          color: var(--BRIEFS-ink);
          background: transparent;
          border: none;
          border-bottom: 1px solid var(--BRIEFS-rule);
          padding: 0.35rem 0.1rem;
          transition: border-color 120ms ease;
        }
        .briefs-collection__search-input::placeholder {
          color: var(--BRIEFS-ink-soft);
        }
        .briefs-collection__search-input:focus-visible {
          outline: none;
          border-bottom-color: var(--BRIEFS-structural);
        }
        .briefs-collection__search-submit {
          flex-shrink: 0;
        }
        .briefs-collection__filters,
        .briefs-collection__sort,
        .briefs-collection__layout-switcher {
          display: flex;
          align-items: center;
          gap: var(--bc-space-1);
        }

        /* ---- shared ghost/ pill buttons ---- */
        .briefs-collection__search-submit,
        .briefs-collection__sort-by,
        .briefs-collection__sort-direction,
        .briefs-collection__layout-button,
        .briefs-collection__page-button {
          font-family: var(--BRIEFS-font-mono);
          font-size: var(--bc-label);
          letter-spacing: 0.06em;
          text-transform: uppercase;
          color: var(--BRIEFS-ink-soft);
          background: transparent;
          border: 1px solid transparent;
          border-radius: var(--bc-radius);
          padding: 0.4rem 0.65rem;
          cursor: pointer;
          transition: background 120ms ease, color 120ms ease, border-color 120ms ease;
        }
        .briefs-collection__search-submit:hover,
        .briefs-collection__sort-direction:hover,
        .briefs-collection__layout-button:hover,
        .briefs-collection__page-button:hover:not(:disabled) {
          background: var(--BRIEFS-paper-raised);
          color: var(--BRIEFS-ink);
        }
        .briefs-collection__page-button:disabled {
          opacity: 0.35;
          cursor: default;
        }
        .briefs-collection__sort-by {
          text-transform: none;
          letter-spacing: normal;
          font-family: var(--BRIEFS-font-body);
          font-size: 0.85rem;
          border-color: var(--BRIEFS-rule);
          appearance: none;
          padding-right: 1.5rem;
          background-image: linear-gradient(45deg, transparent 50%, var(--BRIEFS-ink-soft) 50%),
            linear-gradient(135deg, var(--BRIEFS-ink-soft) 50%, transparent 50%);
          background-position: calc(100% - 0.85rem) 55%, calc(100% - 0.6rem) 55%;
          background-size: 4px 4px, 4px 4px;
          background-repeat: no-repeat;
        }
        .briefs-collection__layout-button[aria-pressed='true'] {
          background: var(--BRIEFS-paper-raised);
          color: var(--BRIEFS-structural);
          border-color: var(--BRIEFS-structural-soft);
        }
        .briefs-collection__new-brief-button {
          font-family: var(--BRIEFS-font-mono);
          font-size: var(--bc-label);
          letter-spacing: 0.06em;
          text-transform: uppercase;
          color: var(--BRIEFS-paper);
          background: var(--BRIEFS-structural);
          border: 1px solid var(--BRIEFS-structural);
          border-radius: var(--bc-radius);
          padding: 0.45rem 0.85rem;
          cursor: pointer;
          margin-left: auto;
          transition: opacity 120ms ease;
        }
        .briefs-collection__new-brief-button:hover {
          opacity: 0.85;
        }

        /* ---- multiselect popover ---- */
        .briefs-multiselect {
          position: relative;
        }
        .briefs-multiselect__trigger {
          display: inline-flex;
          align-items: center;
          gap: 0.35rem;
          font-family: var(--BRIEFS-font-mono);
          font-size: var(--bc-label);
          letter-spacing: 0.06em;
          text-transform: uppercase;
          color: var(--BRIEFS-ink-soft);
          background: transparent;
          border: 1px solid var(--BRIEFS-rule);
          border-radius: var(--bc-radius);
          padding: 0.4rem 0.65rem;
          cursor: pointer;
          transition: background 120ms ease, color 120ms ease, border-color 120ms ease;
        }
        .briefs-multiselect__trigger:hover {
          background: var(--BRIEFS-paper-raised);
          color: var(--BRIEFS-ink);
        }
        .briefs-multiselect__trigger--active {
          color: var(--BRIEFS-structural);
          border-color: var(--BRIEFS-structural-soft);
          background: var(--BRIEFS-paper-raised);
        }
        .briefs-multiselect__chevron {
          font-size: 0.7rem;
          opacity: 0.7;
        }
        .briefs-multiselect__panel {
          position: absolute;
          top: calc(100% + 0.4rem);
          left: 0;
          z-index: 20;
          width: 220px;
          background: var(--BRIEFS-paper-raised);
          border: 1px solid var(--BRIEFS-rule);
          border-radius: var(--bc-radius);
          box-shadow: 0 8px 24px rgba(32, 38, 43, 0.1);
          padding: 0.5rem;
        }
        .briefs-multiselect__search {
          width: 100%;
          font-family: var(--BRIEFS-font-body);
          font-size: 0.85rem;
          color: var(--BRIEFS-ink);
          background: var(--BRIEFS-paper);
          border: 1px solid var(--BRIEFS-rule);
          border-radius: 4px;
          padding: 0.3rem 0.5rem;
          margin-bottom: 0.4rem;
        }
        .briefs-multiselect__search:focus-visible {
          outline: none;
          border-color: var(--BRIEFS-structural);
        }
        .briefs-multiselect__options {
          display: flex;
          flex-direction: column;
          gap: 0.15rem;
          max-height: 220px;
          overflow-y: auto;
        }
        .briefs-multiselect__option {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          font-size: 0.85rem;
          color: var(--BRIEFS-ink);
          padding: 0.3rem 0.35rem;
          border-radius: 4px;
          cursor: pointer;
        }
        .briefs-multiselect__option:hover {
          background: var(--BRIEFS-paper);
        }
        .briefs-multiselect__checkbox {
          accent-color: var(--BRIEFS-structural);
          margin: 0;
        }
        .briefs-multiselect__swatch {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: var(--briefs-multiselect-swatch-color, var(--BRIEFS-ink-soft));
          flex-shrink: 0;
        }
        .briefs-multiselect__option-label {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .briefs-multiselect__empty {
          font-size: 0.8rem;
          font-style: italic;
          color: var(--BRIEFS-ink-soft);
          padding: 0.4rem;
        }

        /* ---- results ---- */
        .briefs-collection__grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
          gap: var(--bc-space-3);
        }
        .briefs-collection__list {
          display: flex;
          flex-direction: column;
        }
        .briefs-collection__list .briefs-collection__card {
          border-radius: 0;
          border-bottom: 1px solid var(--BRIEFS-rule);
          padding: var(--bc-space-2) 0.25rem;
        }
        .briefs-collection__list .briefs-collection__card:last-child {
          border-bottom: none;
        }
        .briefs-collection__card {
          display: flex;
          flex-direction: column;
          gap: 0.4rem;
          text-align: left;
          font-family: var(--BRIEFS-font-body);
          color: var(--BRIEFS-ink);
          background: transparent;
          border: none;
          border-radius: var(--bc-radius);
          padding: var(--bc-space-2);
          cursor: pointer;
          transition: background 140ms ease;
        }
        .briefs-collection__grid .briefs-collection__card {
          background: var(--BRIEFS-paper-raised);
        }
        .briefs-collection__card:hover {
          background: var(--BRIEFS-paper-raised);
        }
        .briefs-collection__card-title {
          font-family: var(--BRIEFS-font-display);
          font-size: 1.05rem;
          font-weight: 500;
          line-height: 1.3;
        }
        .briefs-collection__card-date {
          font-family: var(--BRIEFS-font-mono);
          font-size: 0.7rem;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          color: var(--BRIEFS-ink-soft);
        }
        .briefs-collection__card-snippet {
          font-size: 0.88rem;
          line-height: 1.5;
          color: var(--BRIEFS-ink-soft);
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
        .briefs-collection__card-tags {
          display: flex;
          flex-wrap: wrap;
          gap: 0.6rem;
          margin-top: 0.15rem;
        }
        .briefs-collection__tag-chip {
          display: inline-flex;
          align-items: center;
          gap: 0.3rem;
          font-family: var(--BRIEFS-font-mono);
          font-size: 0.65rem;
          letter-spacing: 0.05em;
          text-transform: uppercase;
          color: var(--BRIEFS-ink-soft);
        }
        .briefs-collection__tag-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: var(--briefs-collection-tag-color, var(--BRIEFS-structural));
        }
        .briefs-collection__empty,
        .briefs-collection__error {
          color: var(--BRIEFS-ink-soft);
          font-style: italic;
          padding: var(--bc-space-4) 0;
          text-align: center;
        }
        .briefs-collection__error {
          color: var(--BRIEFS-accent-todo);
        }

        /* ---- calendar ---- */
        .briefs-collection__calendar-month-label {
          font-family: var(--BRIEFS-font-display);
          font-size: 1.1rem;
          padding-bottom: var(--bc-space-2);
        }
        .briefs-collection__calendar-grid {
          display: grid;
          grid-template-columns: repeat(7, 1fr);
          border-top: 1px solid var(--BRIEFS-rule);
          border-left: 1px solid var(--BRIEFS-rule);
        }
        .briefs-collection__calendar-cell {
          background: var(--BRIEFS-paper);
          border-right: 1px solid var(--BRIEFS-rule);
          border-bottom: 1px solid var(--BRIEFS-rule);
          min-height: 92px;
          padding: 0.4rem;
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
        }
        .briefs-collection__calendar-cell--empty {
          background: var(--BRIEFS-paper-raised);
        }
        .briefs-collection__calendar-day-label {
          font-family: var(--BRIEFS-font-mono);
          font-size: 0.68rem;
          color: var(--BRIEFS-ink-soft);
        }
        .briefs-collection__calendar-entry {
          font-family: var(--BRIEFS-font-body);
          font-size: 0.78rem;
          text-align: left;
          background: none;
          border: none;
          color: var(--BRIEFS-ink);
          cursor: pointer;
          padding: 0;
          line-height: 1.3;
        }
        .briefs-collection__calendar-entry:hover {
          color: var(--BRIEFS-structural);
        }

        /* ---- pagination ---- */
        .briefs-collection__pagination {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: var(--bc-space-3);
          padding-top: var(--bc-space-1);
            padding-bottom: var(--bc-space-4);
        }
        .briefs-collection__page-label {
          font-family: var(--BRIEFS-font-mono);
          font-size: 0.78rem;
          color: var(--BRIEFS-ink-soft);
        }
        .briefs-collection__scroll-sentinel {
          height: 1px;
        }

        /* ---- launcher overlay ---- */
        .briefs-collection__launcher {
          position: fixed;
          inset: 0;
          z-index: 1000;
          display: flex;
        }
        .briefs-collection__launcher-backdrop {
          position: absolute;
          inset: 0;
          background: rgba(32, 38, 43, 0.4);
          backdrop-filter: blur(1.5px);
        }
        .briefs-collection__launcher--popup {
          align-items: center;
          justify-content: center;
          padding: var(--bc-space-3);
        }
        .briefs-collection__launcher--popup .briefs-collection__launcher-editor {
          position: relative;
          width: min(92vw, 720px);
          max-height: 85vh;
          overflow-y: auto;
          background: var(--BRIEFS-paper);
          border-radius: 12px;
          box-shadow: 0 24px 60px rgba(32, 38, 43, 0.22);
          padding: var(--bc-space-4);
        }
        .briefs-collection__launcher--fullscreen .briefs-collection__launcher-editor {
          position: relative;
          width: 100%;
          height: 100%;
          background: var(--BRIEFS-paper);
          overflow-y: auto;
          padding: var(--bc-space-4);
        }
        .briefs-collection__launcher--sidebar {
          justify-content: flex-end;
        }
        .briefs-collection__launcher--sidebar .briefs-collection__launcher-editor {
          position: relative;
          width: 50vw;
          height: 100%;
          background: var(--BRIEFS-paper);
          overflow-y: auto;
          box-shadow: -24px 0 60px rgba(32, 38, 43, 0.16);
          padding: var(--bc-space-4);
        }
        @media (max-width: 640px) {
          .briefs-collection__launcher--sidebar .briefs-collection__launcher-editor {
            width: 100vw;
          }
          .briefs-collection__launcher--popup .briefs-collection__launcher-editor {
            width: 100%;
            max-height: 92vh;
          }
          .briefs-collection__toolbar {
            gap: var(--bc-space-1) var(--bc-space-2);
          }
          .briefs-collection__new-brief-button {
            margin-left: 0;
            flex-basis: 100%;
          }
        }
        .briefs-collection__launcher-controls {
          position: absolute;
          top: 0.6rem;
          right: 0.6rem;
          z-index: 1001;
          display: flex;
          align-items: center;
          gap: 0.4rem;
        }
        .briefs-collection__launcher-close {
          width: 28px;
          height: 28px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          font-family: var(--BRIEFS-font-body);
          font-size: 1.1rem;
          line-height: 1;
          color: var(--BRIEFS-ink-soft);
          background: transparent;
          border: none;
          border-radius: 50%;
          cursor: pointer;
          transition: background 120ms ease, color 120ms ease;
        }
        .briefs-collection__launcher-close:hover {
          background: var(--BRIEFS-paper-raised);
          color: var(--BRIEFS-ink);
        }

        /* ---- single-select dropdown (launch-mode picker) ---- */
        .briefs-dropdown {
          position: relative;
        }
        .briefs-dropdown__trigger {
          display: inline-flex;
          align-items: center;
          gap: 0.35rem;
          font-family: var(--BRIEFS-font-mono);
          font-size: 0.6rem;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          color: var(--BRIEFS-ink-soft);
          background: var(--BRIEFS-paper-raised);
          border: 1px solid var(--BRIEFS-rule);
          border-radius: var(--bc-radius);
          padding: 0.35rem 0.6rem;
          cursor: pointer;
          transition: background 120ms ease, color 120ms ease, border-color 120ms ease;
        }
        .briefs-dropdown__trigger:hover {
          background: var(--BRIEFS-paper);
          color: var(--BRIEFS-ink);
        }
        .briefs-dropdown__chevron {
          font-size: 0.7rem;
          opacity: 0.7;
          transform: translateY(-0.4em);
        }
        .briefs-dropdown__panel {
          position: absolute;
          top: calc(100% + 0.4rem);
          right: 0;
          z-index: 20;
          min-width: 140px;
          background: var(--BRIEFS-paper-raised);
          border: 1px solid var(--BRIEFS-rule);
          border-radius: var(--bc-radius);
          box-shadow: 0 8px 24px rgba(32, 38, 43, 0.1);
          padding: 0.3rem;
          display: flex;
          flex-direction: column;
          gap: 0.1rem;
        }
        .briefs-dropdown__option {
          text-align: left;
          font-family: var(--BRIEFS-font-body);
          font-size: 0.85rem;
          color: var(--BRIEFS-ink);
          background: transparent;
          border: none;
          border-radius: 4px;
          padding: 0.35rem 0.5rem;
          cursor: pointer;
        }
        .briefs-dropdown__option:hover {
          background: var(--BRIEFS-paper);
        }
        .briefs-dropdown__option--selected {
          color: var(--BRIEFS-structural);
          font-weight: 600;
        }
      `;
      this.#head.appendChild(style);
    }
  }
}