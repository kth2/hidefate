#!/usr/bin/env python3
"""
独立重实现（N-version）—— 只依据下列已注明出处的规则文字写成，**未参考 HideFate 引擎源码**。
用途：给引擎找一个「另一套实现」来对拍。它不是书上的盘例，结论只能证明两套实现一致，
不能证明规则本身正确；书例核对仍须 reference/book-pending/ 的案例。

规则来源（逐条）：
  R1 二十四山次序（罗盘通行次序，壬子癸丑艮寅甲卯乙辰巽巳丙午丁未坤申庚酉辛戌乾亥）；
     每山 15°，子山居正北 0°。边界取 (起, 止] —— 依 Wikipedia「Ren mountain bearing 337.6 – 352.5」。
  R2 阴阳：Wikipedia「Flying Star Feng Shui」：「Even-numbered Stars follow a Yin-Yang-Yang form.
     Odd-numbered Stars follow a Yang-Yin-Yin form.」（每宫三山依 地元、天元、人元 次序）
  R3 洛书飞布：搜狐《李炎宸教风水第三章》：中宫 → 6 → 7 → 8 → 9 → 1 → 2 → 3 → 4；
     逆飞即同一路线倒行（例「8入中逆飞，那么9在巽，1在震……7在乾」）。
  R4 定顺逆：搜狐《如何一步步完成玄空飞星手工排盘》：「以其所在本宫的阴阳决定顺逆飞」
     （例「坐山子为三、三入中，3为卯为阴，故逆飞九宫」：取该数本宫中与坐山同元龙之山）。
  R5 五入中：Wikipedia：「To determine the polarity of number 5 star, go by the polarity of the Period number.」
  R6 替卦：同 R4 出处：「替星入中后，其阴阳还是按照原卦山之阴阳」（例「辰4入中，替6，辰为阴，逆飞」）。
     替星表依《起星诀》：子癸并甲申贪狼；壬卯乙未坤巨门；乾亥辰巽巳连戌武曲；酉辛丑艮丙破军；寅午庚丁右弼。
  R6' 五入中逢替卦：诸家不一。本实现提供两种：
     'period'：取元运宫同元龙之山的替星（与 R5 同理推广）；
     'keep5' ：五无替星，仍以五入中（搜狐《壬山丙向九运挨星下卦以及替卦图》替卦盘「全局犯伏吟」所隐含）。
  R7 元运：上元一运始于 1864 年，每运 20 年。
  R8 年星：搜狐《李炎宸》：「上元甲子一宫起，中元四绿推甲子。下元七赤兑位寻，逐年星逆中宫始。」
  R9 月星：同上：「子午卯酉八白宫，辰戌丑未五黄中。寅申巳亥居何位，逆寻二黑是其宗。」（正月入中，逐月逆）
"""
import json, sys

SEQ = "壬子癸丑艮寅甲卯乙辰巽巳丙午丁未坤申庚酉辛戌乾亥"
TRIGRAM_OF_GROUP = ["坎", "艮", "震", "巽", "离", "坤", "兑", "乾"]
LUOSHU = {"坎": 1, "坤": 2, "震": 3, "巽": 4, "乾": 6, "兑": 7, "艮": 8, "离": 9}
YUAN = ["地元", "天元", "人元"]

MOUNTAINS = {}
for i, name in enumerate(SEQ):
    g = TRIGRAM_OF_GROUP[i // 3]
    p = LUOSHU[g]
    pos = i % 3
    pattern = ["阳", "阴", "阴"] if p % 2 == 1 else ["阴", "阳", "阳"]          # R2
    center = (345 + 15 * i) % 360                                             # R1：壬 345°
    MOUNTAINS[name] = dict(name=name, palace=p, yuan=YUAN[pos], yy=pattern[pos], center=center)

BY_PALACE_YUAN = {(m["palace"], m["yuan"]): m for m in MOUNTAINS.values()}

TI = {}
for names, star in [("子癸甲申", 1), ("壬卯乙未坤", 2), ("乾亥辰巽巳戌", 6), ("酉辛丑艮丙", 7), ("寅午庚丁", 9)]:
    for n in names: TI[n] = star                                              # R6

PATH = [5, 6, 7, 8, 9, 1, 2, 3, 4]                                            # R3

def fly(center, forward):
    plate = {}
    order = PATH if forward else [5] + PATH[1:][::-1]
    s = center
    for p in order:
        plate[p] = s
        s = 1 if s == 9 else s + 1
    return plate

def degree_to_mountain(deg):
    d = deg % 360
    # (起, 止]：壬 = (337.5, 352.5]，子 = (352.5, 7.5]……
    for m in MOUNTAINS.values():
        lo = (m["center"] - 7.5) % 360
        hi = (m["center"] + 7.5) % 360
        if lo < hi:
            if lo < d <= hi: return m
        else:
            if d > lo or d <= hi: return m
    raise ValueError(deg)

def opposite(m):
    return MOUNTAINS[SEQ[(SEQ.index(m["name"]) + 12) % 24]]

def period_of_year(y):
    return ((y - 1864) // 20) % 9 + 1                                         # R7

def ref_mountain(star, origin, period):
    if star == 5:
        if period == 5:
            return None                                                       # 双五无依：本实现不处理，标记
        return BY_PALACE_YUAN[(period, origin["yuan"])]                       # R5
    return BY_PALACE_YUAN[(star, origin["yuan"])]                             # R4

def chart(period, sitting_name, use_ti=False, five_ti="period"):
    sit = MOUNTAINS[sitting_name]; fac = opposite(sit)
    yun = fly(period, True)
    out = {"period": period, "sitting": sit["name"], "facing": fac["name"], "useTiXing": use_ti, "fiveTi": five_ti}
    for key, m in (("shan", sit), ("xiang", fac)):
        n = yun[m["palace"]]
        ref = ref_mountain(n, m, period)
        if ref is None:
            out[key] = None; out[key + "Note"] = "五运五入中，无依"; continue
        center = n
        if use_ti and not (n == 5 and five_ti == "keep5"):
            center = TI[ref["name"]]                                          # R6
        forward = ref["yy"] == "阳"
        out[key + "Center"] = center
        out[key + "Dir"] = "顺" if forward else "逆"
        out[key + "Ref"] = ref["name"]
        out[key] = fly(center, forward)
    out["yun"] = yun
    return out

def annual_star(y):
    # R8：甲子年起星 上元1、中元4、下元7，逐年逆（减一）
    cycle_start = 1864 + ((y - 1864) // 60) * 60
    yuan = ((y - 1864) // 60) % 3
    start = [1, 4, 7][yuan]
    n = (start - (y - cycle_start) - 1) % 9 + 1
    return n

def monthly_star(y, month_index):
    zhi = "子丑寅卯辰巳午未申酉戌亥"[(y - 1864) % 12]
    first = 8 if zhi in "子午卯酉" else 5 if zhi in "辰戌丑未" else 2         # R9
    return (first - (month_index - 1) - 1) % 9 + 1

if __name__ == "__main__":
    cmd = sys.argv[1]
    if cmd == "charts":
        res = []
        for period in range(1, 10):
            for name in SEQ:
                res.append(chart(period, name, False))
                res.append(chart(period, name, True, "period"))
                if chart(period, name, False).get("yun", {}).get(MOUNTAINS[name]["palace"]) == 5 or \
                   chart(period, name, False).get("yun", {}).get(opposite(MOUNTAINS[name])["palace"]) == 5:
                    res.append(chart(period, name, True, "keep5"))
        json.dump(res, sys.stdout, ensure_ascii=False)
    elif cmd == "stars":
        json.dump({"annual": {y: annual_star(y) for y in range(1864, 2101)},
                   "monthly": {f"{y}-{m}": monthly_star(y, m) for y in range(2020, 2033) for m in range(1, 13)}},
                  sys.stdout, ensure_ascii=False)
    elif cmd == "degrees":
        tests = [0, 7.4999, 7.5, 7.5001, 22.5, 337.5, 337.5001, 352.4999, 352.5, 352.5001, 359.9999]
        json.dump({str(d): degree_to_mountain(d)["name"] for d in tests}, sys.stdout, ensure_ascii=False)
    elif cmd == "periods":
        json.dump({y: period_of_year(y) for y in [1863, 1864, 1883, 1884, 1983, 1984, 2003, 2004, 2023, 2024, 2043, 2044]}, sys.stdout)
