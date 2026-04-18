# ⚡ XMailAI — AI-Powered Personalized News Intelligence

A premium web application that performs AI-powered web research and delivers beautifully formatted reports to your inbox. Built with Three.js, Lenis, and deployed on Netlify with serverless functions.

## 🏗️ Architecture

```
Frontend (Static)          →  Netlify Functions (Serverless)
┌─────────────────┐         ┌──────────────────────────────┐
│ Three.js 3D BG  │         │ research-background.js       │
│ Glassmorphic UI │  POST   │   ├─ Tavily Search (RAG)     │
│ Lenis Scroll    │ ──────► │   ├─ OpenRouter Nemotron     │
│ Progress UI     │  Poll   │   ├─ Markdown → Email HTML   │
│                 │ ◄────── │   └─ Resend Email            │
└─────────────────┘         │ status.js                    │
                            │   └─ Netlify Blobs (polling) │
                            └──────────────────────────────┘
```

## 🚀 Quick Setup

### 1. Clone & Install

```bash
git clone <your-repo-url>
cd xmailai
npm install
```

### 2. Configure Environment Variables

Copy `.env.example` → `.env` and fill in your API keys:

| Variable | Description | Get it from |
|---|---|---|
| `TAVILY_API_KEY` | Web search API key | [tavily.com](https://tavily.com) |
| `OPENROUTER_API_KEY` | AI model API key | [openrouter.ai](https://openrouter.ai) |
| `RESEND_API_KEY` | Email delivery API key | [resend.com](https://resend.com) |
| `FROM_EMAIL` | Sender address (default: onboarding@resend.dev) | Resend dashboard |

### 3. Deploy to Netlify

1. Push to GitHub
2. Connect repo in [Netlify](https://app.netlify.com)
3. Set environment variables in **Site Settings → Environment Variables**
4. Deploy!

Or set site name to `xmailai` for `xmailai.netlify.app`

### 4. Local Development

```bash
npx netlify-cli dev
```

> Note: Background functions and Netlify Blobs require `netlify dev` to work locally.

## 🔒 Security

- **A+ Security Headers** via `_headers` file (see [securityheaders.com](https://securityheaders.com))
- **CSP** restricts script/style/font sources
- **HSTS Preload** with 2-year max-age
- **API keys server-side only** — never exposed to frontend
- **Input sanitization** on both client and server
- **Rate limiting** on client-side submissions

## 📧 Email Provider

Uses **Resend** for email delivery:
- Free: 3,000 emails/month, 100/day
- Default sender: `onboarding@resend.dev` (for testing)
- For production: verify your own domain in Resend dashboard

## 🔍 API Credits

| Mode | Tavily Credits | Description |
|---|---|---|
| **Search** | 1 | Basic search, 20 sources |
| **Deep Research** | ~5 | Advanced search (2) + 3 sub-queries (3) for ~80 sources |

## 📁 File Structure

```
├── index.html                          # Landing page (SEO optimized)
├── css/style.css                       # Premium design system
├── js/
│   ├── scene.js                        # Three.js 3D background
│   └── main.js                         # App logic + Lenis
├── netlify/functions/
│   ├── research-background.js          # RAG pipeline (background)
│   └── status.js                       # Progress polling endpoint
├── _headers                            # Security headers
├── netlify.toml                        # Netlify config
├── robots.txt                          # SEO
├── sitemap.xml                         # SEO
├── package.json                        # Dependencies
└── .env.example                        # Env var template
```

## 🌐 SEO

- Schema.org JSON-LD (WebApplication + WebSite with SearchAction)
- Open Graph + Twitter Card meta tags
- Semantic HTML with proper heading hierarchy
- XML Sitemap + robots.txt
- Canonical URL

## License

MIT
