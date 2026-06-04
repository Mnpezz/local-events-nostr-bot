import fetch from 'node-fetch';
import * as cheerio from 'cheerio';

// Coordinates for popular Nashville venues to enable mapping on Nostr clients
const VENUE_COORDINATES = {
    "ryman auditorium": { latitude: 36.1613, longitude: -86.7785 },
    "bridgestone arena": { latitude: 36.1593, longitude: -86.7785 },
    "grand ole opry house": { latitude: 36.2081, longitude: -86.6963 },
    "the basement east": { latitude: 36.1751, longitude: -86.7554 },
    "the basement": { latitude: 36.1332, longitude: -86.7761 },
    "3rd and lindsley": { latitude: 36.1517, longitude: -86.7712 },
    "brooklyn bowl": { latitude: 36.1728, longitude: -86.7845 },
    "exit/in": { latitude: 36.1519, longitude: -86.8023 },
    "eastside bowl": { latitude: 36.2166, longitude: -86.7212 },
    "marathon music works": { latitude: 36.1633, longitude: -86.7972 },
    "nissan stadium": { latitude: 36.1665, longitude: -86.7713 },
    "centennial park": { latitude: 36.1502, longitude: -86.8123 },
    "musicians corner": { latitude: 36.1502, longitude: -86.8123 },
    "first horizon park": { latitude: 36.1744, longitude: -86.7836 },
    "geodis park": { latitude: 36.1293, longitude: -86.7645 },
    "ascend amphitheater": { latitude: 36.1587, longitude: -86.7709 },
    "station inn": { latitude: 36.1534, longitude: -86.7832 },
    "city winery": { latitude: 36.1512, longitude: -86.7753 },
    "tpac": { latitude: 36.1654, longitude: -86.7824 },
    "woolworth theatre": { latitude: 36.1643, longitude: -86.7801 },
    "cannery hall": { latitude: 36.1523, longitude: -86.7791 }
};

const MONTHS = {
    january: 0, jan: 0, february: 1, feb: 1, march: 2, mar: 2, april: 3, apr: 3,
    may: 4, june: 5, jun: 5, july: 6, jul: 6, august: 7, aug: 7, september: 8, sep: 8,
    october: 9, oct: 9, november: 10, nov: 10, december: 11, dec: 11
};

/**
 * Calculates Central Time (CST/CDT) offset relative to UTC for a given date.
 */
function getCentralOffsetHours(year, month, day, hour) {
    const march = new Date(Date.UTC(year, 2, 1));
    const startDST = new Date(Date.UTC(year, 2, 8 - march.getUTCDay() + 7, 8)); // DST starts 2 AM local (8 AM UTC)
    const nov = new Date(Date.UTC(year, 10, 1));
    const endDST = new Date(Date.UTC(year, 10, 8 - nov.getUTCDay(), 7)); // DST ends 2 AM local (7 AM UTC)
    
    const testDate = new Date(Date.UTC(year, month, day, hour));
    return (testDate >= startDST && testDate < endDST) ? -5 : -6;
}

/**
 * Parses a date string and time string in America/Chicago local time to a UTC Date object.
 */
function parseCentralTime(dateStr, timeStr, year) {
    const parts = dateStr.trim().split(/\s+/);
    if (parts.length < 2) return null;

    const day = parseInt(parts[0], 10);
    const monthName = parts[1].toLowerCase();
    const month = MONTHS[monthName];
    if (month === undefined || isNaN(day)) return null;

    let hour = 19; // Default to 7:00 PM for evening concerts if "All Day" or unspecified
    let minute = 0;

    if (timeStr && timeStr !== 'All Day') {
        const cleanTime = timeStr.replace(/\./g, '').toLowerCase().trim(); // e.g. "7:30 pm"
        const timeParts = cleanTime.match(/(\d+):(\d+)\s*(am|pm)/);
        if (timeParts) {
            hour = parseInt(timeParts[1], 10);
            minute = parseInt(timeParts[2], 10);
            const ampm = timeParts[3];
            if (ampm === 'pm' && hour < 12) hour += 12;
            if (ampm === 'am' && hour === 12) hour = 0;
        } else {
            // Check for simple hour formats e.g. "7 pm"
            const simpleTimeParts = cleanTime.match(/(\d+)\s*(am|pm)/);
            if (simpleTimeParts) {
                hour = parseInt(simpleTimeParts[1], 10);
                const ampm = simpleTimeParts[2];
                if (ampm === 'pm' && hour < 12) hour += 12;
                if (ampm === 'am' && hour === 12) hour = 0;
            }
        }
    }

    const offset = getCentralOffsetHours(year, month, day, hour);
    // Construct local time and adjust by offset to get UTC
    return new Date(Date.UTC(year, month, day, hour, minute) - offset * 60 * 60 * 1000);
}

/**
 * Scrapes events from nashvillego.com/calendar.
 * @returns {Promise<Array>} List of event objects.
 */
export async function scrapeEvents() {
    try {
        console.log("Scraping events from nashvillego.com/calendar...");
        
        const response = await fetch("https://nashvillego.com/calendar", {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch Nashville events: ${response.statusText}`);
        }

        const html = await response.text();
        const $ = cheerio.load(html);
        const events = [];

        // Parse year from title, default to current year
        const titleText = $('title').text();
        const yearMatch = titleText.match(/\b(20\d{2})\b/);
        const year = yearMatch ? parseInt(yearMatch[1], 10) : new Date().getFullYear();

        const today = new Date();
        const oneWeekFromNow = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);

        // Find day containers
        $('.day-cont-one').each((_, block) => {
            const heading = $(block).find('h2.day-cont-title');
            if (heading.length === 0) return; // Skip non-event blocks

            // Get date string (e.g. "Thursday, 4 June")
            const headingText = heading.text().replace(/\s+/g, ' ').trim();
            const datePart = headingText.split(',').pop().trim(); // "4 June"

            $(block).find('ul.day-cont-ul li.cal-item-one').each((_, li) => {
                // Skip headers (which don't have .mobiletime element)
                if ($(li).find('.mobiletime').length === 0) return;

                const timeText = $(li).find('.calleft').text().trim(); // e.g. "7:30 p.m." or "All Day"
                const eventName = $(li).find('.calmiddle').text().trim();
                const venueName = $(li).find('.calright').text().trim();

                if (!eventName || !venueName) return;

                // Parse local time to UTC date object
                const eventDate = parseCentralTime(datePart, timeText, year);
                if (!eventDate || isNaN(eventDate.getTime())) return;

                // Only keep events within the next week
                if (eventDate >= today && eventDate <= oneWeekFromNow) {
                    // Check if we have coordinate overrides for the venue
                    let coords = { latitude: null, longitude: null };
                    const lowerVenue = venueName.toLowerCase();
                    for (const [key, val] of Object.entries(VENUE_COORDINATES)) {
                        if (lowerVenue.includes(key)) {
                            coords = val;
                            break;
                        }
                    }

                    events.push({
                        name: eventName,
                        venue: venueName,
                        datetime: eventDate.toISOString(),
                        price: 'TBD', // NashvilleGo doesn't expose prices directly on list view
                        description: '',
                        url: 'https://nashvillego.com/calendar',
                        latitude: coords.latitude,
                        longitude: coords.longitude,
                        source: 'nashvillego.com',
                        tags: ['nashville', 'musiccity', 'events', 'music']
                    });
                }
            });
        });

        // Sort by date
        events.sort((a, b) => new Date(a.datetime).getTime() - new Date(b.datetime).getTime());

        console.log(`Found ${events.length} Nashville events in the next week.`);
        return events;

    } catch (error) {
        console.error("Error scraping Nashville events:", error);
        return [];
    }
}
