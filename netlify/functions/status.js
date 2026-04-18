/* ================================================================
   XMailAI — Status Polling Function
   Returns the current stage of a research job
   ================================================================ */

import { getStatus } from "./store.js";

export const handler = async (event) => {
    // CORS + security headers
    const headers = {
        "Content-Type": "application/json",
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
        "X-Content-Type-Options": "nosniff",
    };

    // Only allow GET
    if (event.httpMethod !== "GET") {
        return {
            statusCode: 405,
            headers,
            body: JSON.stringify({ error: "Method not allowed" }),
        };
    }

    // Extract job ID from query string
    const params = new URLSearchParams(event.rawQuery || "");
    const jobId = params.get("id");

    if (!jobId || jobId.length < 8 || jobId.length > 64) {
        return {
            statusCode: 400,
            headers,
            body: JSON.stringify({ error: "Invalid or missing job ID" }),
        };
    }

    // Sanitize: only allow hex chars and hyphens
    if (!/^[a-f0-9\-]+$/i.test(jobId)) {
        return {
            statusCode: 400,
            headers,
            body: JSON.stringify({ error: "Invalid job ID format" }),
        };
    }

    try {
        const raw = await getStatus(jobId);

        if (!raw) {
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({
                    stage: "pending",
                    message: "Job is queued. Please wait...",
                }),
            };
        }

        // Return the stored status as-is (it's already JSON)
        return {
            statusCode: 200,
            headers,
            body: raw,
        };
    } catch (error) {
        console.error("[XMailAI] Status check error:", error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({
                stage: "error",
                message: "Failed to check status. Please try again.",
            }),
        };
    }
};
