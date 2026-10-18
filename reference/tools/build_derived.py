#!/usr/bin/env python3
"""由独立重实现生成 reference/derived/*.json。只读本目录的 independent_xuankong.py，不碰引擎。"""
import json, subprocess, hashlib, os
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', 'derived')
src = open(os.path.join(HERE, 'independent_xuankong.py'), 'rb').read()
meta = {"generator": "reference/tools/independent_xuankong.py", "generatorSha256": hashlib.sha256(src).hexdigest()[:16],
        "kind": "derived", "note": "独立重实现（N-version）产出。只证明两套实现一致，不证明规则本身正确。未经 kt 审核前，不得作为回归测试的期望值。",
        "review": {"status": "unreviewed", "reviewer": None}}
def run(cmd):
    return json.loads(subprocess.check_output(['python3', os.path.join(HERE, 'independent_xuankong.py'), cmd]))
cases = []
for c in run('charts'):
    tag = 'XG' if not c['useTiXing'] else ('TG' if c['fiveTi'] == 'period' else 'TG5K')
    assumptions = (["五入中逢替卦：取元运宫同元龙之山之替星（R6' period）"] if tag == 'TG'
                   else ["五入中逢替卦：五不替（R6' keep5）"] if tag == 'TG5K' else [])
    inter = {k: c.get(k) for k in ['shanCenter', 'shanDir', 'shanRef', 'xiangCenter', 'xiangDir', 'xiangRef', 'shanNote', 'xiangNote'] if c.get(k) is not None}
    cases.append({"id": f"D-{tag}-{c['period']}-{c['sitting']}",
                  "input": {"period": c['period'], "sitting": c['sitting'], "facing": c['facing'], "useTiXing": c['useTiXing'], "assumptions": assumptions},
                  "expected": {"intermediate": inter, "yun": c['yun'], "shan": c['shan'], "xiang": c['xiang']}})
json.dump({"meta": {**meta, "ruleSet": "independent-xuankong@0.1 (R1–R7)"}, "cases": cases}, open(os.path.join(OUT, 'charts.json'), 'w'), ensure_ascii=False, indent=1)
json.dump({"meta": {**meta, "ruleSet": "independent-xuankong@0.1 (R8–R9)"}, **run('stars')}, open(os.path.join(OUT, 'stars.json'), 'w'), ensure_ascii=False, indent=1)
json.dump({"meta": {**meta, "ruleSet": "independent-xuankong@0.1 (R1, R7)"}, "degreeToMountain": run('degrees'), "periodOfYear": run('periods')},
          open(os.path.join(OUT, 'boundaries.json'), 'w'), ensure_ascii=False, indent=1)
print(len(cases), 'derived chart cases')
