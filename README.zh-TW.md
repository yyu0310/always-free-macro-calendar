# 全球總經事件月曆

[English](README.md)

**完全免費，全自動，不需要付費 API。**

一個 Google Apps Script（GAS），自動把全球重要總經事件寫入 Google Calendar：FOMC、BOE、ECB、BOJ 利率決議，以及美國 CPI/PPI/非農就業，全部集中在同一個月曆。

大多數總經月曆工具要嘛收費，要嘛需要手動更新。這個工具把所有免費的公開資料來源（各央行官網 + Finnhub 免費版）接在一起，並處理好各種細節：各時區的夏令時間換算、GAS 無法解析的 JS 渲染頁面、Finnhub 事件命名的非直覺規則。部署一次之後，完全自動運行。

## 涵蓋事件

| 事件 | 資料來源 |
|------|------|
| FOMC 利率決議 | Fed 官網（網頁解析） |
| FOMC 會議紀錄 | Finnhub API |
| BOE 利率決議 | 英格蘭銀行官網（網頁解析） |
| ECB 利率決議 | ECB 官網（網頁解析）+ 手動備援 |
| BOJ 利率決議 | 手動登記（官網為 JS 渲染，GAS 無法解析） |
| 美國 CPI / PPI / 非農就業 / 失業率 | Finnhub API |

腳本每天 21:00（台北時間）執行，同步未來 13 個月的事件。

---

## 方案 A：直接訂閱現有月曆

不需要任何設定，直接把公開月曆加入你的 Google 帳號。

**Google Calendar（網頁版）：**

[加入 Google Calendar](https://calendar.google.com/calendar/r?cid=55a4f43e580604a1dc84e794620385a01c4a127f30199bed4d3c66de4c87d5de%40group.calendar.google.com)

**iCal（Apple Calendar、Outlook 等）：**

```
https://calendar.google.com/calendar/ical/55a4f43e580604a1dc84e794620385a01c4a127f30199bed4d3c66de4c87d5de%40group.calendar.google.com/public/basic.ics
```

---

## 方案 B：自己部署一份

Fork 這個 repo，部署到你自己的 GAS 專案，可以新增自訂事件、更換顯示時區，或擴充其他央行的覆蓋範圍。

### 前置條件

- 一個 Google 帳號
- 一組免費的 [Finnhub](https://finnhub.io/) API Key（用於 US CPI/PPI/NFP 數據）
- [clasp](https://github.com/google/clasp)（選用，本地開發用）

### 設定步驟

**1. 建立 GAS 專案**

前往 [script.google.com](https://script.google.com/)，建立一個新專案。

**2. 貼上程式碼**

把 `economic_calendar.gs` 貼進編輯器。在「專案設定」中開啟「顯示 appsscript.json 資訊清單檔案」，再把 `appsscript.json` 貼進去。

**3. 設定指令碼屬性**

專案設定 → 指令碼屬性 → 新增以下兩個屬性：

| Key | Value |
|-----|-------|
| `FINNHUB_API_KEY` | 你的 Finnhub API Key |
| `REMINDER_EMAIL` | 你的信箱（每年 ECB/BOJ 年度更新提醒用） |

**4. 建立觸發器**

執行一次 `setupTrigger()`，之後腳本會每天 21:00 台北時間自動執行。

**5. 測試**

手動執行 `syncEconomicCalendar()` 確認設定正確。

### 新增自訂事件

編輯 `fetchHardcodedEvents()`，每筆格式如下：

```javascript
{ summary: '事件名稱', year: 2026, month: 6, day: 15, hour: 14, minute: 0, tz: 'America/New_York' }
```

`month` 為 1 起算（1 月 = 1）。`tz` 接受任何 IANA 時區字串。

### 搭配 clasp 本地開發

```bash
npm install -g @google/clasp
clasp login
clasp clone <你的 script ID>
# 本地修改檔案
clasp push
```

---

## 已知限制

- **Finnhub 免費版**：資料只提前 1-2 週。腳本每天跑，持續補齊即將到來的事件。
- **ECB 和 BOJ**：每年 10-11 月需手動更新下一年度行程，因為官網是 JS 渲染，GAS 無法解析。每年 11/15 會自動寄一封提醒信到 `REMINDER_EMAIL`。
- **BLS.gov**：封鎖 GAS IP，CPI/PPI 改由 Finnhub 提供。
- 時間以 UTC 儲存，在月曆中顯示為台北時間（UTC+8）。

---

## 貢獻

歡迎 Pull Request。若某個央行頁面改版導致解析失敗，請開 Issue 並附上新頁面連結。

## 授權

MIT
