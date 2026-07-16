# 역사(2022개정)는 전과목 xlsx에 없어 보급본 PDF에서 표 인식으로 추출한다
import json
import re
import sys
from pathlib import Path

import fitz  # PyMuPDF

PDF_DIR = Path(r"C:\Users\user\Documents\1. 클로드코드\26-07-16. 수행평가 제작 프로그램\2022개정 교육과정 성취수준(중)\pdf")
OUT_DIR = Path(__file__).resolve().parent.parent / "public" / "data" / "2022"

TARGETS = {
    "역사": "(중)2022+개정+교육과정에+따른+성취수준(역사).pdf",
    "환경": "(중)+2022+개정+교육과정에+따른+성취수준(환경).pdf",
    "생활외국어": "(중)2022+개정+교육과정에+따른+성취수준(생활외국어)_1101_수정.pdf",
}

CODE_RE = re.compile(r"^\s*\[([0-9]{1,2}[가-힣]{1,4}[0-9]{2}-[0-9]{2})\]\s*(.*)$", re.S)
DOMAIN_RE = re.compile(r"^\(\d+\)\s+")


def clean(s):
    if not s:
        return None
    s = re.sub(r"\s+", " ", str(s)).strip()
    return s or None


def big_headings(page):
    """스팬이 쪼개져도 잡히도록 줄 단위로 합쳐 큰 글씨(>=13pt) 제목을 수집."""
    out = []
    for b in page.get_text("dict")["blocks"]:
        for l in b.get("lines", []):
            text = clean("".join(sp["text"] for sp in l["spans"]))
            size = max((sp["size"] for sp in l["spans"]), default=0)
            if size >= 13 and text:
                out.append(text)
    return out


def domain_headers(page):
    """표 밖의 '(n) 영역명' 줄을 (y, 이름)으로 수집."""
    headers = []
    for b in page.get_text("dict")["blocks"]:
        for l in b.get("lines", []):
            text = clean("".join(sp["text"] for sp in l["spans"]))
            if text and DOMAIN_RE.match(text) and l["bbox"][0] < 120:
                headers.append((l["bbox"][1], text))
    return sorted(headers)


def extract_subject(subject, src, out):
    doc = fitz.open(src)
    mode = None  # None | 'std' | 'domain'
    domains = []          # 성취기준별
    cur_domain = None
    cur_std = None
    dom_levels = {}       # 영역별 {영역: {수준: 진술}}
    cur_dom_name = None

    for pno in range(len(doc)):
        page = doc[pno]
        for h in big_headings(page):
            hn = h.replace(" ", "")
            if hn == "성취기준별성취수준":
                mode = "std"
            elif hn == "영역별성취수준":
                mode = "domain"
            elif hn.startswith("Ⅳ") or hn.startswith("Ⅴ"):
                mode = "done"  # 다음 장(예시 평가도구 등) 진입
        if mode is None or mode == "done":
            if mode == "done":
                break
            continue

        headers = domain_headers(page)
        tabs = page.find_tables()
        for t in sorted(tabs.tables, key=lambda t: t.bbox[1]):
            above = [name for y, name in headers if y < t.bbox[1]]
            if above:
                name = above[-1]
                if mode == "std":
                    if cur_domain is None or cur_domain["name"] != name:
                        cur_domain = {"name": name, "standards": []}
                        domains.append(cur_domain)
            for row in t.extract():
                cells = [clean(c) for c in row]
                if any(c in ("성취기준", "영역") for c in cells) and \
                   any(c and "성취수준" in c for c in cells):
                    continue  # 헤더 행
                # 수준 문자 열의 위치는 표마다 달라 동적으로 찾음
                li = next((i for i, c in enumerate(cells)
                           if c and len(c) == 1 and c in "ABCDE"), None)
                left = [c for c in (cells[:li] if li is not None else cells) if c]
                lv = cells[li] if li is not None else None
                text = " ".join(c for c in cells[li + 1:] if c) if li is not None else None

                if mode == "std":
                    for frag in left:
                        m = CODE_RE.match(frag)
                        if m and (cur_std is None or m.group(1) != cur_std["code"]):
                            cur_std = {"code": m.group(1), "text": m.group(2).strip(),
                                       "unit": None, "levels": {}}
                            if cur_domain is None:
                                cur_domain = {"name": "", "standards": []}
                                domains.append(cur_domain)
                            cur_domain["standards"].append(cur_std)
                        elif cur_std is not None:
                            piece = m.group(2).strip() if m else frag
                            if piece and piece not in cur_std["text"]:
                                cur_std["text"] = (cur_std["text"] + " " + piece).strip()
                    if lv and text and cur_std is not None:
                        old = cur_std["levels"].get(lv)
                        if old is None:
                            cur_std["levels"][lv] = text
                        elif text not in old:
                            cur_std["levels"][lv] = old + " " + text
                else:  # domain 모드
                    if left:
                        if lv is not None:
                            cur_dom_name = " ".join(left)  # 새 영역 시작
                            dom_levels.setdefault(cur_dom_name, {})
                        elif cur_dom_name:  # 여러 줄로 쪼개진 영역명 이어붙임
                            extra = " ".join(f for f in left if f not in cur_dom_name)
                            if extra:
                                renamed = (cur_dom_name + " " + extra).strip()
                                dom_levels[renamed] = dom_levels.pop(cur_dom_name, {})
                                cur_dom_name = renamed
                    if lv and text and cur_dom_name:
                        dom_levels.setdefault(cur_dom_name, {})
                        old = dom_levels[cur_dom_name].get(lv)
                        if old is None:
                            dom_levels[cur_dom_name][lv] = text
                        elif text not in old:
                            dom_levels[cur_dom_name][lv] = old + " " + text

    # 영역별 성취수준을 영역명 매칭으로 붙임
    def dkey(s):
        return re.sub(r"[\s･·.()0-9]", "", s or "")
    dl_by_key = {dkey(k): v for k, v in dom_levels.items()}
    for d in domains:
        d["domainLevels"] = dl_by_key.get(dkey(DOMAIN_RE.sub("", d["name"])), {})

    # 표 인식이 겹쳐 같은 성취기준이 두 번 잡히면 수준을 합쳐 하나로
    for d in domains:
        seen = {}
        merged = []
        for s in d["standards"]:
            if s["code"] in seen:
                for lv, txt in s["levels"].items():
                    seen[s["code"]]["levels"].setdefault(lv, txt)
            else:
                seen[s["code"]] = s
                merged.append(s)
        d["standards"] = merged

    # 인접 수준 병합 셀(빈칸)은 위 수준 진술을 물려받음 (xlsx 추출과 동일 규칙)
    order = "".join(lv for lv in "ABCDE"
                    if any(lv in s["levels"] for d in domains for s in d["standards"]))
    for d in domains:
        for s in d["standards"]:
            present = [lv for lv in order if lv in s["levels"]]
            if not present:
                continue
            merged_up, prev = [], None
            for lv in order:
                if lv in s["levels"]:
                    prev = lv
                elif prev is not None:
                    s["levels"][lv] = s["levels"][prev]
                    merged_up.append(lv)
            if merged_up:
                s["mergedUp"] = merged_up

    n_std = sum(len(d["standards"]) for d in domains)
    all_levels = sorted({lv for d in domains for s in d["standards"] for lv in s["levels"]})
    incomplete = [s["code"] for d in domains for s in d["standards"] if sorted(s["levels"]) != all_levels]
    data = {"curriculum": "2022", "subject": subject, "levels": all_levels, "domains": domains}
    print(f"{subject}: 영역 {len(domains)}, 성취기준 {n_std}, 수준 {''.join(all_levels)}, "
          f"영역별수준 {len(dom_levels)}개 영역, 수준불완전 {incomplete[:6]}{'…' if len(incomplete) > 6 else ''}")
    return data


LANG_NAMES = {"생일": "생활일본어", "생중": "생활중국어", "생스": "생활스페인어",
              "생프": "생활프랑스어", "생독": "생활독일어", "생러": "생활러시아어",
              "생아": "생활아랍어", "생베": "생활베트남어"}


def split_languages(data):
    """생활외국어 통합본을 코드 접두(생일·생중…)별 과목으로 분리."""
    by_lang = {}
    for d in data["domains"]:
        codes = [s["code"] for s in d["standards"] if s["code"]]
        if not codes:
            continue
        m = re.match(r"9([가-힣]+?)\d", codes[0])
        token = m.group(1) if m else "기타"
        by_lang.setdefault(token, []).append(d)
    out = []
    for token, doms in by_lang.items():
        name = LANG_NAMES.get(token, f"생활외국어({token})")
        levels = sorted({lv for d in doms for s in d["standards"] for lv in s["levels"]})
        out.append({"curriculum": "2022", "subject": name, "levels": levels, "domains": doms})
    return out


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    for subject, fname in TARGETS.items():
        data = extract_subject(subject, PDF_DIR / fname, OUT_DIR / f"{subject}.json")
        datasets = split_languages(data) if subject == "생활외국어" else [data]
        for ds in datasets:
            n = sum(len(d["standards"]) for d in ds["domains"])
            (OUT_DIR / f"{ds['subject']}.json").write_text(
                json.dumps(ds, ensure_ascii=False, indent=1), encoding="utf-8")
            if len(datasets) > 1:
                print(f"  → {ds['subject']}: 영역 {len(ds['domains'])}, 성취기준 {n}, 수준 {''.join(ds['levels'])}")
