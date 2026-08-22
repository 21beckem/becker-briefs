import { QueryResponse } from './QueryResponse.js';
import { assert } from '../utils/assert.js';

export class Query {
  // static get sortFields() {
  //   return Object.freeze({
  //     CREATED: 'created',
  //     MODIFIED: 'modified'
  //   });
  // }

  static get sortDirections() {
    return Object.freeze({
      ASC: 'asc',
      DESC: 'desc'
    });
  }

  #text;
  #tagIds;
  #typeIds;
  #pageIndex;
  #pageLength;
  // #sortBy;
  #sortDirection;

  constructor(text, tagIds, typeIds, pageIndex, pageLength, /* sortBy, */ sortDirection) {
    this.text = text;
    this.tagIds = tagIds;
    this.typeIds = typeIds;
    this.pageIndex = pageIndex;
    this.pageLength = pageLength;
    // this.sortBy = sortBy;
    this.sortDirection = sortDirection;
  }

  get text() {
    return this.#text;
  }

  set text(value) {
    assert.string(value, 'text');
    this.#text = value;
  }

  get tagIds() {
    return [...this.#tagIds];
  }

  set tagIds(value) {
    assert.arrayOfStrings(value, 'tagIds');
    this.#tagIds = [...value];
  }

  get typeIds() {
    return [...this.#typeIds];
  }

  set typeIds(value) {
    assert.arrayOfStrings(value, 'typeIds');
    this.#typeIds = [...value];
  }

  get pageIndex() {
    return this.#pageIndex;
  }

  set pageIndex(value) {
    assert.integerInRange(value, 'pageIndex', 0, Number.MAX_SAFE_INTEGER);
    this.#pageIndex = value;
  }

  get pageLength() {
    return this.#pageLength;
  }

  set pageLength(value) {
    assert.integerInRange(value, 'pageLength', 1, Number.MAX_SAFE_INTEGER);
    this.#pageLength = value;
  }

  // get sortBy() {
  //   return this.#sortBy;
  // }

  // set sortBy(value) {
  //   if (!Object.values(Query.sortFields).includes(value))
  //     throw new TypeError(`sortBy must be one of: ${Object.values(Query.sortFields).join(', ')}.`);
  //   this.#sortBy = value;
  // }

  get sortDirection() {
    return this.#sortDirection;
  }

  set sortDirection(value) {
    if (!Object.values(Query.sortDirections).includes(value))
      throw new TypeError(`sortDirection must be one of: ${Object.values(Query.sortDirections).join(', ')}.`);
    this.#sortDirection = value;
  }

  clone() {
    return new Query(
      this.#text,
      this.tagIds,
      this.typeIds,
      this.#pageIndex,
      this.#pageLength,
      // this.#sortBy,
      this.#sortDirection
    );
  }

  toObject() {
    return {
      text: this.#text,
      tagIds: this.tagIds,
      typeIds: this.typeIds,
      pageIndex: this.#pageIndex,
      pageLength: this.#pageLength,
      // sortBy: this.#sortBy,
      sortDirection: this.#sortDirection
    };
  }

  toSearchParams() {
    const params = new URLSearchParams();
    if (this.#text.length > 0) params.set('q', this.#text);
    if (this.#tagIds.length > 0) params.set('tags', this.#tagIds.join(','));
    if (this.#typeIds.length > 0) params.set('types', this.#typeIds.join(','));
    if (this.#pageIndex !== 0) params.set('pageIndex', String(this.#pageIndex));
    if (this.#pageLength !== 20) params.set('pageLength', String(this.#pageLength));
    // if (this.#sortBy !== Query.sortFields.MODIFIED) params.set('sortBy', this.#sortBy);
    if (this.#sortDirection !== Query.sortDirections.DESC) params.set('sortDirection', this.#sortDirection);
    return params;
  }

  static blank() {
    return new Query(
      '', // text
      [], // tagIds
      [], // typeIds
      0,  // pageIndex
      20, // pageLength
      // Query.sortFields.MODIFIED, // sortBy
      Query.sortDirections.DESC  // sortDirection
    );
  }

  static fromObject(obj) {
    if (typeof obj !== 'object' || obj === null) throw new TypeError('fromObject expects an object.');
    const fallback = Query.blank();
    return new Query(
      obj.text === undefined ? fallback.text : obj.text,
      obj.tagIds === undefined ? fallback.tagIds : obj.tagIds,
      obj.typeIds === undefined ? fallback.typeIds : obj.typeIds,
      obj.pageIndex === undefined ? fallback.pageIndex : obj.pageIndex,
      obj.pageLength === undefined ? fallback.pageLength : obj.pageLength,
      // obj.sortBy === undefined ? fallback.sortBy : obj.sortBy,
      obj.sortDirection === undefined ? fallback.sortDirection : obj.sortDirection
    );
  }

  static fromWindowSearchParams(searchParams) {
    const params = searchParams === undefined ? new URLSearchParams(window.location.search) : searchParams;
    if (!(params instanceof URLSearchParams)) {
      throw new TypeError('searchParams must be a URLSearchParams instance.');
    }
    const fallback = Query.blank();
    const pageIndexRaw = params.get('pageIndex');
    const pageLengthRaw = params.get('pageLength');
    return new Query(
      params.get('q') ?? fallback.text,
      params.has('tags') ? params.get('tags').split(',').filter((id) => id.length > 0) : fallback.tagIds,
      params.has('types') ? params.get('types').split(',').filter((id) => id.length > 0) : fallback.typeIds,
      pageIndexRaw !== null ? Number.parseInt(pageIndexRaw, 10) : fallback.pageIndex,
      pageLengthRaw !== null ? Number.parseInt(pageLengthRaw, 10) : fallback.pageLength,
      // params.get('sortBy') ?? fallback.sortBy,
      params.get('sortDirection') ?? fallback.sortDirection
    );
  }

  static responseFromObject(obj) {
    return QueryResponse.fromObject(obj);
  }
}