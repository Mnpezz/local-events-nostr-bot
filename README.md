# Multi-City Nostr Event Bot (Node.js)

A modular, extensible bot that scrapes local events from multiple cities/sources (currently supporting **New Orleans** and **Nashville**) and publishes them as Nostr events using the NIP-52 calendar format. This makes them fully compatible with calendar clients like [Plektos](https://github.com/derekross/plektos).

This repository is designed to be a public example. You can easily fork it, add a scraper plugin for your own city, and start your own regional events bot!

---

## Features

- 🏙️ **Multi-City Architecture**: Support for multiple scraper plugins running in parallel.
- 🎯 **Automatic Event Scraping**:
  - **New Orleans**: Fetches JSON API events from [nola.show](https://www.nola.show/).
  - **Nashville**: Scrapes and parses HTML calendar listings from [nashvillego.com](https://nashvillego.com/calendar) using Cheerio.
- 📅 **NIP-52 Compatible**: Creates Time-Based Calendar Events (`kind: 31923`) that display beautifully on Nostr calendar clients.
- 🏷️ **Dynamic Tagging**: Automatically applies city-specific hashtags (e.g., `#nola`, `#nashville`, `#musiccity`) and geohash coordinates.
- 🔄 **Scheduled Updates**: Runs every 6 hours automatically via `node-cron`.
- 🚀 **Modern Stack**: Built with Node.js, `nostr-tools`, `cheerio`, and `node-fetch`.

---

## Installation

1. Ensure you have Node.js 18+ installed.
2. Clone the repository and install dependencies:
   ```bash
   npm install
   ```
3. Copy the environment file and configure your Nostr settings:
   ```bash
   cp env.example .env
   ```

### Configuration (`.env`)

- `NOSTR_PRIVATE_KEY`: Your Nostr private key (hex string) for signing events.
- `NOSTR_RELAYS`: Comma-separated list of Nostr relays to publish to (defaults to `wss://relay.damus.io,wss://relay.snort.social`).

---

## Usage

You can run the bot in two modes:

**Run Once (Dry Run / Testing)**
This executes all scrapers, attempts to publish new/updated events to the configured relays, and then exits immediately.
```bash
npm test
```
*(equivalent to running `node index.js --once`)*

**Run Continuously as a Daemon**
This starts the bot, runs it immediately, and schedules it to run every 6 hours thereafter.
```bash
npm start
```
*(For production deployments, running this under a process manager like `pm2` or `forever` is recommended).*

---

## Architecture & Directory Structure

The bot separates concerns between data ingestion (scraping), coordination, and publishing:

```text
├── index.js              # Entrypoint (manages scheduler / run-once flags)
├── scraper.js            # Coordinator (aggregates all city scrapers)
├── scrapers/             # Directory containing scraper plugins
│   ├── nola_show.js      # New Orleans API scraper
│   └── nashville_go.js   # Nashville Cheerio HTML scraper
├── nostr.js              # Nostr client logic (NIP-52 publishing)
├── venue_images.json     # Mapping of venues to official image/logo URLs
└── scripts/              # Independent test and profile management scripts
```

---

## Adding Custom Cities & Scraper Plugins

To add a new city or calendar source:

### 1. Build Your Scraper
Create a new file in the `scrapers/` directory (e.g., `scrapers/chicago_events.js`). It must export an async function named `scrapeEvents` returning an array of objects matching this schema:

```javascript
{
  name: "Event Name",             // Name of the event (required)
  venue: "Venue Name",            // Venue name or location description (required)
  datetime: "2026-06-13T21:00:00Z",// ISO 8601 string in UTC (required)
  price: "Tickets: $15",          // Price description (optional)
  url: "https://site.com/tickets",// Link to tickets or detail page (optional)
  latitude: 41.8781,              // Latitude coordinate (optional)
  longitude: -87.6298,            // Longitude coordinate (optional)
  source: "chicagoevents.com",    // Identifier of the data source (optional)
  tags: ["chicago", "music", "events"] // Custom hashtags for Nostr (optional)
}
```

### 2. Register Your Scraper
Import and run your scraper in `scraper.js`:

```javascript
import { scrapeEvents as scrapeChicago } from './scrapers/chicago_events.js';

export async function scrapeEvents() {
    console.log("Starting multi-city event scraping...");
    const nolaEvents = await scrapeNola();
    const nashvilleEvents = await scrapeNashville();
    const chicagoEvents = await scrapeChicago(); // 1. Run your new scraper
    
    const combinedEvents = [
        ...nolaEvents,
        ...nashvilleEvents,
        ...chicagoEvents // 2. Add events to the aggregate list
    ];
    
    combinedEvents.sort((a, b) => new Date(a.datetime).getTime() - new Date(b.datetime).getTime());
    return combinedEvents;
}
```

### 3. Add Venue Images (Optional)
If you want events at specific venues to have distinct images on Nostr clients, add them to `venue_images.json`:
```json
"House of Blues Chicago": "https://url-to-logo.png"
```

---

## Utility & Helper Scripts

The `scripts/` directory contains helper tools for managing the bot and verifying its Nostr settings:

- **`publish_profile.js`**: Publishes the bot's metadata (name, picture, banner, description) as a Nostr `kind:0` event. Run this once before running the bot so clients can index the profile properly.
- **`test_pub.js`**: Reads `NOSTR_PRIVATE_KEY` from `.env` and prints the corresponding public key. Use this to verify key decoding.
- **`test_publish.js`**: Publishes a test text note (`kind:1`) to relays to verify you can write successfully.
- **`test_fetch.js`**: Queries configured relays for `kind:31924` calendar events authored by the bot's public key.
- **`test_listen.js`**: Subscribes to the relays and listens to live events authored by the bot.
- **`test_summary.js`**: Sends a manual test summary note (`kind:1`) listing the count of updated/added events.
- **`test-damus.js`**: Publishes a test time-based calendar event (`kind:31923`) directly to the Damus relay.

*To run these scripts, execute them from the root directory, e.g.:*
```bash
node scripts/publish_profile.js
```

---

## License
MIT
