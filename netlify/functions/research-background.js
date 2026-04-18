/* ================================================================
   XMailAI — Background Research Function
   Netlify Background Function (returns 202 immediately, runs up to 15 min)
   Pipeline: Tavily Search → RAG Context → OpenRouter Nemotron → Resend Email
   ================================================================ */

import { setStatus } from "./store.js";
import { marked } from "marked";

// ---- Configuration ----
const RECIPIENT_EMAIL = "voltavinaycadila751@gmail.com";
const MODEL_ID = "nvidia/nemotron-3-super-120b-a12b:free";
const SITE_URL = "https://xmailai.netlify.app";
const MAX_CONTENT_PER_SOURCE = 4000;
const DEEP_SUB_QUERY_COUNT = 3;

// ---- Handler ----
export const handler = async (event) => {
    let body;
    try {
        body = JSON.parse(event.body || "{}");
    } catch {
        return { statusCode: 400, body: "Invalid request body" };
    }

    const { query, mode, jobId } = body;
    if (!query || !jobId || !mode) {
        return { statusCode: 400, body: "Missing required fields: query, mode, jobId" };
    }

    const sanitizedQuery = String(query).substring(0, 12000).trim();
    const validMode = mode === "deep" ? "deep" : "search";

    try {
        // =============== STAGE 1: SEARCHING ===============
        await setStatus(jobId, "searching", "Searching the web for relevant sources...");

        const results = await performTavilySearch(sanitizedQuery, validMode);

        if (!results || results.length === 0) {
            throw new Error("No search results found. Try a different query.");
        }

        // =============== STAGE 2: CRAWLING ===============
        await setStatus(jobId, "crawling", `Processing ${results.length} sources...`);

        const ragContext = buildRAGContext(results);

        // =============== STAGE 3: GENERATING ===============
        await setStatus(jobId, "generating", "AI is analyzing and generating your personalized report...");

        const report = await generateWithNemotron(sanitizedQuery, ragContext, validMode, results.length);

        // =============== STAGE 4: SENDING ===============
        await setStatus(jobId, "sending", "Formatting and sending your report...");

        const emailHtml = buildEmailTemplate(sanitizedQuery, report, results);
        await sendViaResend(sanitizedQuery, emailHtml);

        // =============== STAGE 5: COMPLETE ===============
        await setStatus(jobId, "complete", "Research complete! Check your inbox.");

    } catch (error) {
        console.error("[XMailAI] Research pipeline error:", error);
        await setStatus(jobId, "error", error.message || "An unexpected error occurred. Please try again.");
    }

    return { statusCode: 200 };
};


// ================================================================
// TAVILY SEARCH
// ================================================================
async function performTavilySearch(query, mode) {
    const apiKey = process.env.TAVILY_API_KEY;
    if (!apiKey) throw new Error("TAVILY_API_KEY environment variable is not set.");

    const isDeep = mode === "deep";

    // Main search
    const mainResults = await callTavily(
        apiKey,
        query,
        isDeep ? "advanced" : "basic",
        20
    );

    if (!isDeep) return mainResults;

    // Deep mode: additional sub-query searches for broader coverage
    const subQueries = generateSubQueries(query);
    const seenUrls = new Set(mainResults.map((r) => r.url));
    const additionalResults = [];

    for (const sq of subQueries) {
        try {
            const subResults = await callTavily(apiKey, sq, "basic", 20);
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
    const response = await fetch("https://api.tavily.com/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            api_key: apiKey,
            query,
            search_depth: searchDepth,
            max_results: maxResults,
            include_raw_content: true,
            include_answer: true,
        }),
    });

    if (!response.ok) {
        const errBody = await response.text().catch(() => "");
        throw new Error(`Tavily API returned ${response.status}: ${errBody.substring(0, 200)}`);
    }

    const data = await response.json();

    return (data.results || []).map((r) => ({
        title: r.title || "Untitled",
        url: r.url || "",
        content: r.content || "",
        rawContent: (r.raw_content || "").substring(0, MAX_CONTENT_PER_SOURCE),
        score: r.score || 0,
    }));
}

function generateSubQueries(mainQuery) {
    // Create diverse sub-queries from the main query for broader coverage
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
        ctx += `Summary: ${r.content}\n`;
        if (r.rawContent && r.rawContent.length > 50) {
            ctx += `Full Content:\n${r.rawContent}\n`;
        }
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
    if (!apiKey) throw new Error("OPENROUTER_API_KEY environment variable is not set.");

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
            ? "This is a DEEP RESEARCH request. Be extremely thorough. Cover every angle. Produce a detailed, lengthy, professional-grade report. Aim for at least 5000+ words. Use tables, comparisons, and detailed analysis."
            : "This is a standard SEARCH request. Be clear, concise, and actionable. Cover the key findings thoroughly.",
        "",
        "Begin your report now.",
    ].join("\n");

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
            max_tokens: isDeep ? 131072 : 32768,
            temperature: 0.3,
            top_p: 0.9,
        }),
    });

    if (!response.ok) {
        const errBody = await response.text().catch(() => "");
        throw new Error(`OpenRouter API returned ${response.status}: ${errBody.substring(0, 300)}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content || content.trim().length < 50) {
        throw new Error("AI model returned insufficient content. Please try again.");
    }

    return content;
}

function getSystemPrompt(isDeep, sourceCount) {
    const depth = isDeep
        ? `This is a DEEP RESEARCH request. You MUST produce an extremely comprehensive, detailed, and exhaustive research report.
KEY REQUIREMENTS FOR DEEP RESEARCH:
- Aim for at minimum 5000 words, ideally much more
- Cover every single angle and sub-topic within the query
- Create detailed comparison tables wherever relevant
- Provide in-depth analysis of pros, cons, trade-offs
- Include practical real-world recommendations
- Extract and cite information from EVERY source provided
- Use multiple levels of headings (##, ###, ####)
- Add executive summary, detailed sections, and key takeaways
- Do NOT be brief. Length and depth are explicitly required.`
        : `This is a SEARCH request. Produce a clear, well-organized, and insightful report that covers the key findings from the sources. Be thorough but focused. Aim for high information density.`;

    return `You are XMailAI, an elite AI research analyst specializing in producing world-class research reports.

ABSOLUTE RULES — NEVER VIOLATE:
1. Base your report EXCLUSIVELY on the provided web research data. NEVER invent, fabricate, or hallucinate any information.
2. Cite every factual claim with [Source N] notation followed by the source URL.
3. If sources conflict, note the disagreement explicitly.
4. If a topic is NOT covered in the sources, say "Not covered in available sources" — do NOT guess.
5. All URLs must be actual URLs from the sources, never fabricated.

${depth}

FORMATTING REQUIREMENTS:
- Use full Markdown formatting
- ## for major sections, ### for sub-sections, #### for details
- **Bold** for key terms, product names, important findings
- Bullet points and numbered lists for clarity
- Comparison tables (Markdown tables) when comparing tools, models, or options
- > Blockquotes for critical takeaways or standout findings
- Inline \`code\` for technical terms, commands, or model names
- Clear paragraph separation

REPORT STRUCTURE:
1. 📋 Executive Summary (3-5 sentences capturing the most important findings)
2. 🔍 Detailed Analysis (organized by topic/theme with sub-sections)
3. 📊 Comparison Tables (if applicable — comparing tools, models, features)
4. 💡 Practical Recommendations (actionable advice based on findings)
5. 🎯 Key Takeaways (bulleted summary of the most important points)
6. 📚 All Sources Referenced (numbered list of all sources used)

You have ${sourceCount} web sources to work with. Reference as many as relevant and appropriate.`;
}

// ================================================================
// EMAIL TEMPLATE
// ================================================================
function buildEmailTemplate(query, markdownReport, sources) {
    // Configure marked for GFM + breaks
    marked.setOptions({ breaks: true, gfm: true });

    // Convert markdown → HTML
    let reportHtml = marked.parse(markdownReport);

    // Add inline styles for email client compatibility
    reportHtml = applyEmailInlineStyles(reportHtml);

    // Build sources table
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
    const subjectLine = query.substring(0, 80).replace(/\n/g, " ");

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="color-scheme" content="light">
<title>XMailAI Research Report</title>
</head>
<body style="margin:0;padding:0;background:#f0f2f5;font-family:'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;-webkit-font-smoothing:antialiased;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f0f2f5;">
<tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="660" cellpadding="0" cellspacing="0" style="max-width:660px;width:100%;">

<!-- ======== HEADER ======== -->
<tr><td style="background:linear-gradient(135deg,#0a0a2e 0%,#111140 30%,#1a1a5e 60%,#0d3b66 100%);padding:44px 40px 36px;border-radius:16px 16px 0 0;text-align:center;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
    <tr><td align="center">
        <div style="display:inline-block;padding:4px 14px;background:rgba(0,212,255,0.15);border:1px solid rgba(0,212,255,0.25);border-radius:100px;font-size:11px;font-weight:600;color:#00d4ff;letter-spacing:0.5px;text-transform:uppercase;margin-bottom:16px;">AI Research Report</div>
    </td></tr>
    <tr><td align="center">
        <h1 style="color:#ffffff;font-size:26px;font-weight:700;margin:0 0 10px 0;line-height:1.3;letter-spacing:-0.5px;">⚡ XMailAI</h1>
    </td></tr>
    <tr><td align="center">
        <p style="color:rgba(255,255,255,0.65);font-size:14px;margin:0;line-height:1.5;max-width:460px;">${queryDisplay}${query.length > 120 ? "..." : ""}</p>
    </td></tr>
    </table>
</td></tr>

<!-- ======== REPORT BODY ======== -->
<tr><td style="background:#ffffff;padding:36px 40px;border-left:1px solid #e5e8ed;border-right:1px solid #e5e8ed;">
    ${reportHtml}
</td></tr>

<!-- ======== SOURCES ======== -->
<tr><td style="background:#f8f9fb;padding:28px 40px;border:1px solid #e5e8ed;border-top:none;">
    <h3 style="color:#1a1a2e;font-size:15px;font-weight:700;margin:0 0 16px 0;letter-spacing:-0.3px;">📚 Sources & References (${sources.length})</h3>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        ${sourcesHtml}
    </table>
</td></tr>

<!-- ======== FOOTER ======== -->
<tr><td style="background:#0a0a2e;padding:24px 40px;border-radius:0 0 16px 16px;text-align:center;">
    <p style="color:rgba(255,255,255,0.5);font-size:12px;margin:0 0 4px 0;font-weight:500;">⚡ Powered by XMailAI</p>
    <p style="color:rgba(255,255,255,0.25);font-size:11px;margin:0;">AI-Powered Personalized News Intelligence — Tavily · Nemotron · Resend</p>
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
        // Headings
        .replace(/<h1>/g, '<h1 style="color:#0f172a;font-size:24px;font-weight:700;margin:32px 0 14px 0;padding-bottom:10px;border-bottom:2px solid #e8ecf4;line-height:1.3;">')
        .replace(/<h2>/g, '<h2 style="color:#0f172a;font-size:20px;font-weight:700;margin:28px 0 12px 0;line-height:1.3;">')
        .replace(/<h3>/g, '<h3 style="color:#1e293b;font-size:17px;font-weight:600;margin:22px 0 10px 0;line-height:1.3;">')
        .replace(/<h4>/g, '<h4 style="color:#334155;font-size:15px;font-weight:600;margin:18px 0 8px 0;line-height:1.3;">')
        // Paragraphs
        .replace(/<p>/g, '<p style="color:#374151;font-size:15px;line-height:1.75;margin:0 0 14px 0;">')
        // Bold
        .replace(/<strong>/g, '<strong style="color:#0f172a;font-weight:600;">')
        // Links
        .replace(/<a /g, '<a style="color:#2563eb;text-decoration:underline;font-weight:500;" target="_blank" ')
        // Lists
        .replace(/<ul>/g, '<ul style="margin:8px 0 16px 0;padding-left:24px;color:#374151;">')
        .replace(/<ol>/g, '<ol style="margin:8px 0 16px 0;padding-left:24px;color:#374151;">')
        .replace(/<li>/g, '<li style="font-size:14px;line-height:1.7;margin-bottom:5px;color:#374151;">')
        // Tables
        .replace(/<table>/g, '<table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:14px;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;">')
        .replace(/<thead>/g, '<thead style="background:#f1f5f9;">')
        .replace(/<th>/g, '<th style="background:#f1f5f9;padding:10px 14px;text-align:left;border:1px solid #e2e8f0;font-weight:600;color:#0f172a;font-size:13px;">')
        .replace(/<th /g, '<th style="background:#f1f5f9;padding:10px 14px;text-align:left;border:1px solid #e2e8f0;font-weight:600;color:#0f172a;font-size:13px;" ')
        .replace(/<td>/g, '<td style="padding:10px 14px;border:1px solid #eef0f4;color:#475569;font-size:13px;line-height:1.5;">')
        .replace(/<td /g, '<td style="padding:10px 14px;border:1px solid #eef0f4;color:#475569;font-size:13px;line-height:1.5;" ')
        // Blockquotes
        .replace(/<blockquote>/g, '<blockquote style="margin:16px 0;padding:14px 20px;border-left:4px solid #2563eb;background:#f0f5ff;color:#334155;font-size:14px;line-height:1.65;border-radius:0 8px 8px 0;">')
        // Code
        .replace(/<code>/g, '<code style="background:#f1f5f9;padding:2px 6px;border-radius:4px;font-size:13px;font-family:\'SF Mono\',Consolas,\'Courier New\',monospace;color:#be185d;">')
        .replace(/<pre>/g, '<pre style="background:#1e293b;color:#e2e8f0;padding:18px;border-radius:10px;overflow-x:auto;margin:16px 0;font-size:13px;line-height:1.6;">')
        // Horizontal rules
        .replace(/<hr>/g, '<hr style="border:none;border-top:1px solid #e8ecf4;margin:24px 0;">')
        .replace(/<hr \/>/g, '<hr style="border:none;border-top:1px solid #e8ecf4;margin:24px 0;">');
}

// ================================================================
// SEND EMAIL VIA RESEND
// ================================================================
async function sendViaResend(querySubject, html) {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) throw new Error("RESEND_API_KEY environment variable is not set.");

    const from = process.env.FROM_EMAIL || "XMailAI <onboarding@resend.dev>";
    const subject = `⚡ XMailAI: ${querySubject.substring(0, 75).replace(/\n/g, " ")}`;

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
        throw new Error(`Resend API returned ${response.status}: ${errBody.substring(0, 200)}`);
    }
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
