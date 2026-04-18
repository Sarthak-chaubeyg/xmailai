/* ================================================================
   XMailAI — Main Application Logic
   Lenis smooth scroll, mode toggle, arrow-button behavior,
   form submission, status polling, and progress UI.
   ================================================================ */

(function () {
    'use strict';

    // ================================================================
    // DEFAULT PROMPT (AI News Curator)
    // ================================================================
    const DEFAULT_PROMPT = `Act as a highly intelligent personalized news curator, interest profiler, and internet researcher.

Your job is to understand my interests deeply, search the internet for the most relevant updates, and then return only the news that matches my personal preferences as closely as possible.

You should not give generic trending news. You should not give broad world news unless it connects strongly to my interests. Your goal is to act like a news filter tailored for me.

MY INTEREST PROFILE

1. Primary interest: AI news
I am most interested in:
- New AI model launches
- Flagship models, whether open-source or closed-source
- Which model is better than GPT, Gemini, Claude, or other leading models
- Free access to premium AI tools
- High or unlimited rate limits
- Practical usefulness for study and coding
- Whether a model can run locally
- Benchmarks, but only when they help compare real-world capability
- Hidden or lesser-known AI tools
- New AI products, platforms, APIs, and model releases
- Major updates in the AI ecosystem

2. What I care about most in AI news
When reading AI news, I usually care about this order:
- Is it free or paid?
- Is it better than GPT or Gemini?
- What are the benchmarks?
- What are the rate limits?
- Is it open-source or closed-source?
- Can it run locally?
- Can it help me study?
- Can it help me code?
- Is it actually useful, or just hype?

3. My main reasons for using AI
My top goals are:
- Studying
- Coding

So whenever possible, connect AI news to:
- learning support
- question generation
- explanation quality
- code generation
- debugging
- productivity
- document understanding
- PDF reading
- local usage
- real-world workflows

4. My content preference in AI
I prefer content in this order:
- A clear explanation of one useful tool or model
- Hidden/free tools that most people do not know
- Short updates about major launches
- Direct comparisons only when useful

My ideal format is:
- Start with the most important point
- Explain why it matters
- Tell me whether it is free or paid
- Tell me whether it is good for studying and coding
- Tell me if it is better than major competitors
- Tell me whether it is open-source or closed-source
- Tell me whether it can run locally
- Tell me about practical use cases
- Then mention limitations

5. Things I do NOT want
Do not waste my time with:
- Clickbait headlines without substance
- Overly technical jargon without explanation
- Irrelevant global news
- Empty hype
- Generic AI news with no practical value
- Low-signal content that sounds impressive but is not useful
- Long theory with no real application

6. My preferred news style
I like news that:
- Starts with the most important fact
- Is easy to understand
- Is useful immediately
- Feels intelligent but not overly technical
- Gives me the core update first and then details
- Balances depth with readability
- Focuses on value, not noise

7. My thinking style
I am not just looking for what is popular. I want:
- what is best right now
- what is most useful
- what can give me an advantage
- what is worth trying
- what has strong real-world value

I care about usefulness more than hype.

YOUR TASK

Using my interest profile above, search the internet and build a personalized news feed for me.

Only include news that matches one or more of these categories:
- AI model launches
- AI tool releases
- free AI access
- high-limit AI tools
- open-source AI models
- closed-source flagship AI model updates
- benchmark comparisons
- AI tools for studying
- AI tools for coding
- local AI model support
- hidden or underrated AI tools
- major AI research or product updates that matter to everyday users

When presenting each item, explain:
- why it is relevant to me
- whether it is free or paid
- whether it is open-source or closed-source
- whether it can help with study and/or coding
- whether it is better than major competing models or tools
- whether it is worth my attention right now

OUTPUT FORMAT

Give the final result in this structure:

1. PERSONALIZED NEWS SUMMARY
A short summary of what kind of news I seem to care about most.

2. TOP NEWS MATCHES FOR ME
List the most relevant news items first.
For each item include:
- Title
- Category
- Why it matches my interests
- Free or paid
- Open-source or closed-source
- Usefulness for studying
- Usefulness for coding
- Local run support if relevant
- Benchmark or competitive relevance if relevant
- Final verdict: must-read, worth checking, or skip

3. MY NEWS PREFERENCE PROFILE
Infer and explain my interests in detail:
- primary interests
- secondary interests
- content style preference
- depth preference
- what I ignore
- what keeps my attention
- what kind of news feed suits me best

4. RECOMMENDED DAILY FEED STRUCTURE
Create a feed layout for me such as:
- AI launches
- best free AI tools
- model comparisons
- study tools
- coding tools
- open-source updates
- local AI updates

5. MY FAVORITE NEWS RULES
Based on my behavior, define the rules that explain my interests:
- I like news that is practical
- I like current AI competition
- I like tools that improve study and coding
- I like updates that are directly useful
- I like news that helps me save time, learn better, or build better things

QUALITY RULES

- Be specific.
- Be accurate.
- Be detailed.
- Be practical.
- Avoid filler.
- Avoid vague summaries.
- Do not hallucinate.
- If something is uncertain, say so clearly.
- Prefer recent and important updates over old or low-value ones.
- Prioritize relevance over popularity.
- Explain things in simple language, but with enough depth to be useful.

Now perform the task and give me my personalized news.`;

    // ================================================================
    // DOM REFERENCES
    // ================================================================
    const queryInput = document.getElementById('query-input');
    const btnSearch = document.getElementById('btn-search');
    const btnDeep = document.getElementById('btn-deep');
    const btnSubmit = document.getElementById('btn-submit');
    const searchContainer = document.getElementById('search-container');
    const searchHint = document.getElementById('search-hint');
    const progressContainer = document.getElementById('progress-container');
    const progressStages = document.getElementById('progress-stages');
    const progressTitle = document.getElementById('progress-title');
    const progressMode = document.getElementById('progress-mode');
    const completionMessage = document.getElementById('completion-message');
    const errorMessage = document.getElementById('error-message');
    const errorText = document.getElementById('error-text');
    const btnNewSearch = document.getElementById('btn-new-search');
    const btnRetry = document.getElementById('btn-retry');

    // ================================================================
    // STATE
    // ================================================================
    let currentMode = 'search';
    let isProcessing = false;
    let pollingTimer = null;
    let lastSubmitTime = 0;
    const RATE_LIMIT_MS = 5000; // Min 5s between submissions

    // ================================================================
    // LENIS SMOOTH SCROLL
    // ================================================================
    try {
        const lenis = new Lenis({
            duration: 1.2,
            easing: function (t) { return Math.min(1, 1.001 - Math.pow(2, -10 * t)); },
            smooth: true,
        });

        function raf(time) {
            lenis.raf(time);
            requestAnimationFrame(raf);
        }
        requestAnimationFrame(raf);
    } catch (e) {
        console.warn('Lenis not available, using native scroll.');
    }

    // ================================================================
    // MODE TOGGLE
    // ================================================================
    btnSearch.addEventListener('click', function () {
        if (isProcessing) return;
        currentMode = 'search';
        btnSearch.classList.add('active');
        btnSearch.setAttribute('aria-checked', 'true');
        btnDeep.classList.remove('active');
        btnDeep.setAttribute('aria-checked', 'false');
    });

    btnDeep.addEventListener('click', function () {
        if (isProcessing) return;
        currentMode = 'deep';
        btnDeep.classList.add('active');
        btnDeep.setAttribute('aria-checked', 'true');
        btnSearch.classList.remove('active');
        btnSearch.setAttribute('aria-checked', 'false');
    });

    // ================================================================
    // AUTO-RESIZE TEXTAREA
    // ================================================================
    queryInput.addEventListener('input', function () {
        this.style.height = 'auto';
        this.style.height = Math.min(this.scrollHeight, 300) + 'px';
    });

    // ================================================================
    // SUBMIT BUTTON — DOUBLE-TAP PROMPT BEHAVIOR
    // ================================================================
    btnSubmit.addEventListener('click', handleSubmitClick);

    // Ctrl+Enter / Cmd+Enter shortcut
    queryInput.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            handleSubmitClick();
        }
    });

    function handleSubmitClick() {
        if (isProcessing) return;

        var query = queryInput.value.trim();

        // If input is empty → paste the default prompt (first click)
        if (!query) {
            queryInput.value = DEFAULT_PROMPT;
            queryInput.style.height = 'auto';
            queryInput.style.height = Math.min(queryInput.scrollHeight, 300) + 'px';
            queryInput.focus();
            // Update hint
            searchHint.textContent = 'Default AI news prompt loaded. Press → again to send.';
            return;
        }

        // Rate limit check
        var now = Date.now();
        if (now - lastSubmitTime < RATE_LIMIT_MS) {
            return;
        }
        lastSubmitTime = now;

        // Start research
        startResearch(query, currentMode);
    }

    // ================================================================
    // UUID GENERATOR
    // ================================================================
    function generateJobId() {
        return 'xxxxxxxxxxxx4xxxyxxxxxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
            var r = (Math.random() * 16) | 0;
            var v = c === 'x' ? r : (r & 0x3) | 0x8;
            return v.toString(16);
        });
    }

    // ================================================================
    // INPUT SANITIZATION
    // ================================================================
    function sanitizeInput(str) {
        var div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    // ================================================================
    // START RESEARCH
    // ================================================================
    function startResearch(query, mode) {
        isProcessing = true;
        btnSubmit.disabled = true;

        var jobId = generateJobId();

        // UI: hide search, show progress
        searchContainer.style.display = 'none';
        progressContainer.classList.add('visible');
        completionMessage.classList.remove('visible');
        errorMessage.classList.remove('visible');
        progressStages.style.display = 'flex';

        // Set mode label
        progressMode.textContent = mode === 'deep' ? 'Deep Research' : 'Search';

        // Reset stages
        resetAllStages();
        setStageActive('searching');

        // Send request
        fetch('/.netlify/functions/research-background', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                query: query.substring(0, 12000),
                mode: mode,
                jobId: jobId,
            }),
        })
            .then(function (res) {
                if (res.status === 202 || res.ok) {
                    startStatusPolling(jobId);
                } else {
                    throw new Error('Server returned ' + res.status + '. Please try again.');
                }
            })
            .catch(function (err) {
                showError(err.message || 'Failed to start research. Check your connection.');
            });
    }

    // ================================================================
    // STATUS POLLING
    // ================================================================
    function startStatusPolling(jobId) {
        var failCount = 0;
        var maxFails = 8;

        pollingTimer = setInterval(function () {
            fetch('/.netlify/functions/status?id=' + encodeURIComponent(jobId))
                .then(function (res) { return res.json(); })
                .then(function (data) {
                    failCount = 0;

                    if (!data || !data.stage) return;

                    switch (data.stage) {
                        case 'searching':
                            setStageActive('searching');
                            progressTitle.textContent = 'Searching the web...';
                            break;

                        case 'crawling':
                            setStageCompleted('searching');
                            setStageActive('crawling');
                            progressTitle.textContent = 'Crawling sources...';
                            break;

                        case 'generating':
                            setStageCompleted('searching');
                            setStageCompleted('crawling');
                            setStageActive('generating');
                            progressTitle.textContent = 'Generating insights...';
                            break;

                        case 'sending':
                            setStageCompleted('searching');
                            setStageCompleted('crawling');
                            setStageCompleted('generating');
                            setStageActive('sending');
                            progressTitle.textContent = 'Sending email...';
                            break;

                        case 'complete':
                            stopPolling();
                            setStageCompleted('searching');
                            setStageCompleted('crawling');
                            setStageCompleted('generating');
                            setStageCompleted('sending');
                            progressTitle.textContent = 'Done!';
                            setTimeout(showCompletion, 700);
                            break;

                        case 'error':
                            stopPolling();
                            showError(data.message || 'An error occurred during research.');
                            break;
                    }
                })
                .catch(function () {
                    failCount++;
                    if (failCount >= maxFails) {
                        stopPolling();
                        showError('Lost connection to server. Please try again.');
                    }
                });
        }, 2500);
    }

    function stopPolling() {
        if (pollingTimer) {
            clearInterval(pollingTimer);
            pollingTimer = null;
        }
    }

    // ================================================================
    // PROGRESS STAGE UI
    // ================================================================
    var stageOrder = ['searching', 'crawling', 'generating', 'sending'];

    function resetAllStages() {
        stageOrder.forEach(function (id) {
            var el = document.getElementById('stage-' + id);
            if (el) {
                el.classList.remove('active', 'completed');
            }
        });
        document.querySelectorAll('.stage-connector').forEach(function (c) {
            c.classList.remove('lit');
        });
    }

    function setStageActive(stageId) {
        var el = document.getElementById('stage-' + stageId);
        if (el) {
            el.classList.remove('completed');
            el.classList.add('active');
        }
    }

    function setStageCompleted(stageId) {
        var el = document.getElementById('stage-' + stageId);
        if (el) {
            el.classList.remove('active');
            el.classList.add('completed');
        }
        // Light up the connector after this stage
        if (el && el.nextElementSibling && el.nextElementSibling.classList.contains('stage-connector')) {
            el.nextElementSibling.classList.add('lit');
        }
    }

    // ================================================================
    // RESULT UI
    // ================================================================
    function showCompletion() {
        progressStages.style.display = 'none';
        var pulse = document.querySelector('.progress-pulse');
        if (pulse) pulse.style.display = 'none';
        completionMessage.classList.add('visible');
        isProcessing = false;
        btnSubmit.disabled = false;
    }

    function showError(message) {
        stopPolling();
        progressStages.style.display = 'none';
        var pulse = document.querySelector('.progress-pulse');
        if (pulse) pulse.style.display = 'none';
        errorText.textContent = message;
        errorMessage.classList.add('visible');
        isProcessing = false;
        btnSubmit.disabled = false;
    }

    function resetToSearch() {
        stopPolling();
        isProcessing = false;
        btnSubmit.disabled = false;

        queryInput.value = '';
        queryInput.style.height = 'auto';
        searchHint.innerHTML = 'Press <kbd>→</kbd> once to load the default AI news prompt, press again to send';

        progressContainer.classList.remove('visible');
        completionMessage.classList.remove('visible');
        errorMessage.classList.remove('visible');
        progressStages.style.display = 'flex';
        var pulse = document.querySelector('.progress-pulse');
        if (pulse) pulse.style.display = '';

        searchContainer.style.display = '';
        resetAllStages();
        queryInput.focus();
    }

    btnNewSearch.addEventListener('click', resetToSearch);
    btnRetry.addEventListener('click', resetToSearch);

})();
