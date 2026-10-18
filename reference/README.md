# reference/ —— 独立计算证据

这里存放用来**检验**飞星引擎的参照数据。最重要的规矩只有一条：

> **期望值永远不能由被测引擎产生。**

| 目录 | 内容 | 期望值从哪来 | 能证明什么 |
|---|---|---|---|
| `transcribed/` | 网页上公开发表的盘例与规则表，逐案注明网址、抓取日期、原文 | 人（经抓取工具）从网页转录 | 引擎与该来源一致或不一致 |
| `book-pending/` | 书例模板与待补清单 | **只能由人从书上抄** | 引擎与该书一致或不一致 |
| `derived/` | 独立重实现（`tools/independent_xuankong.py`）产出的全量盘 | 另一套只按已注明规则写成、未看引擎源码的程序 | 两套实现一致；**不证明规则正确** |
| `observed/` | 引擎对上述案例的实际输出与差异报告 | 引擎（由 harness 生成，勿手改） | —— |

**审核状态**：每个案例都有 `review.status`。只有 `reviewed` 的案例会成为会失败的回归测试；
`unreviewed` 的案例只进差异报告，不阻挡任何改动。目前全部案例均为 `unreviewed`。

**重新生成**：
```bash
python3 reference/tools/build_derived.py      # 由独立重实现写入 derived/
REFERENCE_WRITE=1 npx vitest run packages/core-fengshui/src/reference.harness.test.ts
```
