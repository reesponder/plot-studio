import assert from 'node:assert/strict';
import { createBlock, createEmptyProject } from '../outputs/plot-studio/project.mjs';
import { createExamBrowserEvaluator } from '../outputs/plot-studio/exam-browser.mjs';

const project = createEmptyProject('Assessment browser smoke');
project.pages[0].blocks.push(createBlock('heading', { id: 'headline', props: { text: 'Welcome', tag: 'h1' } }));
project.pages[0].blocks.push(createBlock('input', { id: 'fixture-input', props: { name: 'days', label: 'Days', type: 'number' } }));
project.pages[0].blocks.push(createBlock('button', { id: 'next-page', props: { text: 'Read Help', href: 'help.html' } }));
project.pages.push({
  id: 'help-page', name: 'Help', slug: 'help',
  blocks: [createBlock('heading', { id: 'help-heading', props: { text: 'Help page', tag: 'h1' } })],
});
const input = { project, probes: [{ id: 'simple', page: 'index', width: 390, steps: [
  { type: 'fill', selector: 'input', value: 5 },
  { type: 'snapshot', key: 'start', selectors: { h1:'h1', field:'input' } },
  { type: 'click', selector: '[data-block-id="next-page"]' },
  { type: 'wait', ms: 160 },
  { type: 'snapshot', key: 'linked', selectors: { h1:'h1' } },
] }] };
const results = await createExamBrowserEvaluator()(input);
assert.deepEqual(results.simple.snapshots.start.selectors.h1.text,'Welcome');
assert.equal(results.simple.snapshots.start.selectors.field.value,'5');
assert.equal(results.simple.snapshots.start.width,390);
assert.equal(results.simple.snapshots.linked.path,'/help.html');
assert.equal(results.simple.snapshots.linked.selectors.h1.text,'Help page');
console.log('Browser assay passed: candidate HTML rendered, form value observed, real click navigated to local target.');
