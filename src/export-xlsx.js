// XLSX 내보내기 — 평가계획 총괄표 + 영역별 채점기준표 (SheetJS, 한셀 호환)
import * as XLSX from 'xlsx';

export function downloadXlsx(plan, subjectData, stds) {
  const wb = XLSX.utils.book_new();
  wb.SheetNames = [];

  // 1) 총괄표
  const w = plan.written, p = plan.performance;
  const rows = [
    ['평가 종류', '영역/회차', '유형', '만점', '반영비율(%)', '논술형', '평가시기', '성취기준'],
    ...w.exams.map(e => ['정기시험', e.name, '선택형+논술형', `${Number(e.select) + Number(e.essay)}`, e.ratio, e.essay > 0 ? 'O' : '-', e.period, (e.codes || []).join(', ')]),
    ...p.areas.map(a => ['수행평가', a.name, a.type, a.points, a.ratio, a.isEssay ? 'O' : '-', a.period, a.codes.join(', ')]),
    ['합계', '', '', '', w.ratio + p.ratio, '', '', '']
  ];
  const ws1 = XLSX.utils.aoa_to_sheet(rows);
  ws1['!cols'] = [{ wch: 10 }, { wch: 14 }, { wch: 14 }, { wch: 8 }, { wch: 12 }, { wch: 8 }, { wch: 12 }, { wch: 40 }];
  XLSX.utils.book_append_sheet(wb, ws1, '평가계획 총괄표');

  // 2) 영역별 채점기준표
  plan.performance.areas.forEach((a, i) => {
    const rows2 = [
      ['평가 영역', `${a.name}(${a.type})`, '', '영역 만점', `${a.points}점`],
      ['수행과제', a.task, '', '', ''],
      [],
      ['평가요소', '수행수준(채점기준)', '배점'],
    ];
    a.elements.forEach(el => {
      el.levels.forEach((lv, li) => {
        rows2.push([li === 0 ? `${el.name} (${el.points}점)` : '', lv.desc, lv.score]);
      });
    });
    rows2.push(['기본점수 (모든 평가요소에서 최저점)', '', a.basePoint]);
    rows2.push(['본인 의사에 의한 미참여', '', a.nonParticipation]);
    rows2.push(['장기 미인정 결석자', '', a.longAbsence]);
    const ws = XLSX.utils.aoa_to_sheet(rows2);
    ws['!cols'] = [{ wch: 30 }, { wch: 70 }, { wch: 8 }];
    XLSX.utils.book_append_sheet(wb, ws, sheetName(`${i + 1}.${a.name || '영역' + (i + 1)}`));
  });

  // 3) (2022) 학기 단위 성취수준
  if (plan.meta.curriculum === '2022') {
    const rows3 = [['성취수준', '진술'],
      ...subjectData.levels.map(lv => [lv, plan.semesterLevels[lv] || ''])];
    const ws3 = XLSX.utils.aoa_to_sheet(rows3);
    ws3['!cols'] = [{ wch: 8 }, { wch: 100 }];
    XLSX.utils.book_append_sheet(wb, ws3, '학기단위 성취수준');
  }

  const m = plan.meta;
  XLSX.writeFile(wb, `${m.schoolYear}학년도 ${m.semester}학기 ${m.grade}학년 ${m.subject} 평가계획.xlsx`);
}

// 시트 이름 제약(31자, 특수문자) 정리
function sheetName(s) {
  return s.replace(/[\\/?*[\]:]/g, ' ').slice(0, 31);
}
