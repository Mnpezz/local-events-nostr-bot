/**
 * One-time script to publish a Nostr profile (kind:0) for the bot.
 * Run this once so relay.primal.net starts indexing the bot's events.
 *
 * Usage: node publish_profile.js
 */

import WebSocket from 'ws';
globalThis.WebSocket = WebSocket;

import dotenv from 'dotenv';
dotenv.config();

import { SimplePool, getPublicKey, finalizeEvent, nip19 } from 'nostr-tools';

function hexToBytes(hex) {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
    return bytes;
}

function getPrivateKeyBytes() {
    const PRIVATE_KEY = process.env.NOSTR_PRIVATE_KEY;
    if (!PRIVATE_KEY) throw new Error('NOSTR_PRIVATE_KEY not set');
    if (PRIVATE_KEY.startsWith('nsec1')) {
        const { type, data } = nip19.decode(PRIVATE_KEY);
        if (type !== 'nsec') throw new Error('Invalid nsec');
        return data;
    }
    return hexToBytes(PRIVATE_KEY);
}

const RELAYS = (process.env.NOSTR_RELAYS || '').split(',').filter(Boolean);

const profile = {
    name: "NOLA Events Bot",
    display_name: "New Orleans Events 🎷",
    about: "Automatically posting upcoming live music and events in New Orleans, Louisiana from nola.show. Built on Nostr. #nola #neworleans #livemusic",
    website: "https://www.nola.show",
    picture: "https://upload.wikimedia.org/wikipedia/commons/thumb/5/5a/Louisiana_state_flag.svg/320px-Louisiana_state_flag.svg.png",
    banner: "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a2/New_Orleans_aerial.jpg/1280px-New_Orleans_aerial.jpg",
    nip05: "",
    lud16: "",
};

async function publishProfile() {
    const sk = getPrivateKeyBytes();
    const pubkey = getPublicKey(sk);
    const npub = nip19.npubEncode(pubkey);

    console.log('Publishing profile for:', npub);
    console.log('Publishing to relays:', RELAYS);

    const event = finalizeEvent({
        kind: 0,
        created_at: Math.floor(Date.now() / 1000),
        tags: [],
        content: JSON.stringify(profile),
    }, sk);

    const pool = new SimplePool();
    try {
        await Promise.any(pool.publish(RELAYS, event));
        console.log('✅ Profile published successfully!');
        console.log('\nView profile on Primal: https://primal.net/p/' + npub);
        console.log('\nNote: It may take a few minutes for relay.primal.net to start indexing your events.');
    } catch (err) {
        console.error('❌ Failed to publish profile:', err);
    } finally {
        pool.close(RELAYS);
    }
}

publishProfile().catch(console.error);
