/* ================================================================
   XMailAI — Status Store (shared between functions)
   Uses Netlify Blobs on production, falls back to /tmp files locally
   ================================================================ */

import { getStore } from "@netlify/blobs";
import { writeFileSync, readFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

const LOCAL_DIR = join(tmpdir(), "xmailai-status");

/**
 * Try Netlify Blobs first; if unavailable (local dev), fall back to /tmp files.
 */
function getBlobStore() {
    try {
        return getStore("research-status");
    } catch {
        return null;
    }
}

export async function setStatus(jobId, stage, message) {
    const payload = JSON.stringify({ stage, message, ts: Date.now() });

    const store = getBlobStore();
    if (store) {
        try {
            await store.set(jobId, payload);
            return;
        } catch (e) {
            console.warn("[XMailAI] Blobs write failed, using file fallback:", e.message);
        }
    }

    // File fallback for local dev
    try {
        if (!existsSync(LOCAL_DIR)) mkdirSync(LOCAL_DIR, { recursive: true });
        writeFileSync(join(LOCAL_DIR, `${jobId}.json`), payload, "utf-8");
    } catch (e) {
        console.error("[XMailAI] File fallback write failed:", e.message);
    }
}

export async function getStatus(jobId) {
    const store = getBlobStore();
    if (store) {
        try {
            const raw = await store.get(jobId);
            return raw || null;
        } catch (e) {
            console.warn("[XMailAI] Blobs read failed, using file fallback:", e.message);
        }
    }

    // File fallback for local dev
    try {
        const filePath = join(LOCAL_DIR, `${jobId}.json`);
        if (existsSync(filePath)) {
            return readFileSync(filePath, "utf-8");
        }
    } catch (e) {
        console.error("[XMailAI] File fallback read failed:", e.message);
    }

    return null;
}
