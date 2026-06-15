# 全球宏观经济事件日历

[English](README.md) | [繁體中文](README.zh-TW.md)

**完全免费，全自动，不需要付费 API。**

一个 Google Apps Script（GAS），自动把全球重要宏观经济事件写入 Google Calendar：FOMC、BOE、ECB、BOJ 利率决议，以及美国 CPI/PPI/非农就业，全部集中在同一个日历。

大多数宏观日历工具要么收费，要么需要手动更新。这个工具把所有免费的公开数据来源（各央行官网 + Finnhub 免费版）接在一起，并处理好各种细节：各时区的夏令时间换算、GAS 无法解析的 JS 渲染页面、Finnhub 事件命名的非直觉规则。部署一次之后，完全自动运行。

## 涵盖事件

| 事件 | 数据来源 |
|------|------|
| FOMC 利率决议 | 美联储官网（网页解析） |
| FOMC 会议纪要 | Finnhub API |
| BOE 利率决议 | 英格兰银行官网（网页解析） |
| ECB 利率决议 | 欧央行官网（网页解析）+ 手动备援 |
| BOJ 利率决议 | 手动登记（官网为 JS 渲染，GAS 无法解析） |
| 美国 CPI / PPI / 非农就业 / 失业率 | Finnhub API |

脚本每天 21:00（台北时间）执行，同步未来 13 个月的事件。

---

## 方案 A：直接订阅现有日历

不需要任何设置，直接把公开日历加入你的 Google 账号。

**Google Calendar（网页版）：**

[加入 Google Calendar](https://calendar.google.com/calendar/r?cid=55a4f43e580604a1dc84e794620385a01c4a127f30199bed4d3c66de4c87d5de%40group.calendar.google.com)

**iCal（Apple Calendar、Outlook 等）：**

```
https://calendar.google.com/calendar/ical/55a4f43e580604a1dc84e794620385a01c4a127f30199bed4d3c66de4c87d5de%40group.calendar.google.com/public/basic.ics
```

---

## 方案 B：自己部署一份

Fork 这个 repo，部署到你自己的 GAS 项目，可以新增自定义事件、更换显示时区，或扩充其他央行的覆盖范围。

### 前置条件

- 一个 Google 账号
- 一组免费的 [Finnhub](https://finnhub.io/) API Key（用于 US CPI/PPI/NFP 数据）
- [clasp](https://github.com/google/clasp)（可选，本地开发用）

### 设置步骤

**1. 创建 GAS 项目**

前往 [script.google.com](https://script.google.com/)，创建一个新项目。

**2. 粘贴代码**

把 `economic_calendar.gs` 粘贴进编辑器。在「项目设置」中开启「显示 appsscript.json 清单文件」，再把 `appsscript.json` 粘贴进去。

**3. 设置脚本属性**

项目设置 → 脚本属性 → 新增以下两个属性：

| Key | Value |
|-----|-------|
| `FINNHUB_API_KEY` | 你的 Finnhub API Key |
| `REMINDER_EMAIL` | 你的邮箱（每年 ECB/BOJ 年度更新提醒用） |

**4. 创建触发器**

执行一次 `setupTrigger()`，之后脚本会每天 21:00 台北时间自动执行。

**5. 测试**

手动执行 `syncEconomicCalendar()` 确认设置正确。

### 新增自定义事件

编辑 `fetchHardcodedEvents()`，每条格式如下：

```javascript
{ summary: '事件名称', year: 2026, month: 6, day: 15, hour: 14, minute: 0, tz: 'America/New_York' }
```

`month` 为 1 起算（1 月 = 1）。`tz` 接受任何 IANA 时区字符串。

### 搭配 clasp 本地开发

```bash
npm install -g @google/clasp
clasp login
clasp clone <你的 script ID>
# 本地修改文件
clasp push
```

---

## 已知限制

- **Finnhub 免费版**：数据只提前 1-2 周。脚本每天运行，持续补齐即将到来的事件。
- **ECB 和 BOJ**：每年 10-11 月需手动更新下一年度日程，因为官网是 JS 渲染，GAS 无法解析。每年 11/15 会自动发送一封提醒邮件到 `REMINDER_EMAIL`。
- **BLS.gov**：屏蔽 GAS IP，CPI/PPI 改由 Finnhub 提供。
- 时间以 UTC 存储，在日历中显示为台北时间（UTC+8）。

---

## 贡献

欢迎 Pull Request。若某个央行页面改版导致解析失败，请开 Issue 并附上新页面链接。

## 授权

MIT
