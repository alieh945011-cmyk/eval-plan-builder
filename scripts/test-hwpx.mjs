// HWPX 생성 회귀 테스트 — 브라우저 없이 buildHwpx를 실행해 산출물을 만든다
// 사용법: node scripts/test-hwpx.mjs [2022|2015] [출력경로]
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { DOMParser, XMLSerializer } from '@xmldom/xmldom';

globalThis.DOMParser = DOMParser;
globalThis.XMLSerializer = XMLSerializer;

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { buildHwpx, templateName } = await import(
  pathToFileURL(path.join(ROOT, 'src', 'export-hwpx.js')).href);

const mode = process.argv[2] || '2022';
const outPath = process.argv[3] || path.join(ROOT, 'scripts', `test-out-${mode}.hwpx`);

const subject = '수학';
const data = JSON.parse(await readFile(
  path.join(ROOT, 'public', 'data', mode, `${subject}.json`), 'utf-8'));

const codes = mode === '2022' ? ['9수01-01', '9수01-06'] : null;
const stds = data.domains.flatMap(d => d.standards).filter((s, i) =>
  codes ? codes.includes(s.code) : i < 2);

const area = (name, type, points, ratio, isEssay, stdRef) => ({
  name, type, points, ratio, isEssay, period: '11월 3주',
  codes: [stdRef.code + (stdRef.subLabel ? `-${stdRef.subLabel}` : '')],
  task: `∘ ${name} 수행 과제`,
  methods: ['논술', '프로젝트', '교사관찰및기록'],
  elements: [
    { name: '핵심 개념 적용하기', points: 10, levels: [
      { score: 10, desc: '세 문항 모두 옳게 해결했다.' },
      { score: 8, desc: '두 문항을 옳게 해결했다.' },
      { score: 6, desc: '한 문항을 옳게 해결했다.' },
      { score: 4, desc: '문항을 해결하지 못했다.' }] },
    { name: '과정 서술하기', points: 10, levels: [
      { score: 10, desc: '과정을 논리적으로 빠짐없이 서술했다.' },
      { score: 8, desc: '과정을 대체로 서술했다.' },
      { score: 6, desc: '과정 일부만 서술했다.' },
      { score: 4, desc: '과정을 서술하지 못했다.' }] }
  ],
  basePoint: 6, nonParticipation: 5, longAbsence: 4
});

const plan = {
  meta: { curriculum: mode, grade: mode === '2022' ? 2 : 3, semester: 2, subject, schoolYear: 2026 },
  standards: stds.map(s => s.code + (s.subLabel ? `-${s.subLabel}` : '')),
  written: {
    ratio: 50, prevSchoolReflect: 'O',
    exams: [
      { name: '1차', select: 90, essay: 10, ratio: 25, period: '10월 2주', codes: [stds[0].code], elements: '∘개념 이해하기' },
      { name: '2차', select: 90, essay: 10, ratio: 25, period: '12월 2주', codes: [stds[1]?.code].filter(Boolean), elements: '∘문제 해결하기' }
    ]
  },
  performance: {
    ratio: 50,
    areas: [area('탐구보고서', '논술형', 20, 25, true, stds[0]),
            area('수학일지', '포트폴리오', 20, 25, false, stds[1] || stds[0])]
  },
  semesterLevels: {
    A: 'A 수준 종합 진술입니다.', B: 'B 수준 종합 진술입니다.', C: 'C 수준 종합 진술입니다.',
    D: 'D 수준 종합 진술입니다.', E: 'E 수준 종합 진술입니다.'
  },
  generated: {}
};

const tpl = await readFile(path.join(ROOT, 'public', 'templates', `${templateName(plan)}.hwpx`));
const outZip = await buildHwpx(tpl, plan, data, stds);
const buf = await outZip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
await writeFile(outPath, buf);
console.log(`OK ${mode}: ${outPath} (${buf.length} bytes, 성취기준 ${stds.length}개)`);
