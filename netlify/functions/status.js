/* ================================================================
   XMailAI — Status Polling Function
   Returns the current stage of a research job
   ================================================================ */

import { getStore, connectLambda } from "@netlify/blobs";

export const handler = async (event) => {
    connectLambda(event);
    const headers = {
        "Content-Type": "application/json",
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
        "X-Content-Type-Options": "nosniff",
    };

    if (event.httpMethod !== "GET") {
        return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };
    }

    const params = new URLSearchParams(event.rawQuery || "");
    const jobId = params.get("id");

    if (!jobId || jobId.length < 8 || jobId.length > 64) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: "Invalid job ID" }) };
    }

    // Allow hex chars and hyphens
    if (!/^[a-f0-9\-]+$/i.test(jobId)) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: "Invalid job ID format" }) };
    }

    try {
        const store = getStore({ name: "research-status", consistency: "strong" });
        const raw = await store.get(jobId);

        if (!raw) {
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({ stage: "pending", message: "Job is queued. Please wait..." }),
            };
        }

        return { statusCode: 200, headers, body: raw };
    } catch (error) {
        console.error("[XMailAI] Status check error:", error.message);
        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ stage: "pending", message: "Initializing..." }),
        };
    }
};
