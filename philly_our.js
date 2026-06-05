import fetch from 'node-fetch';
import * as cheerio from 'cheerio';

/**
 * Calculates Eastern Time (EST/EDT) offset relative to UTC for a given date.
 */
function getEasternOffsetHours(year, month, day, hour) {
    const march = new Date(Date.UTC(year, 2, 1));
    const startDST = new Date(Date.UTC(year, 2, 8 - march.getUTCDay() + 7, 7)); // DST starts 2 AM local (7 AM UTC)
    const nov = new Date(Date.UTC(year, 10, 1));
    const endDST = new Date(Date.UTC(year, 10, 8 - nov.getUTCDay(), 6)); // DST ends 2 AM local (6 AM UTC)
    
    const testDate = new Date(Date.UTC(year, month, day, hour));
    return (testDate >= startDST && testDate < endDST) ? -4 : -5;
}

/**
 * Parses local Philly date and time strings to a UTC Date object.
 */
function parseEasternTime(dateStr, timeStr) {
    // dateStr format: "2026-06-07"
    // timeStr format: "20:00:00" or null
    const dateParts = dateStr.split('-');
    if (dateParts.length < 3) return null;

    const year = parseInt(dateParts[0], 10);
    const month = parseInt(dateParts[1], 10) - 1; // 0-indexed
    const day = parseInt(dateParts[2], 10);

    let hour = 19; // Default to 7:00 PM for music/evening events
    let minute = 0;

    if (timeStr) {
        const timeParts = timeStr.split(':');
        if (timeParts.length >= 2) {
            hour = parseInt(timeParts[0], 10);
            minute = parseInt(timeParts[1], 10);
        }
    }

    const offset = getEasternOffsetHours(year, month, day, hour);
    return new Date(Date.UTC(year, month, day, hour, minute) - offset * 60 * 60 * 1000);
}

/**
 * Scrapes events from ourphilly.org/this-weekend-in-philadelphia.
 * @returns {Promise<Array>} List of event objects.
 */
export async function scrapeEvents() {
    try {
        console.log("Scraping events from ourphilly.org...");
        
        const response = await fetch("https://www.ourphilly.org/this-weekend-in-philadelphia", {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch Philly events: ${response.statusText}`);
        }

        const html = await response.text();
        const $ = cheerio.load(html);
        const events = [];

        // Find Next.js RSC payload scripts containing event data
        let combinedScriptText = "";
        $("script").each((_, el) => {
            const text = $(el).html() || "";
            if (text.includes("self.__next_f.push")) {
                combinedScriptText += text;
            }
        });

        // Unescape the Next.js RSC string
        const cleanedPayload = combinedScriptText.replace(/\\"/g, "\"").replace(/\\\\/g, "\\");
        
        // Find the index of the "initialEvents" array
        const startKeyword = '"initialEvents":';
        const startIdx = cleanedPayload.indexOf(startKeyword);

        if (startIdx === -1) {
            console.warn("Could not find initialEvents array in ourphilly.org payload.");
            return [];
        }

        const arrayStart = cleanedPayload.indexOf("[", startIdx);
        if (arrayStart === -1) return [];

        // Find matching closing square bracket for the array
        let bracketCount = 0;
        let endIdx = -1;
        for (let i = arrayStart; i < cleanedPayload.length; i++) {
            if (cleanedPayload[i] === "[") bracketCount++;
            else if (cleanedPayload[i] === "]") {
                bracketCount--;
                if (bracketCount === 0) {
                    endIdx = i;
                    break;
                }
            }
        }

        if (endIdx === -1) {
            console.warn("Malformed initialEvents JSON array on ourphilly.org.");
            return [];
        }

        const jsonStr = cleanedPayload.substring(arrayStart, endIdx + 1);
        const rawEvents = JSON.parse(jsonStr);

        const today = new Date();
        const oneWeekFromNow = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);

        for (const item of rawEvents) {
            if (!item.title || !item.start_date) continue;

            const eventDate = parseEasternTime(item.start_date, item.start_time);
            if (!eventDate || isNaN(eventDate.getTime())) continue;

            // Only filter for the next 7 days
            if (eventDate >= today && eventDate <= oneWeekFromNow) {
                events.push({
                    name: item.title,
                    venue: item.venue_name || item.address || 'Philadelphia, PA',
                    datetime: eventDate.toISOString(),
                    price: 'TBD',
                    description: item.description || '',
                    url: item.link || 'https://www.ourphilly.org/this-weekend-in-philadelphia',
                    latitude: item.latitude || null,
                    longitude: item.longitude || null,
                    source: 'ourphilly.org',
                    image: item.image_url || null,
                    tags: ['philly', 'philadelphia', 'music', 'events']
                });
            }
        }

        // Sort by date
        events.sort((a, b) => new Date(a.datetime).getTime() - new Date(b.datetime).getTime());

        console.log(`Found ${events.length} Philly events in the next week.`);
        return events;

    } catch (error) {
        console.error("Error scraping Philly events:", error);
        return [];
    }
}
