import { publishSummaryNote } from '../nostr.js';
publishSummaryNote(5, 12).then(() => console.log("Sent test summary!"));
