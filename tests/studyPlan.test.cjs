const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const source = fs.readFileSync(path.join(__dirname, '../lib/studyPlan.ts'), 'utf8');
const javascript = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const loadedModule = { exports: {} };
new Function('exports', 'require', 'module', javascript)(
  loadedModule.exports, require, loadedModule,
);
const { buildStudyPlan } = loadedModule.exports;

const at = (date) => date + 'T10:00:00.000Z';
const noRest = { restDays: [], includeFriday: true };

test('reserves the day before the exam and excludes the exam day', () => {
  const result = buildStudyPlan('2026-11-16', [
    { id: 'civil', name: 'مدني', examAtIso: at('2026-11-19'), remainingTopics: 2 },
  ], noRest);
  assert.ok(result.days.some((day) => day.date === '2026-11-18' &&
    day.items.some((item) => item.kind === 'final-review')));
  assert.ok(!result.days.some((day) => day.date === '2026-11-19'));
});

test('never assigns a subject after its exam date', () => {
  const result = buildStudyPlan('2026-11-16', [
    { id: 'near', name: 'قريب', examAtIso: at('2026-11-18'), remainingTopics: 1 },
    { id: 'far', name: 'بعيد', examAtIso: at('2026-11-22'), remainingTopics: 3 },
  ], noRest);
  for (const day of result.days) {
    for (const item of day.items) {
      if (item.subjectId === 'near') assert.ok(day.date < '2026-11-18');
    }
  }
});

test('keeps subjects without an exam date outside the calculation', () => {
  const result = buildStudyPlan('2026-11-16', [
    { id: 'undated', name: 'مادة مؤجلة', examAtIso: null, remainingTopics: 12 },
    { id: 'dated', name: 'مادة بموعد', examAtIso: at('2026-11-20'), remainingTopics: 2 },
  ], noRest);
  assert.deepEqual(result.undatedSubjects, [{ id: 'undated', name: 'مادة مؤجلة' }]);
  assert.equal(result.totalRemainingTopics, 2);
});

test('weekly rest days are excluded but final-review days remain reserved', () => {
  const result = buildStudyPlan('2026-11-16', [
    { id: 'exam', name: 'امتحان', examAtIso: at('2026-11-21'), remainingTopics: 1 },
  ], { restDays: [3], includeFriday: false });
  assert.ok(!result.days.some((day) => day.date === '2026-11-18'));
  assert.ok(result.days.some((day) => day.date === '2026-11-20' &&
    day.items.some((item) => item.kind === 'final-review')));
  assert.ok(!result.days.some((day) => day.date === '2026-11-20' &&
    day.items.some((item) => item.kind === 'study')));
});

test('materials with no topics remaining are assigned review only', () => {
  const result = buildStudyPlan('2026-11-16', [
    { id: 'done', name: 'مادة خلصت', examAtIso: at('2026-11-20'), remainingTopics: 0 },
  ], noRest);
  assert.ok(result.days.some((day) => day.items.some((item) => item.kind === 'review')));
});

test('reports insufficient study days when remaining topics exceed assigned days', () => {
  const result = buildStudyPlan('2026-11-16', [
    { id: 'tight', name: 'مادة وقتها ضيق', examAtIso: at('2026-11-18'), remainingTopics: 6 },
  ], noRest);
  assert.equal(result.insufficientDays, true);
});


test('excludes a subject exam happening today from all study slots', () => {
  const result = buildStudyPlan('2026-11-16', [
    { id: 'today', name: 'امتحان اليوم', examAtIso: at('2026-11-16'), remainingTopics: 2 },
    { id: 'later', name: 'امتحان لاحق', examAtIso: at('2026-11-19'), remainingTopics: 2 },
  ], noRest);
  assert.deepEqual(result.examToday, [{ id: 'today', name: 'امتحان اليوم' }]);
  assert.ok(!result.days.some((day) => day.date === '2026-11-16'));
});

test('reports a conflict when a final-review date is another subject exam day', () => {
  const result = buildStudyPlan('2026-11-16', [
    { id: 'first', name: 'امتحان أول', examAtIso: at('2026-11-19'), remainingTopics: 1 },
    { id: 'second', name: 'امتحان تاني', examAtIso: at('2026-11-20'), remainingTopics: 2 },
  ], noRest);
  assert.equal(result.reviewConflicts.length, 1);
  assert.equal(result.reviewConflicts[0].subjectId, 'second');
  assert.equal(result.reviewConflicts[0].reviewDate, '2026-11-19');
  assert.equal(result.insufficientDays, true);
});


test('respects Friday as a chosen weekly rest day even when Friday is enabled', () => {
  const result = buildStudyPlan('2026-11-16', [
    { id: 'exam', name: 'امتحان', examAtIso: at('2026-11-25'), remainingTopics: 2 },
  ], { restDays: [5], includeFriday: true });
  assert.ok(!result.days.some((day) =>
    day.date === '2026-11-20' && day.items.some((item) => item.kind === 'study')));
});
