import dotenv from 'dotenv';
import WebSocket from 'ws';

if (!globalThis.WebSocket) {
    globalThis.WebSocket = WebSocket;
}

dotenv.config();

import cron from 'node-cron';
import { scrapeEvents } from './scraper.js';
import { publishEvent, publishSummaryNote, sleep } from './nostr.js';

console.log("Starting NOLA Nostr Bot logic...");

async function runBot() {
    console.log(`[${new Date().toISOString()}] Bot run triggered.`);
    try {
        const events = await scrapeEvents();

        if (events.length === 0) {
            console.log("No events scraped, nothing to publish.");
            return;
        }

        let addedCount = 0;
        let updatedCount = 0;
        const total = events.length;

        for (let i = 0; i < total; i++) {
            const event = events[i];

            // Print progress cleanly every 50 events
            if (i > 0 && i % 50 === 0) {
                console.log(`⏳ Checking events for updates... ${i}/${total}`);
            }

            const status = await publishEvent(event);
            if (status === "added") {
                addedCount++;
                await sleep(1000); // Only delay if we actually hit the network
            } else if (status === "updated") {
                updatedCount++;
                await sleep(1000); // Only delay if we actually hit the network
            }
        }

        console.log(`[${new Date().toISOString()}] Finished processing: ${addedCount} added, ${updatedCount} updated.`);

        // Post a summary note to the timeline
        await publishSummaryNote(addedCount, updatedCount);

    } catch (error) {
        console.error("An error occurred during bot execution:", error);
    }
}

// Check if running strictly once via argument or setting up continuous schedule
const isRunOnce = process.argv.includes('--once');

if (isRunOnce) {
    runBot().then(() => {
        console.log("Run completed (--once). Exiting.");
        process.exit(0);
    });
} else {
    // Run immediately on boot
    runBot();

    // Schedule to run every 6 hours
    console.log("Scheduling bot to run every 6 hours...");
    cron.schedule('0 */6 * * *', () => {
        runBot();
    });
}
