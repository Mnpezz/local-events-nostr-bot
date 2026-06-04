# NOLA Nostr Bot (Node.js)

A bot that scrapes events from [nola.show](https://www.nola.show/) and publishes them as Nostr events using NIP-52 format, making them compatible with clients like [Plektos](https://github.com/derekross/plektos).

## Features

- 🎯 **Automatic Event Scraping**: Scrapes events from the nola.show JSON API.
- 📅 **NIP-52 Compatible**: Creates calendar events that work with Plektos and other Nostr clients.
- 🔄 **Scheduled Updates**: Automatically runs every 6 hours using `node-cron`.
- 🚀 **Modern Stack**: Built with Node.js, `nostr-tools`, and `node-fetch`.

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

## Usage

You can run the bot in two modes. 

**Run Continuously as a Daemon**
This will start the bot and schedule it to run immediately, and then every 6 hours thereafter.
```bash
npm start
```
*(You may want to run this using a process manager like `pm2` or `forever` in production).*

**Run Once (Dry Run / Testing)**
This will execute the scraper, attempt to publish to the configured relays, and then exit immediately.
```bash
node index.js --once
```

## Event Format

Events are published using the NIP-52 calendar event format:

```json
{
  "kind": 31922,
  "content": "Event from nola.show\nPrice: $10",
  "tags": [
    ["d", "event-name-venue-slug"],
    ["location", "Venue Name"],
    ["price", "$10"],
    ["source", "nola.show"],
    ["start", "1704142800"],
    ["name", "Event Name"]
  ]
}
```

## Adding Custom Sources

You can easily adapt this bot to scrape and publish events from other websites or APIs. 

### 1. Event Data Schema

Any scraper you build should output a list of event objects following this structure:

```javascript
{
  name: "Event Name",             // Name of the event (required)
  venue: "Venue Name",            // Venue name or location description (required)
  datetime: "2026-06-13T21:00:00Z",// ISO 8601 string in UTC or with timezone (required)
  price: "Tickets: $15, Door: $25",// Price description (optional)
  url: "https://eventbrite.com/...",// Link to tickets or detail page (optional)
  latitude: 29.944186,            // Latitude coordinate (optional)
  longitude: -90.065689,          // Longitude coordinate (optional)
  source: "my-custom-source"      // Identifier of the data source (optional)
}
```

### 2. Hooking Up Your Scraper

1. Create a scraper file (e.g., `my_scraper.js`) that exports an async function returning an array of the event objects above.
2. In `index.js`, import your custom scraper and run it:
   ```javascript
   import { scrapeMyEvents } from './my_scraper.js';
   // ...
   const customEvents = await scrapeMyEvents();
   ```
3. Loop through the events and publish them using `publishEvent(event)` from `./nostr.js`:
   ```javascript
   import { publishEvent } from './nostr.js';
   // ...
   for (const event of customEvents) {
       await publishEvent(event);
   }
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

## License
MIT

