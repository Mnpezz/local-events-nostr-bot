import { SimplePool, getPublicKey, finalizeEvent, nip19 } from 'nostr-tools';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import ngeohash from 'ngeohash';

dotenv.config();

const RELAYS = (process.env.NOSTR_RELAYS || 'wss://relay.damus.io,wss://relay.snort.social').split(',');
const PRIVATE_KEY = process.env.NOSTR_PRIVATE_KEY; // Expects a hex/uint8array format depending on the nostr-tools version if you use standard hex string you must convert it. Assuming modern nostr-tools v2 format (Uint8Array).

/**
 * Modern nostr-tools requires the private key as a Uint8Array. 
 * If the user provides a hex string, this helper converts it.
 */
function hexToBytes(hex) {
    let bytes = new Uint8Array(Math.ceil(hex.length / 2));
    for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
    return bytes;
}

const getPrivateKeyBytes = () => {
    if (!PRIVATE_KEY) {
        throw new Error("NOSTR_PRIVATE_KEY environment variable is not set");
    }
    // If it's an nsec key (bech32)
    if (PRIVATE_KEY.startsWith('nsec1')) {
        const { type, data } = nip19.decode(PRIVATE_KEY);
        if (type !== 'nsec') {
            throw new Error("Invalid NIP-19 nsec string");
        }
        return data; // already a Uint8Array in modern nostr-tools
    }

    // Check if it's already a comma-separated array string (e.g. from some generator) or hex
    if (PRIVATE_KEY.includes(',')) {
        return new Uint8Array(PRIVATE_KEY.split(',').map(Number));
    }
    return hexToBytes(PRIVATE_KEY);
};

const DATA_FILE = path.join(process.cwd(), 'published_events.json');

// Load published event hashes from the JSON file to avoiding duplicating across runs
let publishedEvents = {};
try {
    if (fs.existsSync(DATA_FILE)) {
        const data = fs.readFileSync(DATA_FILE, 'utf8');
        const parsed = JSON.parse(data);
        if (Array.isArray(parsed)) {
            // Migration from old array-based tracking
            publishedEvents = {};
        } else {
            // Check if it's the old strict hash-string format and migrate to object
            for (const [key, value] of Object.entries(parsed)) {
                if (typeof value === 'string') {
                    publishedEvents[key] = { hash: value, timestamp: Math.floor(Date.now() / 1000) };
                } else {
                    publishedEvents[key] = value;
                }
            }
        }
    }
} catch (error) {
    console.error("Error loading published events:", error.message);
}

function savePublishedEvents() {
    try {
        fs.writeFileSync(DATA_FILE, JSON.stringify(publishedEvents, null, 2), 'utf8');
    } catch (error) {
        console.error("Error saving published events:", error.message);
    }
}

// Load preferred venue mappings or default image for events
const VENUE_IMAGES_FILE = path.join(process.cwd(), 'venue_images.json');
let venueImages = {};
try {
    if (fs.existsSync(VENUE_IMAGES_FILE)) {
        const imgData = fs.readFileSync(VENUE_IMAGES_FILE, 'utf8');
        venueImages = JSON.parse(imgData);
    }
} catch (error) {
    console.error("Error loading venue_images.json:", error.message);
}

// Optional helper to sleep/delay execution
export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function publishEvent(eventData) {
    let pool;
    try {
        const sk = getPrivateKeyBytes();

        // Generate a deterministic identifier string
        const identifier = `${eventData.name}_${eventData.datetime}_${eventData.venue}`.toLowerCase().replace(/[^a-z0-9]/g, '-');

        const startTimestamp = Math.floor(new Date(eventData.datetime).getTime() / 1000);
        const tags = [
            ["d", identifier], // NIP-52 unique identifier
            ["title", eventData.name],
            ["start", startTimestamp.toString()],
            ["start_tzid", "America/Chicago"],
            ["D", Math.floor(startTimestamp / 86400).toString()],
            ["location", eventData.venue], // Human readable address
        ];

        // Apply fallback or venue-specific image
        let imageUrl = venueImages["default"];
        for (const [venueName, url] of Object.entries(venueImages)) {
            if (venueName !== "default" && eventData.venue.toLowerCase().includes(venueName.toLowerCase())) {
                imageUrl = url;
                break;
            }
        }

        if (imageUrl) {
            tags.push(["image", imageUrl]);
        }

        // Ensure these optional fields exist before mapping them
        if (eventData.price) {
            tags.push(["price", eventData.price]);
        }

        if (eventData.url) {
            tags.push(["r", eventData.url]);
        }

        if (eventData.latitude && eventData.longitude) {
            // Include backward compatible raw tags
            tags.push(["lat", eventData.latitude.toString()]);
            tags.push(["lon", eventData.longitude.toString()]);

            // Standard NIP-52 g tag using ngeohash
            const hash = ngeohash.encode(eventData.latitude, eventData.longitude, 9);
            tags.push(["g", hash]);
        }

        // Add a hashtag so it easily groups on Nostr clients
        const eventTags = eventData.tags || ["nola", "neworleans", "music"];
        for (const t of eventTags) {
            tags.push(["t", t]);
        }

        // Resolve whether this is an update and handle created_at strictly
        const isUpdate = publishedEvents.hasOwnProperty(identifier);
        let createdAt = Math.floor(Date.now() / 1000);

        if (isUpdate) {
            // Relays will IGNORE replaceable events if the timestamp isn't strictly newer
            // Ensure this update is significantly newer than the version in cache
            createdAt = Math.max(createdAt, publishedEvents[identifier].timestamp + 10);
        }

        const event = {
            kind: 31923, // Time-Based Calendar Event (NIP-52)
            created_at: createdAt,
            tags: tags,
            content: `Event from ${eventData.source || "nola.show"}\n📍 Venue: ${eventData.venue}\n🎟️ Price: ${eventData.price || "TBD"}\n🔗 ${eventData.url || "https://www.nola.show/"}`,
        };

        // Create a hash of the event's data + tags to detect changes
        const eventHash = crypto.createHash('sha256').update(JSON.stringify(event.tags) + event.content).digest('hex');

        if (isUpdate && publishedEvents[identifier].hash === eventHash) {
            // Silently skip to avoid flooding the terminal
            return "skipped";
        }

        const signedEvent = finalizeEvent(event, sk);

        const actionText = isUpdate ? "Updating" : "Publishing";
        console.log(`${actionText}: ${eventData.name} to ${RELAYS.length} relays...`);
        pool = new SimplePool();

        try {
            await Promise.any(pool.publish(RELAYS, signedEvent));
            console.log(`✅ Successfully published to at least one relay`);
        } catch (error) {
            console.error(`❌ Failed to publish to any relay:`, error);
        }

        publishedEvents[identifier] = { hash: eventHash, timestamp: createdAt };
        savePublishedEvents();
        return isUpdate ? "updated" : "added";

    } catch (error) {
        console.error(`Error publishing event ${eventData.name}:`, error.message);
        return "error";
    } finally {
        if (pool) {
            pool.close(RELAYS);
        }
    }
}

export async function publishSummaryNote(addedCount, updatedCount) {
    if (addedCount === 0 && updatedCount === 0) return;

    let pool;
    try {
        const sk = getPrivateKeyBytes();
        const content = `🤖 I just finished reading the latest event listings!\n\n📈 Added: ${addedCount} new event(s)\n🔄 Updated: ${updatedCount} existing event(s)\n\nCheck out Plektos for the latest live music schedules and event maps!\n\n📌 View Map:\nhttps://plektos.app\n\n#livemusic #events #nola #nashville`;

        const event = {
            kind: 1, // Short Text Note
            created_at: Math.floor(Date.now() / 1000),
            tags: [
                ["t", "nola"],
                ["t", "neworleans"],
                ["t", "livemusic"],
                ["t", "events"]
            ],
            content: content,
        };

        const signedEvent = finalizeEvent(event, sk);
        console.log(`Publishing summary note to ${RELAYS.length} relays...`);

        pool = new SimplePool();
        try {
            await Promise.any(pool.publish(RELAYS, signedEvent));
            console.log(`✅ Successfully published summary note`);
        } catch (error) {
            console.error(`❌ Failed to publish summary note:`, error);
        }

    } catch (error) {
        console.error(`Error publishing summary note:`, error.message);
    } finally {
        if (pool) {
            pool.close(RELAYS);
        }
    }
}
