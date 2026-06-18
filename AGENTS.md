# CLAUDE.md

This is a Google Apps Script project that syncs global macro economic events to Google Calendar.

## Entry point

`syncEconomicCalendar()` in `economic_calendar.gs` is the main function. It calls all fetch functions, filters events to the next 13 months, deduplicates, and writes to the calendar.

## Architecture

| Function | What it does |
|----------|-------------|
| `fetchFOMCEvents()` | Scrapes the Fed HTML page for FOMC meeting dates |
| `fetchFinnhubEvents()` | Calls Finnhub API for US CPI/PPI/NFP/Unemployment/FOMC Minutes |
| `fetchECBEvents()` | Scrapes ECB HTML (multiple URL fallbacks, partial coverage) |
| `fetchBOEEvents()` | Scrapes BOE HTML for MPC dates |
| `fetchBOJEvents()` | Attempts BOJ scrape — always returns 0 due to JS rendering |
| `fetchHardcodedEvents()` | Manually maintained array of ECB/BOJ dates |
| `makeEventDate()` | Converts local time to UTC using the `Intl` API |
| `createEventIfNotExists()` | Checks for an existing same-title event before creating |
| `checkUpdateReminder()` | Sends an annual reminder email on November 15 |
| `scheduleNextTrigger()` | Deletes existing trigger and reschedules for next day 21:00 |

## Key design decisions

- **Hardcoded ECB/BOJ dates**: The official schedule pages use JavaScript rendering. GAS `UrlFetchApp` cannot execute JavaScript, so ECB/BOJ dates are maintained manually in `fetchHardcodedEvents()`. Update this array once a year in October-November.
- **Daily trigger with self-rescheduling**: Finnhub free tier only provides data ~1-2 weeks ahead. The script runs daily and continuously fills in upcoming events. `scheduleNextTrigger()` deletes the existing trigger and creates a new one for tomorrow 21:00 — this avoids trigger accumulation.
- **Duplicate prevention**: `createEventIfNotExists()` checks if any event with the same title already exists on that day before writing.
- **Timezone handling**: `makeEventDate()` uses `Intl` API to handle DST correctly across all central bank timezones (New York, London, Berlin, Tokyo).

## Script Properties required

| Key | Purpose |
|-----|---------|
| `FINNHUB_API_KEY` | Finnhub API access for US macro data |
| `REMINDER_EMAIL` | Annual ECB/BOJ update reminder recipient |

## Yearly maintenance

Each October-November, update `fetchHardcodedEvents()` with the next year's ECB and BOJ dates. Then `clasp push` to deploy.

To get the new dates: ask Claude to `WebFetch` the ECB Governing Council decisions page and the BOJ MPM schedule page, then update the `RAW` array in `fetchHardcodedEvents()`.

## Debug functions

- `debugFinnhubRange()`: shows how far ahead Finnhub has data
- `debugFinnhub()`: lists all events by country code
- `debugAlternatives()`: tests alternative data source URLs
- `debugPages()`: fetches each central bank page and logs the first 2000 characters
- `clearAllEvents()`: deletes all calendar events (use for reset during testing)
