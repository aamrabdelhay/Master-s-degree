export type StudyUnitKind = 'pages' | 'topic';
export type ParsedStudyUnit = { id: string; title: string; kind: StudyUnitKind; units: number; startPage?: number; };
export type StudyMode = 'one-day' | 'three-days' | 'week' | 'until-exam';
export type StudyScheduleEntry = { id: string; date: string; title: string; kind: StudyUnitKind; units: number; minutes: number; completed: boolean; fromPage?: number; toPage?: number; };
export type StoredSubjectPlan = { mode: StudyMode; selectedDays: number[]; customPages: number | null; calendarDates: string[]; entries: StudyScheduleEntry[]; totalUnits: number; totalMinutes: number; createdAt: string; };

function normalizeDigits(value: string): string {
  return value.replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (digit) => String(digit.charCodeAt(0) - 0x06f0));
}
function cleanLine(value: string): string {
  return normalizeDigits(value).trim().replace(/^(?:[-*•▪◦‣]+)\s*/, '')
    .replace(/^(?:\d+)\s*[.)、:-]\s*/u, '').trim();
}

/** A range from page 10 to page 20 is treated as 10 pages, as requested. */
export function parseStudyUnits(lines: string[]): ParsedStudyUnit[] {
  const result: ParsedStudyUnit[] = [];
  lines.forEach((raw, index) => {
    const line = cleanLine(raw);
    if (!line) return;
    const range = /(?:من\s*)?(?:(?:صفحة|صفحات|صفحه|ص|page|pages)\s*)?(\d+)\s*(?:إلى|الى|حتى|لحد|[-–—])\s*(?:(?:صفحة|صفحات|صفحه|ص|page|pages)\s*)?(\d+)(?:\s*(?:صفحة|صفحات|صفحه|ص|page|pages))?/i.exec(line);
    const hasPageMarker = /صفحة|صفحات|صفحه|ص\s*|page/i.test(line);
    const isPlainRange = /^\s*\d+\s*(?:-|–|—|إلى|الى|حتى|لحد)\s*\d+\s*$/.test(line);
    if (range && (hasPageMarker || /^من\s*/.test(line) || isPlainRange)) {
      const first = Number(range[1]);
      const last = Number(range[2]);
      const units = Math.max(1, Math.min(10000, Math.abs(last - first)));
      result.push({ id: 'range-' + index, title: 'من صفحة ' + Math.min(first, last) + ' إلى صفحة ' + (Math.min(first, last) + units), kind: 'pages', units, startPage: Math.min(first, last) });
      return;
    }
    const explicitCount =
      /(?:عدد\s*الصفحات|الصفحات|صفحات|صفحة|صفحه|pages?)\s*[:=]?\s*(\d+)/i.exec(line) ||
      /(\d+)\s*(?:صفحة|صفحات|صفحه|ورقة|ورقات|pages?)/i.exec(line);
    if (explicitCount) {
      const units = Math.max(1, Math.min(10000, Number(explicitCount[1])));
      result.push({ id: 'pages-' + index, title: line, kind: 'pages', units });
      return;
    }
    const singlePage = /^(?:صفحة|صفحه|ص|page)\s*(\d+)$/i.exec(line);
    if (singlePage) {
      result.push({ id: 'single-page-' + index, title: 'صفحة ' + singlePage[1], kind: 'pages', units: 1, startPage: Number(singlePage[1]) });
      return;
    }
    result.push({ id: 'topic-' + index, title: line, kind: 'topic', units: 1 });
  });
  return result;
}

export function estimateStudyMinutes(kind: StudyUnitKind, units: number): number {
  return Math.max(1, Math.round(units * (kind === 'pages' ? 3 : 20)));
}

export function distributeStudyUnits(units: ParsedStudyUnit[], dates: string[]): StudyScheduleEntry[] {
  const totalUnits = units.reduce((sum, unit) => sum + unit.units, 0);
  if (totalUnits <= 0 || dates.length === 0) return [];
  const targets = dates.map((_, index) => Math.floor(totalUnits / dates.length) + (index < totalUnits % dates.length ? 1 : 0));
  const entries: StudyScheduleEntry[] = [];
  let unitIndex = 0;
  let unitOffset = 0;
  dates.forEach((date, dayIndex) => {
    let quota = targets[dayIndex];
    while (quota > 0 && unitIndex < units.length) {
      const source = units[unitIndex];
      const take = Math.min(quota, source.units - unitOffset);
      const fromPage = source.startPage === undefined ? undefined : source.startPage + unitOffset;
      const toPage = fromPage === undefined ? undefined : fromPage + take;
      let title = source.title;
      if (source.kind === 'pages') {
        if (fromPage !== undefined && toPage !== undefined) title = 'من ص ' + fromPage + ' إلى ص ' + toPage + ' (' + take + ' صفحات)';
        else if (take !== source.units) title = take + ' صفحات من: ' + source.title;
        else title = source.title + ' (' + take + ' صفحة)';
      }
      entries.push({
        id: source.id + '-' + date + '-' + unitOffset, date, title, kind: source.kind,
        units: take, minutes: estimateStudyMinutes(source.kind, take), completed: false,
        ...(fromPage !== undefined ? { fromPage, toPage } : {}),
      });
      quota -= take;
      unitOffset += take;
      if (unitOffset >= source.units) { unitIndex += 1; unitOffset = 0; }
    }
  });
  return entries;
}
