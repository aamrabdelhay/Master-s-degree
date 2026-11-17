const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const source = fs.readFileSync(path.join(__dirname, '../lib/subjectOrder.ts'), 'utf8');
const javascript = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const loadedModule = { exports: {} };
new Function('exports', 'require', 'module', javascript)(loadedModule.exports, require, loadedModule);
const { sortPublicSubjectsByExam } = loadedModule.exports;

test('puts upcoming exams first in chronological order', () => {
  const subjects = [
    { id: 'later', examAtIso: '2030-01-03T10:00:00.000Z' },
    { id: 'soon', examAtIso: '2030-01-01T10:00:00.000Z' },
  ];
  const sorted = sortPublicSubjectsByExam(subjects, Date.parse('2029-12-01T00:00:00.000Z'));
  assert.deepEqual(sorted.map((subject) => subject.id), ['soon', 'later']);
});

test('moves finished subjects to the bottom while keeping undated subjects before them', () => {
  const subjects = [
    { id: 'finished-old', examAtIso: '2020-01-01T10:00:00.000Z' },
    { id: 'undated', examAtIso: null },
    { id: 'upcoming', examAtIso: '2030-01-01T10:00:00.000Z' },
    { id: 'finished-new', examAtIso: '2025-01-01T10:00:00.000Z' },
  ];
  const sorted = sortPublicSubjectsByExam(subjects, Date.parse('2026-01-01T00:00:00.000Z'));
  assert.deepEqual(sorted.map((subject) => subject.id), [
    'upcoming', 'undated', 'finished-new', 'finished-old',
  ]);
});

test('keeps a subject with an invalid exam date visible in the undated group', () => {
  const subjects = [
    { id: 'invalid', examAtIso: 'not-a-date' },
    { id: 'past', examAtIso: '2020-01-01T00:00:00.000Z' },
  ];
  const sorted = sortPublicSubjectsByExam(subjects, Date.parse('2026-01-01T00:00:00.000Z'));
  assert.deepEqual(sorted.map((subject) => subject.id), ['invalid', 'past']);
});
