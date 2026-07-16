# data/2015, data/2022 폴더를 스캔해 과목 목록 인덱스(data/index.json)를 생성
import json
import sys
from pathlib import Path

DATA = Path(__file__).resolve().parent.parent / "public" / "data"


def summarize(path, curriculum):
    d = json.loads(path.read_text(encoding="utf-8"))
    n = sum(len(dom["standards"]) for dom in d["domains"])
    return {"subject": d["subject"], "levels": d["levels"],
            "domains": len(d["domains"]), "standards": n}


def main():
    index = {}
    for cur in ("2022", "2015"):
        folder = DATA / cur
        subjects = []
        for f in sorted(folder.glob("*.json")):
            if f.name.startswith("_"):
                continue
            subjects.append(summarize(f, cur))
        index[cur] = sorted(subjects, key=lambda s: s["subject"])
        print(f"{cur}: {len(subjects)}과목, 성취기준 {sum(s['standards'] for s in subjects)}개")
    (DATA / "index.json").write_text(json.dumps(index, ensure_ascii=False, indent=1),
                                     encoding="utf-8")


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main()
