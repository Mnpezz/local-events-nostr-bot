import WebSocket from "ws";
import { nip19, finalizeEvent } from "nostr-tools";

import dotenv from "dotenv";
dotenv.config();

const PRIVATE_KEY = process.env.NOSTR_PRIVATE_KEY;
if (!PRIVATE_KEY) {
    console.error("Please set NOSTR_PRIVATE_KEY in your .env file");
    process.exit(1);
}

function hexToBytes(hex) {
    let bytes = new Uint8Array(Math.ceil(hex.length / 2));
    for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
    return bytes;
}

const getPrivateKeyBytes = () => {
    if (PRIVATE_KEY.startsWith('nsec1')) {
        const { type, data } = nip19.decode(PRIVATE_KEY);
        if (type !== 'nsec') throw new Error("Invalid NIP-19 nsec string");
        return data;
    }
    if (PRIVATE_KEY.includes(',')) {
        return new Uint8Array(PRIVATE_KEY.split(',').map(Number));
    }
    return hexToBytes(PRIVATE_KEY);
};

const sk = getPrivateKeyBytes();

const tags = [
    ["d", "house-of-flow-2026-02-25t00-30-00-000z-arora"],
    ["title", "House of Flow"],
    ["start", "1771979400"],
    ["start_tzid", "America/Chicago"],
    ["D", "20509"],
    ["location", "Arora"],
    ["image", "https://scontent-atl3-3.xx.fbcdn.net/v/t39.30808-6/475106352_122209728494163412_6569741287861679429_n.jpg?_nc_cat=107&ccb=1-7&_nc_sid=2a1932&_nc_ohc=7wO0mLXfsrEQ7kNvwERbplc&_nc_oc=AdnRExoOEkYuJ6f6YCXj9DEqCuyY013UMGBLQvg4m39FvfKAt-_D37ibv28vF0z6oaRlDLrcg8EtaySuRzsssejL&_nc_zt=23&_nc_ht=scontent-atl3-3.xx&_nc_gid=5IlWd1XWRJFHzHr8cYuD_Q&oh=00_AfsRzQ-jkA3LxZb71lbahKUKiXVsVTItN4EU5dWdLDh5hg&oe=69A38B4D"],
    ["price", "Tickets: $$15.03, Door: $$27.02"],
    ["r", "https://www.eventbrite.com/e/house-of-flow-tickets-1982728156289"],
    ["lat", "29.944186"],
    ["lon", "-90.065689"],
    ["g", "9vrfqe0jt"],
    ["t", "nola"],
    ["t", "neworleans"],
    ["t", "music"]
];

const content = `Event from nola.show\n📍 Venue: Arora\n🎟️ Price: Tickets: $$15.03, Door: $$27.02\n🔗 https://www.eventbrite.com/e/house-of-flow-tickets-1982728156289`;

const event = {
    kind: 31923,
    created_at: 1771949608 + 500, // force strictly newer by a lot
    tags,
    content
};

const signedEvent = finalizeEvent(event, sk);
console.log("Publishing override with created_at", event.created_at);

const ws = new WebSocket("wss://relay.damus.io");
ws.on("open", () => {
    ws.send(JSON.stringify(["EVENT", signedEvent]));
});
ws.on("message", (data) => {
    console.log("Response:", data.toString());
    process.exit(0);
});
