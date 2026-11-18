import assert from 'node:assert/strict';
import { writeFile, mkdir } from 'node:fs/promises';
import {
  createStarterProject, createEmptyProject, createPage, createBlock, normalizeProject,
  renderDocument, buildSite, buildSitePackage, serializeProject, deserializeProject, createZip,
} from '../outputs/plot-studio/project.mjs';
import { compileGraph, createStarterGraph } from '../outputs/plot-studio/logic.mjs';

const sample = createStarterProject();
sample.graph = createStarterGraph(sample);
const compiled = compileGraph(sample.graph, sample);
assert.equal(compiled.diagnostics.filter(item => item.severity === 'error').length, 0);
assert.equal(sample.pages[0].id, 'page-home');
assert.equal(sample.pages[0].blocks[1].props.image, './assets/prog.webp');
assert.deepEqual(deserializeProject(serializeProject(sample)), sample);
const original = createEmptyProject();
original.pages.push(createPage('About'));
original.pages[0].blocks.push(createBlock('heading', { id:'headline', props:{ text:'A working <script> test' }, style:{fontSize:44}, styles:{ mobile:{ fontSize:'28px' }, tablet:{ fontSize:36 } } }));
original.pages[0].blocks.push(createBlock('button', { id:'bad-url', props:{href:'javascript:alert(1)'} }));
original.pages[0].blocks.push(createBlock('button', { id:'internal', props:{href:'page:' + original.pages[1].id} }));
const html = renderDocument(original.pages[0],original,'window.demo = 1;',{preview:true});
assert.match(html,/lang="en"/);
assert.match(html,/font-size:44px/);
assert.match(html,/@media\(max-width:1023px\)[\s\S]+font-size:36px/);
assert.match(html,/@media\(max-width:767px\)[\s\S]+font-size:28px/);
assert.match(html,/working &lt;script&gt; test/);
assert.doesNotMatch(html,/javascript:alert/);
assert.match(html,/href="about.html"/);
const files = buildSite(sample, compiled.code);
assert.deepEqual(Object.keys(files), ['index.html','projects.html','studio.html','contact.html','styles.css','script.js']);
assert.match(files['index.html'],/href="projects.html"/);
const packageFiles = await buildSitePackage(sample,compiled.code,{
  baseUrl:'https://sample.invalid/studio/project.mjs',
  fetcher: async url => {
    assert.equal(url.href,'https://sample.invalid/studio/assets/prog.webp');
    return new Response(new Uint8Array([17,19,21]));
  },
});
assert.deepEqual(packageFiles['assets/prog.webp'],new Uint8Array([17,19,21]));
const dir = new URL('./project-check/',import.meta.url);
await mkdir(dir,{recursive:true});
await writeFile(new URL('preview.html',dir),renderDocument(sample.pages[0],sample,compiled.code));
await writeFile(new URL('out.zip',dir),createZip(packageFiles));
console.log('Round trip, starter graph compilation, route rendering, styles, and ZIP data check passed.');
