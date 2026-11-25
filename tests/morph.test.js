import assert from 'node:assert/strict';
import { test } from 'node:test';
import { installDom } from './helpers/dom.js';

installDom('<!doctype html><div id="root"></div>');
const { morph } = await import('../src/shared/dom/morph.js');
const root = document.getElementById('root');
const keys = () => [...root.children].map((el) => el.dataset.key);

test('keyed children keep their identity across reorder, insert and removal', () => {
  morph(root, '<p data-key="a">A</p><p data-key="b">B</p><p data-key="c">C</p>');
  const [a, b, c] = root.children;
  morph(root, '<p data-key="c">C</p><p data-key="x">X</p><p data-key="a">A2</p>');
  assert.deepEqual(keys(), ['c', 'x', 'a']);
  assert.equal(root.children[0], c, 'c was moved, not recreated');
  assert.equal(root.children[2], a);
  assert.equal(a.textContent, 'A2');
  assert.equal(b.isConnected, false);
});

test('attributes and text are patched in place', () => {
  morph(root, '<div data-key="row" class="row" title="old"><img src="https://x.example/i.png"><span>one</span></div>');
  const row = root.firstElementChild;
  const img = row.querySelector('img');
  morph(root, '<div data-key="row" class="row active"><img src="https://x.example/i.png"><span>two</span></div>');
  assert.equal(root.firstElementChild, row);
  assert.equal(row.className, 'row active');
  assert.equal(row.hasAttribute('title'), false);
  assert.equal(row.querySelector('img'), img, 'unchanged image is not reloaded');
  assert.equal(row.querySelector('span').textContent, 'two');
});

test('a focused input keeps what the user typed', () => {
  morph(root, '<input data-key="q" value="">');
  const input = root.querySelector('input');
  input.focus();
  input.value = 'typed';
  morph(root, '<input data-key="q" value=""><p>below</p>');
  assert.equal(root.querySelector('input'), input);
  assert.equal(input.value, 'typed');
  assert.equal(document.activeElement, input);
});

test('unkeyed siblings are matched by position and kind', () => {
  morph(root, '<h2>Title</h2><ul><li>1</li><li>2</li></ul>');
  const list = root.querySelector('ul');
  morph(root, '<h2>Title</h2><ul><li>1</li></ul><footer>f</footer>');
  assert.equal(root.querySelector('ul'), list);
  assert.equal(list.children.length, 1);
  assert.equal(root.lastElementChild.tagName, 'FOOTER');
  morph(root, '');
  assert.equal(root.childNodes.length, 0);
});

test('hooks: enter fires for insertions into rendered parents; leave defers removal', async () => {
  morph(root, '');
  const entered = [];
  let finish;
  const hooks = {
    enter: (el) => void entered.push(el.dataset.key),
    leave: (el) => (el.dataset.key === 'b' ? new Promise((resolve) => (finish = resolve)) : null),
  };
  morph(root, '<p data-key="a">A</p><p data-key="b">B</p>', hooks);
  assert.deepEqual(entered, [], 'the first render of a parent does not animate');
  morph(root, '<p data-key="a">A</p><p data-key="c">C</p>', hooks);
  assert.deepEqual(entered, ['c']);
  const leaving = root.querySelector('[data-leaving]');
  assert.equal(leaving.textContent, 'B', 'the leaving element stays until its animation settles');
  morph(root, '<p data-key="c">C</p><p data-key="a">A</p>', hooks);
  assert.deepEqual([...root.children].filter((el) => !el.hasAttribute('data-leaving')).map((el) => el.dataset.key), ['c', 'a']);
  assert.ok(leaving.isConnected, 'later patches ignore leaving elements');
  finish();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(leaving.isConnected, false);
});
