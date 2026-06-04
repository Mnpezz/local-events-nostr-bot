import { SimplePool, getPublicKey, nip19 } from 'nostr-tools';
import dotenv from 'dotenv';
dotenv.config();

function hexToBytes(hex) {
    let bytes = new Uint8Array(Math.ceil(hex.length / 2));
    for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
    return bytes;
}

const getPrivateKeyBytes = (key) => {
    if (key.startsWith('nsec1')) {
        const { type, data } = nip19.decode(key);
        if (type !== 'nsec') throw new Error("Invalid NIP-19 nsec string");
        return data;
    }
    if (key.includes(',')) {
        return new Uint8Array(key.split(',').map(Number));
    }
    return hexToBytes(key);
};

let author = '6df6069be087791dbe66904f50e93e4cb85d319ab24b39e592b3a62ee5ff981e'; // Fallback
if (process.env.NOSTR_PRIVATE_KEY) {
    try {
        const sk = getPrivateKeyBytes(process.env.NOSTR_PRIVATE_KEY);
        author = getPublicKey(sk);
    } catch (e) {
        console.warn("Could not derive public key from env, using fallback.");
    }
}

async function listen() {
    const pool = new SimplePool();
    const relays = ['wss://relay.damus.io', 'wss://relay.snort.social', 'wss://nostr.band'];
    
    console.log("Subscribing...");
    let sub = pool.subscribeMany(relays, [{
        authors: [author]
    }], {
        onevent(e) {
            console.log("GOT EVENT:", e.id, e.kind);
        },
        oneose() {
            console.log("EOSE logic reached for one relay.");
        }
    });
    
    setTimeout(() => {
        sub.close();
        pool.close(relays);
        console.log("Done");
    }, 5000);
}
listen();
