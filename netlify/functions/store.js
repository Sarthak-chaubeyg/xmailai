/* ================================================================
   XMailAI — Status Store (shared between functions)
   Uses Netlify Blobs on production with proper error handling
   ================================================================ */

import { getStore } from "@netlify/blobs";

/**
 * Write status to Netlify Blobs.
 */
export async function setStatus(jobId, stage, message) {
    const payload = JSON.stringify({ stage, message, ts: Date.now() });

    try {
        const store = getStore({ name: "research-status", consistency: "strong" });
        await store.set(jobId, payload);
    } catch (e) {
        console.error("[XMailAI] setStatus failed:", e.message, e.stack);
    }
}

/**
 * Read status from Netlify Blobs.
 */
export async function getStatus(jobId) {
    try {
        const store = getStore({ name: "research-status", consistency: "strong" });
        const raw = await store.get(jobId);
        return raw || null;
    } catch (e) {
        console.error("[XMailAI] getStatus failed:", e.message, e.stack);
        return null;
    }
}
