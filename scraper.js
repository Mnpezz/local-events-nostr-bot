import { scrapeEvents as scrapeNola } from './scrapers/nola_show.js';
import { scrapeEvents as scrapeNashville } from './scrapers/nashville_go.js';

/**
 * Aggregates event scraping results from all active city/website scrapers.
 * @returns {Promise<Array>} List of combined event objects.
 */
export async function scrapeEvents() {
    console.log("Starting multi-city event scraping...");

    const nolaEvents = await scrapeNola();
    const nashvilleEvents = await scrapeNashville();

    const combinedEvents = [...nolaEvents, ...nashvilleEvents];

    // Sort combined events by date
    combinedEvents.sort((a, b) => new Date(a.datetime).getTime() - new Date(b.datetime).getTime());

    console.log(`Aggregation complete: Scraped a total of ${combinedEvents.length} events.`);
    return combinedEvents;
}
