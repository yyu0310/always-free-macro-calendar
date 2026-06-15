# Global Macro Calendar

[繁體中文](README.zh-TW.md) | [简体中文](README.zh-CN.md)

**Fully automated. Zero cost. No paid APIs.**

A Google Apps Script (GAS) that tracks global macro events and writes them to Google Calendar automatically — FOMC, BOE, ECB, BOJ decisions and US CPI/PPI/NFP releases, all in one place.

Most macro calendar tools either cost money or require manual updates. This one stitches together free public data sources (central bank websites + Finnhub free tier) and handles all the edge cases — daylight saving time across timezones, JS-rendered pages that APIs can't parse, and Finnhub's non-obvious event naming conventions. Once deployed, it runs on its own.

## Events covered

| Event | Source |
|-------|--------|
| FOMC rate decision | Fed website (scraped) |
| FOMC meeting minutes | Finnhub API |
| BOE rate decision | Bank of England website (scraped) |
| ECB rate decision | ECB website (scraped) + hardcoded fallback |
| BOJ rate decision | Hardcoded (JS-rendered page, not parseable by GAS) |
| US CPI / PPI / NFP / Unemployment Rate | Finnhub API |

The script runs daily at 21:00 Taiwan time and syncs events up to 13 months ahead.

---

## Option A: Subscribe to the existing calendar

No setup required. Just add the public Google Calendar to your account.

**Google Calendar (web):**

[Add to Google Calendar](https://calendar.google.com/calendar/r?cid=55a4f43e580604a1dc84e794620385a01c4a127f30199bed4d3c66de4c87d5de%40group.calendar.google.com)

**iCal (Apple Calendar, Outlook, etc.):**

```
https://calendar.google.com/calendar/ical/55a4f43e580604a1dc84e794620385a01c4a127f30199bed4d3c66de4c87d5de%40group.calendar.google.com/public/basic.ics
```

---

## Option B: Deploy your own

Fork this repo and deploy to your own GAS project. You can add custom events, change the display timezone, or extend coverage to other central banks.

### Prerequisites

- A Google account
- A free [Finnhub](https://finnhub.io/) API key (for US CPI/PPI/NFP data)
- [clasp](https://github.com/google/clasp) installed (optional, for local development)

### Setup

**1. Create a GAS project**

Go to [script.google.com](https://script.google.com/) and create a new project.

**2. Add the script**

Paste `economic_calendar.gs` into the editor. In Project Settings, enable "Show appsscript.json manifest file," then paste `appsscript.json` into the manifest editor.

**3. Set Script Properties**

Project Settings → Script Properties → Add the following:

| Key | Value |
|-----|-------|
| `FINNHUB_API_KEY` | Your Finnhub API key |
| `REMINDER_EMAIL` | Your email (for the annual ECB/BOJ update reminder) |

**4. Initialize the trigger**

Run `setupTrigger()` once. The script will self-schedule to run daily at 21:00 Taiwan time going forward.

**5. Test**

Run `syncEconomicCalendar()` manually to verify the setup.

### Adding custom events

Edit `fetchHardcodedEvents()`. Each entry follows this format:

```javascript
{ summary: 'Event Name', year: 2026, month: 6, day: 15, hour: 14, minute: 0, tz: 'America/New_York' }
```

`month` is 1-indexed (January = 1). `tz` accepts any IANA timezone string.

### Local development with clasp

```bash
npm install -g @google/clasp
clasp login
clasp clone <your-script-id>
# edit files locally
clasp push
```

---

## Known limitations

- **Finnhub free tier** provides event data roughly 1-2 weeks in advance. The daily trigger continuously fills in upcoming events as they become available.
- **ECB and BOJ** dates require a manual update each October-November. Their schedule pages use JavaScript rendering that GAS cannot parse. A reminder email goes out on November 15 each year to the address in `REMINDER_EMAIL`.
- **BLS.gov** blocks GAS IP addresses, so the script cannot scrape CPI/PPI data directly.
- Times are stored in UTC and displayed in Taipei time (UTC+8) in the calendar.

---

## Contributing

Pull requests are welcome. If a central bank page changes its HTML structure and breaks parsing, open an issue with a link to the new page.

## License

MIT
