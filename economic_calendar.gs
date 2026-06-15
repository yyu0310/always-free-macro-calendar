/**
 * 全球總經事件月曆 v1.1.6
 * 功能：從各央行官方網站抓取利率決議與美國總經數據發布日期，寫入 Google Calendar（台北時間）
 * 以 Google Apps Script 部署，每天 21:00（台北時間）自動執行
 *
 * v1.1.5→v1.1.6 修改：
 *   Finnhub CPI 匹配修正：Finnhub 將 CPI 命名為 "Inflation Rate MoM"，非 "Consumer Price Index"
 *   新增 FOMC Minutes（FOMC 會議紀錄）事件，Finnhub 命名為 "FOMC Minutes"
 */

const CALENDAR_NAME = 'Global Macro Calendar';

const MONTHS = {
  january:0, february:1, march:2, april:3, may:4, june:5,
  july:6, august:7, september:8, october:9, november:10, december:11
};
const MONTH_RE = 'January|February|March|April|May|June|July|August|September|October|November|December';

// ── 主入口 ──────────────────────────────────────────────────
function syncEconomicCalendar() {
  Logger.log('=== economic_calendar v1.1.6 START ===');
  const cal = getOrCreateCalendar();
  let created = 0, skipped = 0;

  const allEvents = [
    ...fetchFOMCEvents(),
    ...fetchFinnhubEvents(),
    ...fetchECBEvents(),
    ...fetchBOEEvents(),
    ...fetchBOJEvents(),
    ...fetchHardcodedEvents(),
  ];

  const now = new Date();
  const cutoff = new Date(now.getTime() + 395 * 24 * 3600000);
  const filtered = allEvents.filter(ev => ev.start >= now && ev.start <= cutoff);
  Logger.log(`共解析 ${allEvents.length} 筆，過濾後 ${filtered.length} 筆`);

  for (const ev of filtered) {
    if (createEventIfNotExists(cal, ev)) {
      created++;
      Logger.log(`[✓] ${ev.summary} → ${formatTaipei(ev.start)}`);
    } else {
      skipped++;
    }
  }

  Logger.log(`完成：新增 ${created} 筆，略過重複 ${skipped} 筆`);
  checkUpdateReminder();
  scheduleNextTrigger();
  Logger.log('=== economic_calendar v1.1.6 END ===');
}

// ── Finnhub 調試：確認總經事件（CPI/PPI/NFP/Minutes）可以抓多遠 ─
function debugFinnhubRange() {
  const key = PropertiesService.getScriptProperties().getProperty('FINNHUB_API_KEY');
  if (!key) { Logger.log('FINNHUB_API_KEY 未設定'); return; }

  const now  = new Date();
  const from = Utilities.formatDate(now, 'UTC', 'yyyy-MM-dd');
  const to   = Utilities.formatDate(new Date(now.getTime() + 400 * 86400000), 'UTC', 'yyyy-MM-dd');
  const url  = `https://finnhub.io/api/v1/calendar/economic?from=${from}&to=${to}&token=${key}`;

  const resp = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  const data = JSON.parse(resp.getContentText());
  const all  = data.economicCalendar || [];
  Logger.log(`Finnhub 回傳共 ${all.length} 筆（${from} ~ ${to}）`);

  const keywords = ['inflation rate mom', 'ppi mom', 'nonfarm payroll', 'unemployment rate', 'fomc minutes'];
  const hits = all.filter(e => {
    const n = (e.event || '').toLowerCase();
    return e.country === 'US' && e.impact === 'high' && keywords.some(k => n.includes(k));
  });
  Logger.log(`目標事件（CPI/PPI/NFP/失業率/Minutes）共 ${hits.length} 筆：`);
  hits.forEach(e => Logger.log(`  ${e.time}  ${e.event}`));
}

// ── Finnhub 調試：列出各國事件 ──────────────────────────────
function debugFinnhub() {
  const key = PropertiesService.getScriptProperties().getProperty('FINNHUB_API_KEY');
  if (!key) { Logger.log('FINNHUB_API_KEY 未設定'); return; }

  const now  = new Date();
  const from = Utilities.formatDate(now, 'UTC', 'yyyy-MM-dd');
  const to   = Utilities.formatDate(new Date(now.getTime() + 90 * 86400000), 'UTC', 'yyyy-MM-dd');
  const url  = `https://finnhub.io/api/v1/calendar/economic?from=${from}&to=${to}&token=${key}`;

  const resp = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  Logger.log(`Finnhub HTTP ${resp.getResponseCode()}`);
  const data = JSON.parse(resp.getContentText());
  const all  = data.economicCalendar || [];

  // 列出所有出現的 country codes
  const codes = [...new Set(all.map(e => e.country))].sort();
  Logger.log(`所有 country codes：${codes.join(', ')}`);

  // 找 ECB/歐洲相關（高影響）
  const ecbCandidates = all.filter(e => ['EU','EA','EUR','EZ','DE'].includes(e.country) && e.impact === 'high');
  Logger.log(`ECB 候選（高影響）：${ecbCandidates.length} 筆`);
  ecbCandidates.forEach(e => Logger.log(`  [${e.country}] ${e.time}  ${e.event}`));

  // 找 BOJ/日本相關（高影響）
  const bojCandidates = all.filter(e => e.country === 'JP' && e.impact === 'high');
  Logger.log(`BOJ 候選（高影響）：${bojCandidates.length} 筆`);
  bojCandidates.forEach(e => Logger.log(`  [${e.country}] ${e.time}  ${e.event}`));
}

// ── 替代來源測試 ─────────────────────────────────────────────
function debugAlternatives() {
  const candidates = [
    // ECB iCal 候選
    { name: 'ECB-home-calendar',    url: 'https://www.ecb.europa.eu/home/calendar/html/index.en.html' },
    { name: 'ECB-home-ical',        url: 'https://www.ecb.europa.eu/home/calendar/ical/index.en.ics' },
    { name: 'ECB-press-ical',       url: 'https://www.ecb.europa.eu/press/calendars/mgcgc/ical/index.en.ics' },
    { name: 'ECB-rss',              url: 'https://www.ecb.europa.eu/rss/press.en.rss' },
    // myfxbook
    { name: 'myfxbook-calendar',    url: 'https://www.myfxbook.com/forex-economic-calendar' },
    // Stooq
    { name: 'stooq-calendar',       url: 'https://stooq.com/t/?i=1' },
  ];
  for (const c of candidates) {
    try {
      const resp = fetchWithUA(c.url);
      const code = resp.getResponseCode();
      const preview = resp.getContentText().substring(0, 300).replace(/\s+/g, ' ');
      Logger.log(`[${code}] ${c.name}: ${preview}`);
    } catch (e) { Logger.log(`[ERR] ${c.name}: ${e}`); }
  }
}

// ── 調試用 ──────────────────────────────────────────────────
function debugPages() {
  const sources = [
    { name: 'FOMC', url: 'https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm' },
    { name: 'ECB-govcdec-2026', url: 'https://www.ecb.europa.eu/press/govcdec/mopo/2026/html/index.en.html' },
    { name: 'ECB-mgcgc',       url: 'https://www.ecb.europa.eu/press/calendars/mgcgc/html/index.en.html' },
    { name: 'BOE',  url: 'https://www.bankofengland.co.uk/monetary-policy/upcoming-mpc-dates' },
    { name: 'BOJ-mpmdeci', url: 'https://www.boj.or.jp/en/mopo/mpmdeci/index.htm' },
  ];
  for (const s of sources) {
    try {
      const resp = fetchWithUA(s.url);
      const code = resp.getResponseCode();
      Logger.log(`${s.name}: HTTP ${code}`);
      if (code === 200) {
        const text = stripHtml(resp.getContentText());
        Logger.log(`${s.name} text[0:2000]: ${text.substring(0, 2000)}`);
      }
    } catch (e) { Logger.log(`${s.name} error: ${e}`); }
  }
}

// ── HTTP 抓取 ────────────────────────────────────────────────
function fetchWithUA(url) {
  return UrlFetchApp.fetch(url, {
    muteHttpExceptions: true,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.5',
    }
  });
}

function stripHtml(html) {
  return html
    .replace(/="[^"]*"/g, '=""')
    .replace(/='[^']*'/g, "=''")
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g,   ' ')
    .replace(/&amp;/g,    '&')
    .replace(/&ndash;/g,  '–')
    .replace(/&mdash;/g,  '—')
    .replace(/&#8211;/g,  '–')
    .replace(/&#8212;/g,  '—')
    .replace(/&lt;/g,     '<')
    .replace(/&gt;/g,     '>')
    .replace(/\s+/g,      ' ');
}

// ── FOMC 利率決議 ──────────────────────────────────────────
function fetchFOMCEvents() {
  const events = [];
  try {
    const resp = fetchWithUA('https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm');
    const code = resp.getResponseCode();
    Logger.log(`FOMC fetch: HTTP ${code}`);
    if (code !== 200) return events;

    const html = resp.getContentText();
    const thisYear = new Date().getFullYear();

    const yearHeads = [];
    const patterns = [
      /class="(?:panel-title|fomc-meeting--[a-z-]*heading[a-z-]*)"[^>]*>([\s\S]*?)<\/[^>]+>/gi,
      /<h[234][^>]*>([\s\S]*?)<\/h[234]>/gi,
    ];
    for (const re of patterns) {
      let m;
      while ((m = re.exec(html)) !== null) {
        const ym = m[1].match(/\b(20(?:25|26|27|28))\b/);
        if (ym) {
          const yr = parseInt(ym[1]);
          if (!yearHeads.some(y => y.year === yr))
            yearHeads.push({ year: yr, pos: m.index });
        }
      }
      if (yearHeads.length > 0) break;
    }
    yearHeads.sort((a, b) => a.pos - b.pos);
    Logger.log(`FOMC 年份標題：${yearHeads.map(y => y.year).join(', ') || '(未找到)'}`);

    for (let i = 0; i < yearHeads.length; i++) {
      const { year, pos } = yearHeads[i];
      if (year < thisYear) continue;
      const endPos = i + 1 < yearHeads.length ? yearHeads[i + 1].pos : html.length;
      const text = stripHtml(html.substring(pos, endPos));
      const rangeRe = new RegExp(`(${MONTH_RE})\\s+(\\d{1,2})\\s*[-–—]\\s*(\\d{1,2})`, 'gi');
      let m;
      while ((m = rangeRe.exec(text)) !== null) {
        const month = MONTHS[m[1].toLowerCase()];
        const day   = parseInt(m[3]);
        if (month === undefined || isNaN(day) || day < 1 || day > 31) continue;
        const start = makeEventDate(year, month, day, 14, 0, 'America/New_York');
        if (!events.some(e => Math.abs(e.start.getTime() - start.getTime()) < 3600000))
          events.push({ summary: 'FOMC 利率決議', start, end: new Date(start.getTime() + 30 * 60000) });
      }
    }
    Logger.log(`FOMC 解析：${events.length} 筆`);
  } catch (e) { Logger.log(`FOMC error: ${e}`); }
  return events;
}

// ── Finnhub 經濟數據（CPI, PPI, NFP, 失業率）────────────────
function fetchFinnhubEvents() {
  const events = [];
  try {
    const key = PropertiesService.getScriptProperties().getProperty('FINNHUB_API_KEY');
    if (!key) { Logger.log('Finnhub: FINNHUB_API_KEY 未設定，略過 CPI/PPI/NFP'); return events; }

    const now  = new Date();
    const from = Utilities.formatDate(now, 'UTC', 'yyyy-MM-dd');
    const to   = Utilities.formatDate(new Date(now.getTime() + 400 * 86400000), 'UTC', 'yyyy-MM-dd');
    const url  = `https://finnhub.io/api/v1/calendar/economic?from=${from}&to=${to}&token=${key}`;

    const resp = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    const code = resp.getResponseCode();
    Logger.log(`Finnhub fetch: HTTP ${code}`);
    if (code !== 200) {
      Logger.log(`Finnhub 失敗：${resp.getContentText().substring(0, 200)}`);
      return events;
    }

    const data     = JSON.parse(resp.getContentText());
    const calendar = data.economicCalendar || [];

    // 匹配規則：Finnhub event name (小寫) → 日曆顯示名稱
    // 注意：Finnhub 將 CPI 命名為 "Inflation Rate MoM"（high），"Consumer Price Index" 不存在
    const TARGET = [
      { match: 'inflation rate mom',   label: 'US CPI 物價指數' },   // Finnhub 實際命名
      { match: 'consumer price index', label: 'US CPI 物價指數' },   // 備用
      { match: 'ppi mom',              label: 'US PPI 生產者物價' }, // Finnhub 實際命名
      { match: 'producer price index', label: 'US PPI 生產者物價' }, // 備用
      { match: 'nonfarm payroll',      label: 'US 非農就業 NFP' },
      { match: 'non-farm payroll',     label: 'US 非農就業 NFP' },
      { match: 'unemployment rate',    label: 'US 失業率' },
      { match: 'fomc minutes',         label: 'FOMC 會議紀錄' },     // NEW v1.1.6
    ];

    for (const item of calendar) {
      if (item.country !== 'US') continue;
      if (item.impact  !== 'high') continue;

      const nameLower = (item.event || '').toLowerCase();
      let label = null;
      for (const t of TARGET) {
        if (nameLower.includes(t.match)) { label = t.label; break; }
      }
      if (!label) continue;

      // Finnhub time 為 UTC：格式 "YYYY-MM-DD HH:MM:SS" 或 "YYYY-MM-DD"
      let start;
      if (item.time && item.time.includes(' ')) {
        start = new Date(item.time.replace(' ', 'T') + 'Z');
      } else {
        // 只有日期時，預設 ET 08:30（美國主要數據慣例）
        const parts = (item.time || '').split('-').map(Number);
        if (parts.length < 3 || parts.some(isNaN)) continue;
        start = makeEventDate(parts[0], parts[1] - 1, parts[2], 8, 30, 'America/New_York');
      }

      if (isNaN(start.getTime())) continue;

      // 同標題同小時視為重複
      if (!events.some(e => e.summary === label && Math.abs(e.start - start) < 3600000))
        events.push({ summary: label, start, end: new Date(start.getTime() + 30 * 60000) });
    }

    Logger.log(`Finnhub 解析：${events.length} 筆（CPI/PPI/NFP/失業率）`);
  } catch (e) { Logger.log(`Finnhub error: ${e}`); }
  return events;
}

// ── ECB 利率決議 ──────────────────────────────────────────
function fetchECBEvents() {
  const events = [];
  const thisYear = new Date().getFullYear();
  const urls = [
    `https://www.ecb.europa.eu/press/govcdec/mopo/${thisYear}/html/index.en.html`,
    `https://www.ecb.europa.eu/press/govcdec/mopo/${thisYear+1}/html/index.en.html`,
    'https://www.ecb.europa.eu/press/calendars/mgcgc/html/index.en.html',
    'https://www.ecb.europa.eu/press/govcdec/mopo/html/index.en.html',
  ];

  const addECB = (day, month, year) => {
    if (month===undefined||isNaN(day)||isNaN(year)||year<thisYear) return;
    const start = makeEventDate(year,month,day,14,15,'Europe/Berlin');
    if (!events.some(e=>Math.abs(e.start-start)<3600000))
      events.push({ summary:'ECB 利率決議', start, end:new Date(start.getTime()+30*60000) });
  };

  for (const url of urls) {
    try {
      const resp = fetchWithUA(url);
      const code = resp.getResponseCode();
      Logger.log(`ECB fetch ${url.split('/').slice(-4).join('/')}: HTTP ${code}`);
      if (code !== 200) continue;

      const html  = resp.getContentText();
      const text  = stripHtml(html);
      const now   = new Date();

      let m;

      // 格式 A：Month DD-DD, YYYY（取最後一天為決策日）
      const rA = new RegExp(`(${MONTH_RE})\\s+(\\d{1,2})[-–](\\d{1,2}),?\\s+(20\\d\\d)`,'gi');
      while ((m = rA.exec(text)) !== null)
        addECB(parseInt(m[3]), MONTHS[m[1].toLowerCase()], parseInt(m[4]));

      // 格式 B：DD Month YYYY（單日，含年份）
      const rB = new RegExp(`(\\d{1,2})\\s+(${MONTH_RE})\\s+(20\\d\\d)`,'gi');
      while ((m = rB.exec(text)) !== null)
        addECB(parseInt(m[1]), MONTHS[m[2].toLowerCase()], parseInt(m[3]));

      // 格式 C：DD Month（無年份，推算）
      const rC = new RegExp(`(\\d{1,2})\\s+(${MONTH_RE})(?!\\s+20)`,'gi');
      while ((m = rC.exec(text)) !== null) {
        const dy=parseInt(m[1]),mo=MONTHS[m[2].toLowerCase()];
        if (mo===undefined||isNaN(dy)) continue;
        let yr=thisYear;
        if (mo<now.getMonth()||(mo===now.getMonth()&&dy<now.getDate())) yr=thisYear+1;
        addECB(dy,mo,yr);
      }

      if (events.length >= 4) break;
    } catch (e) { Logger.log(`ECB fetch error: ${e}`); }
  }
  Logger.log(`ECB 解析：${events.length} 筆`);
  return events;
}

// ── BOE 利率決議 ──────────────────────────────────────────
function fetchBOEEvents() {
  const events = [];
  try {
    const resp = fetchWithUA('https://www.bankofengland.co.uk/monetary-policy/upcoming-mpc-dates');
    const code = resp.getResponseCode();
    Logger.log(`BOE fetch: HTTP ${code}`);
    if (code !== 200) return events;

    const text    = stripHtml(resp.getContentText());
    const thisYear = new Date().getFullYear();
    const now     = new Date();
    const seen    = new Set();

    const addBOE = (day, month, year) => {
      if (month===undefined||isNaN(day)||year<thisYear) return;
      const start = makeEventDate(year,month,day,12,0,'Europe/London');
      const key   = Math.round(start.getTime()/3600000);
      if (seen.has(key)) return;
      seen.add(key);
      events.push({ summary:'BOE 利率決議', start, end:new Date(start.getTime()+30*60000) });
    };

    for (const m of [...text.matchAll(new RegExp(`(\\d{1,2})(?:\\s+to\\s+|\\s*[-–—]\\s*)(\\d{1,2})\\s+(${MONTH_RE})\\s+(20\\d\\d)`,'gi'))])
      addBOE(parseInt(m[2]),MONTHS[m[3].toLowerCase()],parseInt(m[4]));
    for (const m of [...text.matchAll(new RegExp(`(\\d{1,2})\\s+(${MONTH_RE})\\s+(20\\d\\d)`,'gi'))])
      addBOE(parseInt(m[1]),MONTHS[m[2].toLowerCase()],parseInt(m[3]));
    for (const m of [...text.matchAll(new RegExp(`(\\d{1,2})\\s+(${MONTH_RE})(?!\\s+20)`,'gi'))]) {
      const dy=parseInt(m[1]),mo=MONTHS[m[2].toLowerCase()];
      if (mo===undefined||isNaN(dy)) continue;
      let yr=thisYear;
      if (mo<now.getMonth()||(mo===now.getMonth()&&dy<now.getDate())) yr=thisYear+1;
      addBOE(dy,mo,yr);
    }

    events.sort((a,b) => a.start - b.start);
    for (let i = events.length - 1; i >= 0; i--) {
      const hasLater = events.some((o,j) =>
        j !== i && o.start > events[i].start && o.start - events[i].start <= 25 * 3600000
      );
      if (hasLater) {
        Logger.log(`BOE 移除首日：${formatTaipei(events[i].start)}`);
        events.splice(i, 1);
      }
    }

    Logger.log(`BOE 解析（去重後）：${events.length} 筆`);
  } catch (e) { Logger.log(`BOE error: ${e}`); }
  return events;
}

// ── 手動登記事件（截圖解析後填入）────────────────────────────
// 更新方式：截圖 investing.com ECB/BOJ 行程 → 貼給 Claude → 更新此陣列 → clasp push
function fetchHardcodedEvents() {
  const RAW = [
    // 格式：{ summary, year, month(1-12), day, hour, minute, tz }
    // 來源：ECB mgcgc calendar page、BOJ mpmsche_minu index
    // 更新頻率：每年 ECB/BOJ 公布下年度行程時更新一次（通常 10~11 月）

    // ECB 利率決議 2026（決策日 = 第二天，14:15 CET）
    { summary: 'ECB 利率決議', year: 2026, month:  6, day: 11, hour: 14, minute: 15, tz: 'Europe/Berlin' },
    { summary: 'ECB 利率決議', year: 2026, month:  7, day: 23, hour: 14, minute: 15, tz: 'Europe/Berlin' },
    { summary: 'ECB 利率決議', year: 2026, month:  9, day: 10, hour: 14, minute: 15, tz: 'Europe/Berlin' },
    { summary: 'ECB 利率決議', year: 2026, month: 10, day: 29, hour: 14, minute: 15, tz: 'Europe/Berlin' },
    { summary: 'ECB 利率決議', year: 2026, month: 12, day: 17, hour: 14, minute: 15, tz: 'Europe/Berlin' },

    // BOJ 利率決議 2026（mpmsche_minu/index.htm 為 JS 渲染，GAS 無法解析，改用手動資料）
    { summary: 'BOJ 利率決議', year: 2026, month:  6, day: 16, hour: 11, minute:  0, tz: 'Asia/Tokyo' },
    { summary: 'BOJ 利率決議', year: 2026, month:  7, day: 31, hour: 11, minute:  0, tz: 'Asia/Tokyo' },
    { summary: 'BOJ 利率決議', year: 2026, month:  9, day: 18, hour: 11, minute:  0, tz: 'Asia/Tokyo' },
    { summary: 'BOJ 利率決議', year: 2026, month: 10, day: 30, hour: 11, minute:  0, tz: 'Asia/Tokyo' },
    { summary: 'BOJ 利率決議', year: 2026, month: 12, day: 18, hour: 11, minute:  0, tz: 'Asia/Tokyo' },
  ];
  return RAW.map(r => {
    const start = makeEventDate(r.year, r.month - 1, r.day, r.hour, r.minute, r.tz);
    return { summary: r.summary, start, end: new Date(start.getTime() + 30 * 60000) };
  });
}

// ── BOJ 利率決議（mpmsche_minu/index.htm 行程頁）────────────
// 格式：January 22-23 → 取最後一天（決策日），時間 11:00 JST
function fetchBOJEvents() {
  const events = [];
  const thisYear = new Date().getFullYear();
  try {
    const resp = fetchWithUA('https://www.boj.or.jp/en/mopo/mpmsche_minu/index.htm');
    const code = resp.getResponseCode();
    Logger.log(`BOJ schedule fetch: HTTP ${code}`);
    if (code !== 200) { Logger.log('BOJ schedule 無法取得'); return events; }

    const text = stripHtml(resp.getContentText());

    // 找年份位置，用來判斷每筆日期屬於哪一年
    const yearPos = [];
    let ym;
    const yearRe = /\b(20(?:25|26|27|28))\b/g;
    while ((ym = yearRe.exec(text)) !== null)
      yearPos.push({ year: parseInt(ym[1]), pos: ym.index });

    // 抓 "Month DD-DD"（兩天範圍），取最後一天為決策日
    const rangeRe = new RegExp(`(${MONTH_RE})\\s+(\\d{1,2})[-–](\\d{1,2})`, 'gi');
    let m;
    while ((m = rangeRe.exec(text)) !== null) {
      const mo = MONTHS[m[1].toLowerCase()];
      const dy = parseInt(m[3]);
      if (mo === undefined || isNaN(dy)) continue;
      let yr = thisYear;
      for (const yp of yearPos) { if (yp.pos <= m.index && yp.year >= thisYear) yr = yp.year; }
      const start = makeEventDate(yr, mo, dy, 11, 0, 'Asia/Tokyo');
      if (!events.some(e => Math.abs(e.start - start) < 3600000))
        events.push({ summary: 'BOJ 利率決議', start, end: new Date(start.getTime() + 30 * 60000) });
    }

    Logger.log(`BOJ schedule 解析：${events.length} 筆（頁面為 JS 渲染，預期 0）`);
  } catch (e) { Logger.log(`BOJ schedule error: ${e}`); }
  return events;
}

// ── 時區換算 ────────────────────────────────────────────────
function makeEventDate(year, month, day, hour, minute, tzid) {
  const approxUTC = Date.UTC(year, month, day, hour, minute, 0);
  try {
    const localStr = new Date(approxUTC).toLocaleString('en-US', { timeZone: tzid });
    const offsetMs = approxUTC - new Date(localStr + ' UTC').getTime();
    return new Date(approxUTC + offsetMs);
  } catch (e) {
    Logger.log(`makeEventDate tz error (${tzid}): ${e}`);
    return new Date(approxUTC);
  }
}

function formatTaipei(date) {
  return date.toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' });
}

// ── 日曆取得 / 建立 ─────────────────────────────────────────
function getOrCreateCalendar() {
  const existing = CalendarApp.getCalendarsByName(CALENDAR_NAME);
  if (existing.length > 0) return existing[0];
  const cal = CalendarApp.createCalendar(CALENDAR_NAME);
  cal.setColor(CalendarApp.Color.CYAN);
  return cal;
}

// ── 防重複建立 ──────────────────────────────────────────────
function createEventIfNotExists(cal, ev) {
  const dayStart = new Date(ev.start); dayStart.setHours(0,0,0,0);
  const dayEnd   = new Date(ev.start); dayEnd.setHours(23,59,59,999);
  for (const e of cal.getEvents(dayStart, dayEnd)) {
    if (e.getTitle() === ev.summary) return false;
  }
  const end = ev.end || new Date(ev.start.getTime() + 30*60000);
  cal.createEvent(ev.summary, ev.start, end, { description: ev.description || '' });
  return true;
}

// ── 清除所有日曆事件（debug 用）──────────────────────────────
function clearAllEvents() {
  const cal = getOrCreateCalendar();
  const evs = cal.getEvents(new Date('2026-01-01'), new Date('2028-12-31'));
  evs.forEach(e => e.deleteEvent());
  Logger.log(`已清除 ${evs.length} 筆事件`);
}

// ── ECB/BOJ 年度更新提醒（每年 11/15 寄信）──────────────────
// 收件地址存於指令碼屬性：REMINDER_EMAIL
function checkUpdateReminder() {
  const now   = new Date();
  const month = now.getMonth() + 1;
  const day   = now.getDate();
  if (month !== 11 || day !== 15) return;

  const email = PropertiesService.getScriptProperties().getProperty('REMINDER_EMAIL');
  if (!email) { Logger.log('REMINDER_EMAIL 未設定，跳過年度更新提醒'); return; }

  const nextYear = now.getFullYear() + 1;
  MailApp.sendEmail({
    to: email,
    subject: `[Global Macro Calendar] Please update ${nextYear} ECB/BOJ schedule`,
    body:
      `ECB and BOJ typically publish their full schedule for the following year in October-November.\n\n` +
      `To update, open Claude Code and say:\n` +
      `"Help me update the Global Macro Calendar ECB and BOJ schedule for ${nextYear}"\n\n` +
      `Claude will fetch the dates via WebFetch, update fetchHardcodedEvents(), and clasp push.\n\n` +
      `-- Auto reminder by Global Macro Calendar`
  });
  Logger.log(`✉ ECB/BOJ annual update reminder sent to ${email}`);
}

// ── Trigger 管理 ─────────────────────────────────────────────
function scheduleNextTrigger() {
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'syncEconomicCalendar')
    .forEach(t => ScriptApp.deleteTrigger(t));

  const next = new Date();
  next.setDate(next.getDate() + 1);
  next.setHours(21, 0, 0, 0);

  ScriptApp.newTrigger('syncEconomicCalendar')
    .timeBased()
    .at(next)
    .create();

  Logger.log('下次執行已排定：' + next);
}

// 執行一次即可，之後由自排接力
function setupTrigger() {
  scheduleNextTrigger();
  Logger.log('Trigger 已建立：每天 21:00 執行');
}

function removeTrigger() {
  let removed = 0;
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction() === 'syncEconomicCalendar') { ScriptApp.deleteTrigger(t); removed++; }
  });
  Logger.log(`已刪除 ${removed} 個 trigger`);
}
