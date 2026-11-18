import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { builderV2Brief, builderV2Starter, gradeBuilderV2 } from '../outputs/plot-studio/exam-builder-v2.mjs';
import { createExamBrowserEvaluator } from '../outputs/plot-studio/exam-browser.mjs';
import { compileGraph } from '../outputs/plot-studio/logic.mjs';
import { deserializeProject, serializeProject } from '../outputs/plot-studio/project.mjs';
import { builderFixture } from './builder-v2-fixture.mjs';

const chrome = process.env.PLOT_EXAM_BROWSER ||
  join(process.env.LOCALAPPDATA, 'ms-playwright', 'chromium_headless_shell-1248', 'chrome-headless-shell-win64', 'chrome-headless-shell.exe');
const evaluate = createExamBrowserEvaluator({ browser: chrome });
const evaluateCapturing = async input => {
  const outcome = await evaluate(input);
  await writeFile('work/builder-v2-probe-result.json', JSON.stringify(outcome, null, 2));
  return outcome;
};
const project = deserializeProject(serializeProject(builderFixture()));
assert.equal(builderV2Brief.tasks.length, 24);
assert.equal(new Set(builderV2Brief.tasks.map(([name]) => name)).size, 24);
assert.deepEqual(builderV2Brief.sections.map(section => section.count), [6, 6, 6, 6]);
const compiled = compileGraph(project.graph, project);
assert.deepEqual(compiled.diagnostics.filter(issue => issue.severity === 'error'), []);
const starter = await gradeBuilderV2(builderV2Starter());
assert.equal(starter.passed, false);
assert.equal(starter.maxScore, starter.checks.reduce((sum, item) => sum + item.points, 0));
assert.equal(starter.score, 0);
await writeFile('work/northline-builder-v2-test.plot', serializeProject(project));
const result = await gradeBuilderV2(project, null, evaluateCapturing);
console.log(`Positive: ${result.score}/${result.maxScore}; pass ${result.passed}; failed checks ${result.checks.filter(item => !item.passed).map(item => item.id).join(', ')}`);
assert.equal(result.passed, true);
assert.equal(result.score, 100);

if (process.argv.includes('--negative')) {
  const weakened = structuredClone(project);
  weakened.data.tables[0].permissions.read = true;
  const multiply = weakened.graph.nodes.find(node => node.id === 'hire-charge');
  multiply.type = 'add-numbers';
  const allowRepeats = weakened.graph.nodes.find(node => node.id === 'no-immediate-repeat');
  allowRepeats.config.interval = 0;
  const invalid = await gradeBuilderV2(weakened, null, evaluate);
  const outcomes = new Map(invalid.checks.map(item => [item.id, item.passed]));
  assert.equal(invalid.passed, false);
  for (const check of ['data-privacy', 'hire-estimate', 'record-mapping', 'repeat-guard']) assert.equal(outcomes.get(check), false, check);
  for (const check of ['structure', 'responsive', 'media', 'rules']) assert.equal(outcomes.get(check), true, check);
  console.log(`Negative: ${invalid.score}/100; wrong arithmetic, public read and duplicate writes rejected.`);
}
