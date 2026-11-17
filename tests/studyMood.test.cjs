const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const source = fs.readFileSync(path.join(__dirname, '../lib/studyMood.ts'), 'utf8');
const javascript = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const loadedModule = { exports: {} };
new Function('exports', 'require', 'module', javascript)(loadedModule.exports, require, loadedModule);
const { parseStudyUnits, distributeStudyUnits } = loadedModule.exports;

test('parses page ranges and counts the difference between endpoints', () => {
  const units = parseStudyUnits(['من صفحة ١٠ إلى صفحة ٢٠']);
  assert.equal(units[0].kind, 'pages');
  assert.equal(units[0].units, 10);
  assert.equal(units[0].startPage, 10);
});

test('parses Arabic page shorthand and explicit page totals', () => {
  const units = parseStudyUnits(['من ص ٣٠ لحد ص ٤٥', '١٢ صفحات']);
  assert.equal(units[0].units, 15);
  assert.equal(units[1].units, 12);
});

test('treats ordinary syllabus lines as topics', () => {
  const units = parseStudyUnits(['نظرية العقد', 'أركان المسؤولية التقصيرية']);
  assert.deepEqual(units.map((item) => item.kind), ['topic', 'topic']);
  assert.equal(units.length, 2);
});

test('splits page ranges across dates without losing the page count', () => {
  const sourceUnits = parseStudyUnits(['من ص ١٠ إلى ص ٢٠']);
  const entries = distributeStudyUnits(sourceUnits, ['2026-11-17', '2026-11-18']);
  assert.deepEqual(entries.map((entry) => entry.units), [5, 5]);
  assert.deepEqual(entries.map((entry) => [entry.fromPage, entry.toPage]), [[10, 15], [15, 20]]);
});
