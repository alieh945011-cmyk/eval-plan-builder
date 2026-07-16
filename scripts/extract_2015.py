# 2015개정 평가기준 hwp(→kordoc 마크다운)에서 성취기준·평가기준(상중하)을 추출해 JSON 생성
import json
import re
import sys
from html.parser import HTMLParser
from pathlib import Path

MD_DIR = Path(r"C:\Users\user\AppData\Local\Temp\claude\C--Users-user-Documents-1--------26-07-16--------------\5f452585-580b-42c1-91ab-e66f2905595c\scratchpad\hwp2015")
OUT_DIR = Path(__file__).resolve().parent.parent / "public" / "data" / "2015"

CODE_RE = re.compile(r"\[([0-9]{1,2}[가-힣A-Za-z()（）]{1,10}-?[0-9]{2}-[0-9]{2})\]\s*-?\s*(.*)$", re.S)
DOMAIN_RE = re.compile(r"^([가-하])\.\s+(.+)$")     # 가. 수와 연산
UNIT_RE = re.compile(r"^(\d+)\)\s+(.+)$")           # 1) 소인수분해
SUB_RE = re.compile(r"\[평가준거\s*성취기준\s*([①②③④⑤⑥⑦⑧])\]\s*(.*)$", re.S)
START_RE = re.compile(r"^1\.\s*교육과정\s*성취기준")
END_RE = re.compile(r"^2\.\s*영역별\s*성취수준|^2\.\s*단원/영역별\s*성취수준")


def clean(s):
    if s is None:
        return None
    s = s.replace("<br>", " ").replace("<br/>", " ")
    s = re.sub(r"<[^>]+>", "", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s or None


class TableParser(HTMLParser):
    """rowspan/colspan을 좌표 그리드로 풀어 행렬을 만든다."""
    def __init__(self):
        super().__init__()
        self.rows = []
        self.cur_row = None
        self.cur_cell = None
        self.spans = []  # (row_idx, col, rowspan, text) 대기 중인 rowspan

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == "tr":
            self.cur_row = []
        elif tag in ("td", "th"):
            self.cur_cell = {"text": "", "rowspan": int(a.get("rowspan", 1)),
                             "colspan": int(a.get("colspan", 1))}
        elif tag == "br" and self.cur_cell is not None:
            self.cur_cell["text"] += "\n"  # 융합 셀 분리를 위해 줄바꿈 보존

    def handle_endtag(self, tag):
        if tag in ("td", "th") and self.cur_row is not None:
            self.cur_row.append(self.cur_cell)
            self.cur_cell = None
        elif tag == "tr" and self.cur_row is not None:
            self.rows.append(self.cur_row)
            self.cur_row = None

    def handle_data(self, data):
        if self.cur_cell is not None:
            self.cur_cell["text"] += data

    def grid(self):
        """rowspan/colspan 반영한 2차원 텍스트 그리드."""
        out = []
        carry = {}  # col -> (remaining, text)
        for row in self.rows:
            line = []
            col = 0
            cells = iter(row)
            while True:
                while col in carry and carry[col][0] > 0:
                    line.append(carry[col][1])
                    carry[col] = (carry[col][0] - 1, carry[col][1])
                    if carry[col][0] == 0:
                        del carry[col]
                    col += 1
                c = next(cells, None)
                if c is None:
                    break
                text = re.sub(r"[ \t]+", " ", c["text"]).strip()
                for k in range(c["colspan"]):
                    line.append(text if k == 0 else None)
                    if c["rowspan"] > 1:
                        carry[col] = (c["rowspan"] - 1, text if k == 0 else None)
                    col += 1
            out.append(line)
        return out


def md_table_grid(lines):
    """마크다운 파이프 표 → 그리드 (구분선 제거). 파이프 표엔 rowspan이 없어
    빈칸은 직전 행 값 이어받기로 처리한다."""
    grid = []
    for ln in lines:
        if re.match(r"^\|[\s\-|]+\|$", ln):
            continue
        cells = [clean(c) for c in ln.strip().strip("|").split("|")]
        grid.append(cells)
    return grid


LEVEL_FIX = {"증": "중"}  # 원본 hwp 오타 정규화 (생활프랑스어 등)


class Collector:
    """표가 페이지 경계에서 쪼개져도 성취기준 문맥이 이어지도록
    파일 단위로 상태(현재 코드·준거·레코드 색인)를 유지한다."""

    def __init__(self, stats):
        self.records = []
        self.index = {}
        self.cur_code, self.cur_text, self.cur_sub = None, "", None
        self.pending = None  # 융합 셀에서 분리된 (수준, 진술) — 다음 성취기준 소속
        self.stats = stats

    def feed(self, grid, cur_unit):
        rows_to_standards(grid, cur_unit, self.stats, self)


def rows_to_standards(grid, cur_unit, subject_stats, col):
    """그리드 행들을 성취기준 레코드로 변환. rowspan 때문에 코드·준거 셀이
    행마다 반복되므로 (코드, 준거라벨) 키로 레코드를 병합한다."""
    records = col.records
    index = col.index
    cur_code, cur_text, cur_sub = col.cur_code, col.cur_text, col.cur_sub
    for row in grid:
        cells = [c for c in row if c]
        if not cells:
            continue
        # 페이지 경계에서 두 행이 한 셀로 융합된 경우('하\n상' + '진술A\n진술B') 분리
        for k, c in enumerate(cells):
            if re.fullmatch(r"(상|중|하|증)\n(상|중|하|증)", c) and \
               k + 1 < len(cells) and "\n" in (cells[k + 1] or ""):
                lv1, lv2 = c.split("\n")
                d1, d2 = cells[k + 1].split("\n", 1)
                col.pending = (LEVEL_FIX.get(lv2, lv2), re.sub(r"\s+", " ", d2).strip())
                cells = cells[:k] + [lv1, d1] + cells[k + 2:]
                break
        cells = [re.sub(r"\s+", " ", c).strip() for c in cells]
        cells = [c for c in cells if c]
        if not cells:
            continue
        joined = " ".join(cells)
        if "교육과정 성취기준" in joined and "평가기준" in joined:
            continue  # 헤더
        cells = [LEVEL_FIX.get(c, c) for c in cells]
        li = next((i for i, c in enumerate(cells) if c in ("상", "중", "하")), None)
        level = cells[li] if li is not None else None
        desc = " ".join(cells[li + 1:]) if li is not None and li + 1 < len(cells) else None
        for c in cells[:li if li is not None else len(cells)]:
            m = CODE_RE.search(c)
            ms = SUB_RE.search(c)
            if m:
                if m.group(1) != cur_code:
                    cur_code, cur_text, cur_sub = m.group(1), clean(m.group(2)) or "", None
                    if col.pending:  # 융합 셀에서 이월된 수준 진술을 새 성취기준에 귀속
                        plv, pdesc = col.pending
                        col.pending = None
                        rec = {"code": cur_code, "text": cur_text, "subLabel": None,
                               "parentText": None, "unit": cur_unit, "criteria": {plv: pdesc}}
                        index[(cur_code, None)] = rec
                        records.append(rec)
                else:
                    extra = clean(m.group(2))
                    if extra and extra not in cur_text:
                        cur_text = (cur_text + " " + extra).strip()
            elif ms:
                if cur_sub is None or ms.group(1) != cur_sub[0]:
                    cur_sub = [ms.group(1), clean(ms.group(2)) or ""]
                else:
                    extra = clean(ms.group(2))
                    if extra and extra not in cur_sub[1]:
                        cur_sub[1] = (cur_sub[1] + " " + extra).strip()
            elif cur_sub is not None:
                if c not in cur_sub[1]:
                    cur_sub[1] = (cur_sub[1] + " " + c).strip()
            elif cur_code is not None:
                if c not in cur_text:
                    cur_text = (cur_text + " " + c).strip()
        if level and desc:
            if cur_code is None:
                subject_stats["orphan_rows"] += 1
                continue
            key = (cur_code, cur_sub[0] if cur_sub else None)
            rec = index.get(key)
            if rec is None:
                rec = {"code": cur_code, "text": "", "subLabel": key[1],
                       "parentText": None, "unit": cur_unit, "criteria": {}}
                index[key] = rec
                records.append(rec)
            rec["text"] = cur_sub[1] if cur_sub else cur_text
            rec["parentText"] = cur_text if cur_sub else None
            if level not in rec["criteria"]:
                rec["criteria"][level] = desc
            elif desc not in rec["criteria"][level]:
                rec["criteria"][level] += " " + desc
    col.cur_code, col.cur_text, col.cur_sub = cur_code, cur_text, cur_sub
    return records


def extract_file(md_path):
    text = md_path.read_text(encoding="utf-8")
    lines = text.split("\n")
    subject = re.search(r"평가기준\((.+?)\)", md_path.name).group(1)
    stats = {"orphan_rows": 0}

    domains = []
    cur_domain = None
    cur_unit = None
    in_section = False
    col = Collector(stats)
    i = 0
    while i < len(lines):
        ln = lines[i].strip()
        is_toc = bool(re.search(r"\d+\s*$", ln))  # 목차 줄은 끝에 쪽번호가 붙음
        if not in_section and START_RE.match(ln) and not is_toc:
            in_section = True
            i += 1
            continue
        if in_section and END_RE.match(ln) and not is_toc:
            in_section = False  # 생활외국어처럼 언어별 섹션이 반복되면 다음 START에서 재진입
            cur_domain, cur_unit = None, None
            i += 1
            continue
        if not in_section:
            i += 1
            continue

        dm = DOMAIN_RE.match(ln)
        um = UNIT_RE.match(ln)
        if dm and "<" not in ln:
            cur_domain = {"name": dm.group(2).strip(), "standards": []}
            domains.append(cur_domain)
            cur_unit = None
        elif um and "<" not in ln:
            cur_unit = um.group(2).strip()
        elif ln.startswith("<table"):
            j = i
            while j < len(lines) and "</table>" not in lines[j]:
                j += 1
            tp = TableParser()
            tp.feed("\n".join(lines[i:j + 1]))
            grid = tp.grid()
            if cur_domain is None:
                cur_domain = {"name": "", "standards": []}
                domains.append(cur_domain)
            before = len(col.records)
            col.feed(grid, cur_unit)
            cur_domain["standards"].extend(col.records[before:])
            i = j
        elif ln.startswith("|"):
            j = i
            while j < len(lines) and lines[j].strip().startswith("|"):
                j += 1
            grid = md_table_grid([l.strip() for l in lines[i:j]])
            if cur_domain is None:
                cur_domain = {"name": "", "standards": []}
                domains.append(cur_domain)
            before = len(col.records)
            col.feed(grid, cur_unit)
            cur_domain["standards"].extend(col.records[before:])
            i = j - 1
        i += 1

    n = sum(len(d["standards"]) for d in domains)
    bad = [s["code"] for d in domains for s in d["standards"]
           if sorted(s["criteria"].keys()) != ["상", "중", "하"]]
    data = {"curriculum": "2015", "subject": subject, "levels": ["상", "중", "하"],
            "domains": domains}
    print(f"{subject}: 영역 {len(domains)}, 평가기준레코드 {n}, 기준불완전 {len(bad)}"
          f"{' ' + str(bad[:5]) if bad else ''} 고아행 {stats['orphan_rows']}")
    return data


LANG_NAMES = {"생일": "생활일본어", "생중": "생활중국어", "생스": "생활스페인어",
              "생프": "생활프랑스어", "생독": "생활독일어", "생러": "생활러시아어",
              "생아": "생활아랍어", "생베": "생활베트남어"}


def split_languages(data):
    by_lang = {}
    for d in data["domains"]:
        codes = [s["code"] for s in d["standards"] if s["code"]]
        if not codes:
            continue
        m = re.match(r"9([가-힣]+?)[-\d]", codes[0])
        token = m.group(1) if m else "기타"
        by_lang.setdefault(token, []).append(d)
    return [{"curriculum": "2015", "subject": LANG_NAMES.get(t, f"생활외국어({t})"),
             "levels": ["상", "중", "하"], "domains": doms}
            for t, doms in by_lang.items()]


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for md in sorted(MD_DIR.glob("*.md")):
        data = extract_file(md)
        datasets = split_languages(data) if data["subject"] == "생활외국어" else [data]
        for ds in datasets:
            (OUT_DIR / f"{ds['subject']}.json").write_text(
                json.dumps(ds, ensure_ascii=False, indent=1), encoding="utf-8")
            if len(datasets) > 1:
                n = sum(len(d["standards"]) for d in ds["domains"])
                print(f"  → {ds['subject']}: 영역 {len(ds['domains'])}, 레코드 {n}")


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main()
