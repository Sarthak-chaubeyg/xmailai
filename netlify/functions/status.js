/* ================================================================
   XMailAI — Status Polling Function (Netlify Functions v2)
   Returns the current stage of a research job
   ================================================================ */

import { getStore } from "@netlify/blobs";

export default async (request, context) => {
    const headers = {
        "Content-Type": "application/json",
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
        "X-Content-Type-Options": "nosniff",
    };

    if (request.method !== "GET") {
        return new Response(JSON.stringify({ error: "Method not allowed" }), {
            status: 405,
            headers,
        });
    }

    const url = new URL(request.url);
    const jobId = url.searchParams.get("id");

    if (!jobId || jobId.length < 8 || jobId.length > 64) {
        return new Response(JSON.stringify({ error: "Invalid job ID" }), {
            status: 400,
            headers,
        });
    }

    // Allow hex chars and hyphens
    if (!/^[a-f0-9\-]+$/i.test(jobId)) {
        return new Response(JSON.stringify({ error: "Invalid job ID format" }), {
            status: 400,
            headers,
        });
    }

    try {
        const store = getStore({ name: "research-status", consistency: "strong" });
        const raw = await store.get(jobId);

        if (!raw) {
            return new Response(
                JSON.stringify({ stage: "pending", message: "Job is queued. Please wait..." }),
                { status: 200, headers }
            );
        }

        return new Response(raw, { status: 200, headers });
    } catch (error) {
        console.error("[XMailAI] Status check error:", error.message, error.stack);
        return new Response(
            JSON.stringify({ stage: "pending", message: "Initializing..." }),
            { status: 200, headers }
        );
    }
};

export const config = {
    path: "/api/status",
};
