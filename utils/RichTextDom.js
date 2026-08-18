import { assert } from './assert.js';
import { RichText } from '../models/RichText.js';
import { TextRun } from '../models/TextRun.js';

/**
 * RichTextDom
 *
 * Converts between a RichText model instance and the contents of a
 * contenteditable DOM node. Kept as its own class (rather than free
 * functions) so it can validate its inputs the same way every other
 * class in this module does.
 */
export class RichTextDom {
  /**
   * Reads the current contents of a contenteditable node and produces
   * a RichText model from it. Only bold, italic, and link formatting
   * are recognized; anything else is treated as plain text.
   * @param {HTMLElement} node
   * @returns {RichText}
   */
  static toRichText(node) {
    assert.htmlElement(node, 'node');
    const runs = [];
    const walk = (domNode, bold, italic, link) => {
      if (domNode.nodeType === Node.TEXT_NODE) {
        if (domNode.textContent.length > 0)
          runs.push(new TextRun(domNode.textContent, bold, italic, link));
        return;
      }
      if (domNode.nodeType !== Node.ELEMENT_NODE) return;
      const tag = domNode.tagName.toLowerCase();
      const nextBold = bold || tag === 'b' || tag === 'strong';
      const nextItalic = italic || tag === 'i' || tag === 'em';
      const nextLink = tag === 'a' ? domNode.getAttribute('href') ?? link : link;
      if (tag === 'br') {
        runs.push(new TextRun('\n', bold, italic, link));
        return;
      }
      domNode.childNodes.forEach((child) =>
        walk(child, nextBold, nextItalic, nextLink)
      );
    };
    node.childNodes.forEach((child) => walk(child, false, false, null));
    if (runs.length === 0) return RichText.plain('');
    return new RichText(runs);
  }

  /**
   * Renders a RichText model into a contenteditable node's contents.
   * @param {HTMLElement} node
   * @param {RichText} richText
   */
  static applyToNode(node, richText) {
    assert.htmlElement(node, 'node');
    assert.instanceOf(richText, RichText, 'richText');
    node.textContent = '';
    for (const run of richText.runs) {
      let wrapper = document.createTextNode(run.text);
      let host = wrapper;
      if (run.bold) {
        const strong = document.createElement('strong');
        strong.appendChild(host);
        host = strong;
      }
      if (run.italic) {
        const em = document.createElement('em');
        em.appendChild(host);
        host = em;
      }
      if (run.link !== null) {
        const anchor = document.createElement('a');
        anchor.setAttribute('href', run.link);
        anchor.appendChild(host);
        host = anchor;
      }
      node.appendChild(host);
    }
  }
}
