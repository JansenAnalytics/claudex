---
name: calendar-manager
description: "Read and manage Google Calendar events: list upcoming, create events, check availability, send reminders."
---

# calendar-manager

Read and manage Google Calendar events: list upcoming, create events, check availability, send reminders.

## When to Use

- Checking calendar for upcoming events
- Creating new calendar events
- Finding free time slots / checking availability
- Parsing .ics (iCalendar) files
- Setting up meeting reminders
- Integrating calendar with other workflows

## Scripts

### `scripts/gcal-helper.py`

Google Calendar API helper — list events, check availability.

```bash
# List upcoming events (dry-run with sample data)
python3 scripts/gcal-helper.py --dry-run --list --days 7

# List events (live, requires credentials.json)
python3 scripts/gcal-helper.py --list --days 3

# Check availability for a date range
python3 scripts/gcal-helper.py --dry-run --free --date 2026-03-10 --duration 60
```

**Requires:** `credentials.json` from Google Cloud Console for live mode.

### `scripts/event-creator.py`

Create Google Calendar events.

```bash
# Create event (dry-run)
python3 scripts/event-creator.py --dry-run --title "Team Standup" \
  --start "2026-03-10T09:00:00" --end "2026-03-10T09:30:00" \
  --attendees "alice@example.com,bob@example.com"

# Create event (live)
python3 scripts/event-creator.py --title "Lunch" --start "2026-03-10T12:00:00" --end "2026-03-10T13:00:00"
```

### `scripts/ical-parser.py`

Parse .ics files and extract event details.

```bash
# Parse an .ics file
python3 scripts/ical-parser.py path/to/calendar.ics

# Parse from stdin
cat meeting.ics | python3 scripts/ical-parser.py -

# Dry-run with built-in sample
python3 scripts/ical-parser.py --dry-run
```

## References

- `references/gcal-api-quickstart.md` — Google Calendar API setup guide
- `references/oauth2-setup.md` — OAuth2 configuration for Google APIs
- `references/ical-format.md` — iCalendar format reference

## Requirements

- Python 3.8+
- No pip dependencies for ical-parser (stdlib only)
- Google Calendar API scripts need `google-api-python-client`, `google-auth-oauthlib` for live mode
- Dry-run mode works without any dependencies

## Security Notes

- Store OAuth credentials securely; never commit `token.json` or `credentials.json`
- Use read-only scopes when only listing events
- Calendar API scopes: `https://www.googleapis.com/auth/calendar.readonly` (read) or `https://www.googleapis.com/auth/calendar` (read/write)
