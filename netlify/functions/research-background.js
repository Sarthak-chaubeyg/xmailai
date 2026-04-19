/* ================================================================
   XMailAI — Background Research Function (Netlify Functions v2)
   Uses modern v2 format for automatic Blobs environment injection.
   Pipeline: Tavily Search → RAG Context → OpenRouter Nemotron → Resend Email
   ================================================================ */

import { getStore } from "@netlify/blobs";
import { marked } from "marked";

// ---- Configuration ----
const RECIPIENT_EMAIL = "voltavinaycadila751@gmail.com";
const MODEL_ID = "nvidia/nemotron-3-super-120b-a12b:free";
const SITE_URL = "https://xmailai.netlify.app";
const DEEP_SUB_QUERY_COUNT = 3;

// ================================================================
// INLINE STATUS HELPER
// ================================================================
async function updateStatus(jobId, stage, message) {
    try {
        const store = getStore({ name: "research-status", consistency: "strong" });
        const payload = JSON.stringify({ stage, message, ts: Date.now() });
        await store.set(jobId, payload);
        console.log(`[XMailAI] Status → ${stage}: ${message}`);
    } catch (e) {
        console.error(`[XMailAI] Status write FAILED for ${stage}:`, e.message, e.stack);
    }
}

// ---- v2 Background Handler ----
// For background functions (-background suffix):
// - Netlify sends 202 to the client BEFORE the handler runs
// - The handler runs asynchronously for up to 15 minutes
// - Any return value is IGNORED (client already got 202)
export default async (request, context) => {
    console.log("[XMailAI] Background function invoked");

    let body;
    try {
        body = await request.json();
    } catch (e) {
        console.error("[XMailAI] Failed to parse request body:", e.message);
        return; // Can't do anything without a valid body
    }

    const { query, mode, jobId } = body;
    if (!query || !jobId || !mode) {
        console.error("[XMailAI] Missing required fields:", { query: !!query, mode: !!mode, jobId: !!jobId });
        return;
    }

    console.log(`[XMailAI] Starting research: jobId=${jobId}, mode=${mode}`);

    const sanitizedQuery = String(query).substring(0, 12000).trim();
    const validMode = mode === "deep" ? "deep" : "search";

    // Run the entire pipeline directly (background function has 15 min timeout)
    await runPipeline(sanitizedQuery, validMode, jobId);
};


// ================================================================
// MAIN PIPELINE (runs directly in background function handler)
// ================================================================
async function runPipeline(sanitizedQuery, validMode, jobId) {
    try {
        // =============== STAGE 1: SEARCHING ===============
        await updateStatus(jobId, "searching", "Searching the web for relevant sources...");
        console.log("[XMailAI] Starting pipeline...");

        let results;
        try {
            results = await performTavilySearch(sanitizedQuery, validMode);
        } catch (searchErr) {
            console.error("[XMailAI] Tavily search FAILED:", searchErr.message);
            throw searchErr;
        }

        if (!results || results.length === 0) {
            throw new Error("No search results found. Try a different query.");
        }

        console.log(`[XMailAI] Tavily returned ${results.length} results`);

        // =============== STAGE 2: CRAWLING ===============
        await updateStatus(jobId, "crawling", `Processing ${results.length} sources...`);

        const ragContext = buildRAGContext(results);

        // =============== STAGE 3: GENERATING ===============
        await updateStatus(jobId, "generating", "AI is analyzing and generating your personalized report...");

        let report;
        try {
            report = await generateWithNemotron(sanitizedQuery, ragContext, validMode, results.length);
        } catch (genErr) {
            console.error("[XMailAI] OpenRouter generation FAILED:", genErr.message);
            throw genErr;
        }

        console.log(`[XMailAI] Report generated: ${report.length} chars`);

        // =============== STAGE 4: SENDING ===============
        await updateStatus(jobId, "sending", "Formatting and sending your report...");

        const emailHtml = buildEmailTemplate(sanitizedQuery, report, results);

        try {
            await sendViaResend(sanitizedQuery, emailHtml);
        } catch (emailErr) {
            console.error("[XMailAI] Resend email FAILED:", emailErr.message);
            throw emailErr;
        }

        // =============== STAGE 5: COMPLETE ===============
        await updateStatus(jobId, "complete", "Research complete! Check your inbox.");
        console.log("[XMailAI] Pipeline completed successfully!");

    } catch (error) {
        console.error("[XMailAI] Pipeline error:", error.message, error.stack);
        try {
            await updateStatus(jobId, "error", error.message || "An unexpected error occurred.");
        } catch (statusErr) {
            console.error("[XMailAI] CRITICAL: Could not even write error status:", statusErr.message);
        }
    }
}

// ================================================================
// TAVILY SEARCH
// ================================================================
async function performTavilySearch(query, mode) {
    const apiKey = process.env.TAVILY_API_KEY;
    if (!apiKey) throw new Error("TAVILY_API_KEY is not set.");

    const isDeep = mode === "deep";

    const mainResults = await callTavily(apiKey, query, isDeep ? "advanced" : "basic", 10);

    if (!isDeep) return mainResults;

    // Deep mode: additional sub-query searches
    const subQueries = generateSubQueries(query);
    const seenUrls = new Set(mainResults.map((r) => r.url));
    const additionalResults = [];

    for (const sq of subQueries) {
        try {
            const subResults = await callTavily(apiKey, sq, "basic", 10);
            for (const r of subResults) {
                if (!seenUrls.has(r.url)) {
                    seenUrls.add(r.url);
                    additionalResults.push(r);
                }
            }
        } catch (e) {
            console.warn(`[XMailAI] Sub-query failed: "${sq}" — ${e.message}`);
        }
    }

    return [...mainResults, ...additionalResults];
}

async function callTavily(apiKey, query, searchDepth, maxResults) {
    console.log(`[XMailAI] Calling Tavily: depth=${searchDepth}, max=${maxResults}`);

    const response = await fetch("https://api.tavily.com/search", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
            query,
            search_depth: searchDepth,
            max_results: maxResults,
            include_raw_content: false,
            include_answer: true,
        }),
    });

    if (!response.ok) {
        const errBody = await response.text().catch(() => "");
        throw new Error(`Tavily API ${response.status}: ${errBody.substring(0, 300)}`);
    }

    const data = await response.json();
    console.log(`[XMailAI] Tavily returned ${(data.results || []).length} results`);

    return (data.results || []).map((r) => ({
        title: r.title || "Untitled",
        url: r.url || "",
        content: r.content || "",
        score: r.score || 0,
    }));
}

function generateSubQueries(mainQuery) {
    const base = mainQuery.substring(0, 150).replace(/\n/g, " ");
    return [
        `${base} latest releases updates 2026`,
        `${base} free open source tools alternatives`,
        `${base} benchmarks comparison analysis reviews`,
    ].slice(0, DEEP_SUB_QUERY_COUNT);
}

// ================================================================
// RAG CONTEXT BUILDER
// ================================================================
function buildRAGContext(results) {
    let ctx = `========== WEB RESEARCH DATA (${results.length} sources) ==========\n\n`;

    results.forEach((r, i) => {
        ctx += `[SOURCE ${i + 1}] — ${r.title}\n`;
        ctx += `URL: ${r.url}\n`;
        ctx += `Content: ${r.content}\n`;
        ctx += `${"—".repeat(40)}\n\n`;
    });

    ctx += `========== END OF WEB RESEARCH DATA ==========`;
    return ctx;
}

// ================================================================
// AI GENERATION (OpenRouter + Nemotron)
// ================================================================
async function generateWithNemotron(query, ragContext, mode, sourceCount) {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) throw new Error("OPENROUTER_API_KEY is not set.");

    const isDeep = mode === "deep";
    const systemPrompt = getSystemPrompt(isDeep, sourceCount);

    const userPrompt = [
        "USER'S RESEARCH QUERY:",
        query,
        "",
        ragContext,
        "",
        "INSTRUCTIONS:",
        "Using EXCLUSIVELY the web research data above, produce your comprehensive research report.",
        "Cite sources using [Source N] notation with the actual URL.",
        isDeep
            ? "This is a DEEP RESEARCH request. Be extremely thorough. Aim for 5000+ words."
            : "This is a SEARCH request. Be clear, concise, and actionable.",
        "",
        "Begin your report now.",
    ].join("\n");

    console.log(`[XMailAI] Calling OpenRouter: model=${MODEL_ID}`);

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
            "HTTP-Referer": SITE_URL,
            "X-Title": "XMailAI",
        },
        body: JSON.stringify({
            model: MODEL_ID,
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userPrompt },
            ],
            max_tokens: isDeep ? 65536 : 16384,
            temperature: 0.3,
            top_p: 0.9,
        }),
    });

    if (!response.ok) {
        const errBody = await response.text().catch(() => "");
        throw new Error(`OpenRouter ${response.status}: ${errBody.substring(0, 300)}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content || content.trim().length < 50) {
        throw new Error("AI model returned insufficient content. Please try again.");
    }

    console.log(`[XMailAI] OpenRouter response: ${content.length} chars`);
    return content;
}

function getSystemPrompt(isDeep, sourceCount) {
    const depth = isDeep
        ? `This is a DEEP RESEARCH request. Produce an extremely comprehensive research report.
KEY REQUIREMENTS:
- Aim for 5000+ words
- Cover every angle and sub-topic
- Create comparison tables where relevant
- Include executive summary, analysis, and key takeaways`
        : `This is a SEARCH request. Produce a clear, well-organized report covering key findings.`;

    return `You are XMailAI, an elite AI research analyst.

RULES:
1. Base your report EXCLUSIVELY on the provided web research data.
2. Cite every claim with [Source N] followed by the URL.
3. If sources conflict, note the disagreement.
4. Never fabricate information or URLs.

${depth}

FORMAT: Use full Markdown — ## headings, **bold**, bullet points, tables, > blockquotes, \`code\`.

STRUCTURE:
1. 📋 Executive Summary
2. 🔍 Detailed Analysis
3. 📊 Comparison Tables (if applicable)
4. 💡 Recommendations
5. 🎯 Key Takeaways
6. 📚 Sources Referenced

You have ${sourceCount} sources to work with.`;
}

// ================================================================
// EMAIL TEMPLATE
// ================================================================
function buildEmailTemplate(query, markdownReport, sources) {
    marked.setOptions({ breaks: true, gfm: true });
    let reportHtml = marked.parse(markdownReport);
    reportHtml = applyEmailInlineStyles(reportHtml);

    const sourcesHtml = sources
        .map(
            (s, i) =>
                `<tr>
                    <td style="padding:8px 12px;border-bottom:1px solid #eef0f4;font-size:12px;color:#888;width:30px;vertical-align:top;">${i + 1}</td>
                    <td style="padding:8px 12px;border-bottom:1px solid #eef0f4;vertical-align:top;">
                        <a href="${esc(s.url)}" style="color:#2563eb;text-decoration:none;font-size:13px;font-weight:500;" target="_blank">${esc(s.title)}</a>
                        <br><span style="color:#aaa;font-size:11px;">${esc(s.url.substring(0, 70))}${s.url.length > 70 ? "..." : ""}</span>
                    </td>
                </tr>`
        )
        .join("\n");

    const queryDisplay = esc(query.substring(0, 120).replace(/\n/g, " "));

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>XMailAI Research Report</title>
</head>
<body style="margin:0;padding:0;background:#f0f2f5;font-family:'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f0f2f5;">
<tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="660" cellpadding="0" cellspacing="0" style="max-width:660px;width:100%;">

<!-- HEADER -->
<tr><td style="background:linear-gradient(135deg,#0a0a0a 0%,#1a1a00 50%,#0a0a0a 100%);padding:44px 40px 36px;border-radius:16px 16px 0 0;text-align:center;">
    <div style="display:inline-block;padding:4px 14px;background:rgba(251,191,36,0.15);border:1px solid rgba(251,191,36,0.25);border-radius:100px;font-size:11px;font-weight:600;color:#FBBF24;letter-spacing:0.5px;text-transform:uppercase;margin-bottom:16px;">AI Research Report</div>
    <h1 style="color:#FDE68A;font-size:26px;font-weight:700;margin:10px 0;letter-spacing:-0.5px;">⚡ XMailAI</h1>
    <p style="color:rgba(253,230,138,0.65);font-size:14px;margin:0;max-width:460px;">${queryDisplay}${query.length > 120 ? "..." : ""}</p>
</td></tr>

<!-- BODY -->
<tr><td style="background:#ffffff;padding:36px 40px;border-left:1px solid #e5e8ed;border-right:1px solid #e5e8ed;">
    ${reportHtml}
</td></tr>

<!-- SOURCES -->
<tr><td style="background:#f8f9fb;padding:28px 40px;border:1px solid #e5e8ed;border-top:none;">
    <h3 style="color:#1a1a2e;font-size:15px;font-weight:700;margin:0 0 16px 0;">📚 Sources & References (${sources.length})</h3>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${sourcesHtml}</table>
</td></tr>

<!-- FOOTER -->
<tr><td style="background:#0a0a0a;padding:24px 40px;border-radius:0 0 16px 16px;text-align:center;">
    <p style="color:rgba(253,230,138,0.5);font-size:12px;margin:0 0 4px 0;font-weight:500;">⚡ Powered by XMailAI</p>
    <p style="color:rgba(253,230,138,0.25);font-size:11px;margin:0;">AI-Powered Personalized News Intelligence</p>
</td></tr>

</table>
</td></tr>
</table>
</body>
</html>`;
}

// ================================================================
// EMAIL INLINE STYLES
// ================================================================
function applyEmailInlineStyles(html) {
    return html
        .replace(/<h1>/g, '<h1 style="color:#0f172a;font-size:24px;font-weight:700;margin:32px 0 14px 0;padding-bottom:10px;border-bottom:2px solid #e8ecf4;">')
        .replace(/<h2>/g, '<h2 style="color:#0f172a;font-size:20px;font-weight:700;margin:28px 0 12px 0;">')
        .replace(/<h3>/g, '<h3 style="color:#1e293b;font-size:17px;font-weight:600;margin:22px 0 10px 0;">')
        .replace(/<h4>/g, '<h4 style="color:#334155;font-size:15px;font-weight:600;margin:18px 0 8px 0;">')
        .replace(/<p>/g, '<p style="color:#374151;font-size:15px;line-height:1.75;margin:0 0 14px 0;">')
        .replace(/<strong>/g, '<strong style="color:#0f172a;font-weight:600;">')
        .replace(/<a /g, '<a style="color:#2563eb;text-decoration:underline;font-weight:500;" target="_blank" ')
        .replace(/<ul>/g, '<ul style="margin:8px 0 16px 0;padding-left:24px;color:#374151;">')
        .replace(/<ol>/g, '<ol style="margin:8px 0 16px 0;padding-left:24px;color:#374151;">')
        .replace(/<li>/g, '<li style="font-size:14px;line-height:1.7;margin-bottom:5px;">')
        .replace(/<table>/g, '<table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:14px;border:1px solid #e2e8f0;">')
        .replace(/<thead>/g, '<thead style="background:#f1f5f9;">')
        .replace(/<th>/g, '<th style="background:#f1f5f9;padding:10px 14px;text-align:left;border:1px solid #e2e8f0;font-weight:600;color:#0f172a;font-size:13px;">')
        .replace(/<th /g, '<th style="background:#f1f5f9;padding:10px 14px;text-align:left;border:1px solid #e2e8f0;font-weight:600;color:#0f172a;font-size:13px;" ')
        .replace(/<td>/g, '<td style="padding:10px 14px;border:1px solid #eef0f4;color:#475569;font-size:13px;line-height:1.5;">')
        .replace(/<td /g, '<td style="padding:10px 14px;border:1px solid #eef0f4;color:#475569;font-size:13px;line-height:1.5;" ')
        .replace(/<blockquote>/g, '<blockquote style="margin:16px 0;padding:14px 20px;border-left:4px solid #2563eb;background:#f0f5ff;color:#334155;font-size:14px;border-radius:0 8px 8px 0;">')
        .replace(/<code>/g, '<code style="background:#f1f5f9;padding:2px 6px;border-radius:4px;font-size:13px;color:#be185d;">')
        .replace(/<pre>/g, '<pre style="background:#1e293b;color:#e2e8f0;padding:18px;border-radius:10px;overflow-x:auto;margin:16px 0;font-size:13px;">')
        .replace(/<hr>/g, '<hr style="border:none;border-top:1px solid #e8ecf4;margin:24px 0;">')
        .replace(/<hr \/>/g, '<hr style="border:none;border-top:1px solid #e8ecf4;margin:24px 0;">');
}

// ================================================================
// SEND EMAIL VIA RESEND
// ================================================================
async function sendViaResend(querySubject, html) {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) throw new Error("RESEND_API_KEY is not set.");

    const from = process.env.FROM_EMAIL || "XMailAI <onboarding@resend.dev>";
    const subject = `⚡ XMailAI: ${querySubject.substring(0, 75).replace(/\n/g, " ")}`;

    console.log(`[XMailAI] Sending email via Resend to ${RECIPIENT_EMAIL}`);

    const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
            from,
            to: [RECIPIENT_EMAIL],
            subject,
            html,
        }),
    });

    if (!response.ok) {
        const errBody = await response.text().catch(() => "");
        throw new Error(`Resend API ${response.status}: ${errBody.substring(0, 200)}`);
    }

    console.log("[XMailAI] Email sent successfully!");
}

// ================================================================
// UTILITY
// ================================================================
function esc(str) {
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}
