import fetch from 'node-fetch';

/**
 * Scrapes events from the nola.show JSON API.
 * @returns {Promise<Array>} List of event objects.
 */
export async function scrapeEvents() {
    try {
        console.log("Scraping events from nola.show JSON API...");
        
        const response = await fetch("https://www.nola.show/events.json", {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch events: ${response.statusText}`);
        }

        const eventsData = await response.json();
        const events = [];

        const today = new Date();
        const oneWeekFromNow = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);

        for (const eventData of eventsData) {
            // Handle potentially malformed dates
            const dateStr = eventData.event_date.replace('Z', '+00:00');
            const eventDate = new Date(dateStr);

            if (isNaN(eventDate.getTime())) {
                 console.warn(`Skipping event with invalid date: ${eventData.event_name} (${eventData.event_date})`);
                 continue;
            }

            if (eventDate >= today && eventDate <= oneWeekFromNow) {
                events.push({
                    name: eventData.event_name,
                    venue: eventData.venue_name,
                    datetime: eventDate.toISOString(),
                    price: formatPrice(eventData.ticket_price, eventData.door_price),
                    description: '', // Nola.show JSON doesn't typically have this
                    url: eventData.ticket_link || 'https://www.nola.show/',
                    latitude: eventData.latitude,
                    longitude: eventData.longitude,
                    source: 'nola.show',
                    tags: ['nola', 'neworleans', 'music']
                });
            }
        }

        // Sort by date
        events.sort((a, b) => new Date(a.datetime).getTime() - new Date(b.datetime).getTime());

        console.log(`Found ${events.length} NOLA events in the next week.`);
        return events;

    } catch (error) {
        console.error("Error scraping NOLA events:", error);
        return [];
    }
}

function formatPrice(ticketPrice, doorPrice) {
    const prices = [];
    if (ticketPrice) prices.push(`Tickets: $${ticketPrice}`);
    if (doorPrice) prices.push(`Door: $${doorPrice}`);
    return prices.length > 0 ? prices.join(', ') : 'TBD';
}
