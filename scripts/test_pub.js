import { getPublicKey, nip19 } from 'nostr-tools';
import dotenv from 'dotenv';
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
console.log(getPublicKey(sk));
