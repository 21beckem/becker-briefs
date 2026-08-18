import { BriefsEditor } from '../BriefsEditor.js';
import { NotePage } from '../models/NotePage.js';
import { HeadingBlock } from '../models/HeadingBlock.js';
import { Bullet } from '../models/Bullet.js';
import { RichText } from '../models/RichText.js';
import { Tag } from '../models/Tag.js';
import { TypeInstance } from '../models/TypeInstance.js';
import { TypeRegistry } from '../registries/TypeRegistry.js';
import { TagRegistry } from '../registries/TagRegistry.js';
import { PersistenceAdapter } from '../persistence/PersistenceAdapter.js';
import { IdGenerator } from '../utils/IdGenerator.js';
import { TodoType } from './TodoType.js';
import { ScheduleType } from './ScheduleType.js';

const STORAGE_KEY = 'briefs-demo:page';

// -----------------------------------------------------------------
// 1. The host app defines its own functional types. briefs ships
//    with none built in -- TodoType is entirely demo-owned.
// -----------------------------------------------------------------
const typeRegistry = new TypeRegistry([new TodoType(), new ScheduleType()]);

// -----------------------------------------------------------------
// 2. The host app owns tag creation. Here it just mints a Tag with a
//    generated id; a real host might hit its own API instead.
// -----------------------------------------------------------------
const initialTags = [
  new Tag(IdGenerator.generate('tag'), 'math class', '#3A5A6B'),
  new Tag(IdGenerator.generate('tag'), 'devotional', '#6B4C9A'),
];
const tagRegistry = new TagRegistry(initialTags, (label) => {
  return new Tag(IdGenerator.generate('tag'), label, null);
});

// -----------------------------------------------------------------
// 3. The host app owns persistence entirely. This demo just uses
//    localStorage, but briefs itself never knows that -- swapping
//    this for a network call later requires no change inside the
//    briefs module.
// -----------------------------------------------------------------
const persistenceAdapter = new PersistenceAdapter(
  (pageObject) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(pageObject));
  },
  (pageId) => {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw !== null) return JSON.parse(raw);
    return buildSeedPage(pageId).toObject();
  }
);

// /**
//  * @param {string} id
//  * @returns {NotePage}
//  */
// function buildSeedPage(id) {
//   const mathTag = initialTags[0];
//   const devotionalTag = initialTags[1];

//   const heading = new HeadingBlock(
//     IdGenerator.generate('block'),
//     1,
//     RichText.plain('Chapter 4')
//   );

//   const todoBullet = new Bullet(
//     IdGenerator.generate('bullet'),
//     RichText.plain('Do math homework'),
//     new TypeInstance('todo', { completed: false, dueDate: null }),
//     [mathTag],
//     [],
//     false
//   );

//   const completedTodo = new Bullet(
//     IdGenerator.generate('bullet'),
//     RichText.plain('Read chapter 4'),
//     new TypeInstance('todo', { completed: true, dueDate: null }),
//     [devotionalTag],
//     [],
//     false
//   );

//   const childBullet = new Bullet(
//     IdGenerator.generate('bullet'),
//     RichText.plain('Problems 12-20, show work'),
//     null,
//     [],
//     [],
//     false
//   );

//   const parentBullet = new Bullet(
//     IdGenerator.generate('bullet'),
//     RichText.plain('Chapter 4 assignment'),
//     null,
//     [mathTag],
//     [childBullet],
//     false
//   );

//   const plainBullet = new Bullet(
//     IdGenerator.generate('bullet'),
//     RichText.plain('Try typing /todo or #tag anywhere on this line'),
//     null,
//     [],
//     [],
//     false
//   );

//   return new NotePage(id, 'Saturday notes', new Date(), [mathTag], [
//     heading,
//     todoBullet,
//     completedTodo,
//     parentBullet,
//     plainBullet,
//   ]);
// }

// -----------------------------------------------------------------
// 4. Mount the self-contained editor into a plain container element.
//    On startup, use any already-persisted page if one exists, so a
//    reload picks up where the user left off; otherwise seed it.
// -----------------------------------------------------------------
const container = document.getElementById('briefs-container');
const storedRaw = localStorage.getItem(STORAGE_KEY);
const initialPage =
  storedRaw !== null ? NotePage.fromObject(JSON.parse(storedRaw)) : undefined

BriefsEditor.fromObject({
  container,
  head: document.head,
  typeRegistry,
  tagRegistry,
  persistenceAdapter,
  initialPage: initialPage ?? undefined
});
