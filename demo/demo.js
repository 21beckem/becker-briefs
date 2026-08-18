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

const typeRegistry = TypeRegistry.fromArray([TodoType, ScheduleType]);


const tagRegistry = TagRegistry.fromObject({
  initialTags: [
    new Tag(IdGenerator.generate('tag'), 'math class', '#3A5A6B'),
    new Tag(IdGenerator.generate('tag'), 'devotional', '#6B4C9A'),
  ],
  onCreateTag: (label) =>
    Tag.fromObject({
      id: IdGenerator.generate('tag'),
      label
    })
});



const persistenceAdapter = PersistenceAdapter.fromObject({
  onSave: (pageObject) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(pageObject));
  },
  onLoad: (pageId) => {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw !== null) return JSON.parse(raw);
    return buildSeedPage(pageId).toObject();
  }
});



const container = document.getElementById('briefs-container');
const storedRaw = localStorage.getItem(STORAGE_KEY);
const initialPage = (storedRaw !== null) ? NotePage.fromObject(JSON.parse(storedRaw)) : undefined

BriefsEditor.fromObject({
  container,
  head: document.head,
  typeRegistry,
  tagRegistry,
  persistenceAdapter,
  initialPage
});
