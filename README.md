# Datanika Landing Page

Marketing website for [Datanika](../datanika/) — a data pipeline management platform.

## Tech Stack

- **Astro 5** — static site generator
- **Tailwind CSS 4** — utility-first styling via `@tailwindcss/vite`
- **Inter** — Google Fonts (weights 400–800)

## Project Structure

```
datanika-landing/
├── src/
│   ├── components/
│   │   ├── Navbar.astro          # Fixed nav with logo, links, mobile menu
│   │   ├── Hero.astro            # Headline, CTAs, decorative code snippet
│   │   ├── Features.astro        # 6 feature cards grid
│   │   ├── HowItWorks.astro      # 3-step workflow (Connect → Build → Run)
│   │   ├── Integrations.astro    # 13 integration logos
│   │   ├── Pricing.astro         # 4-tier pricing table
│   │   ├── CtaBanner.astro       # Final call-to-action section
│   │   └── Footer.astro          # Links and copyright
│   ├── layouts/
│   │   └── Layout.astro          # Base HTML layout with meta, fonts, styles
│   ├── pages/
│   │   └── index.astro           # Single page composing all components
│   └── styles/
│       └── global.css            # Tailwind import + custom theme
├── astro.config.mjs
├── package.json
└── tsconfig.json
```

## Page Sections

### Feature Cards (6)

1. **Extract & Load** — databases, APIs, files, Google Sheets via dlt
2. **Transform** — SQL transformations powered by dbt-core
3. **Orchestrate** — cron scheduling with detailed run logs
4. **Multi-Tenant** — org isolation with 4-tier RBAC
5. **Data Catalog** — auto-generated schema/table/column browser
6. **SQL Editor** — full-screen editor with autocomplete and compiled SQL preview

### Integrations (13)

PostgreSQL, MySQL, MSSQL, SQLite, BigQuery, Snowflake, Redshift, ClickHouse, MongoDB, S3, REST API, CSV/JSON/Parquet, Google Sheets

### Pricing Tiers (4)

| Tier | Price | Highlights |
|------|-------|------------|
| **Free** | $0/forever | 3 pipelines, 1 member, core integrations |
| **Pro** | $49/month | Unlimited pipelines, 3 members, SQL editor, catalog |
| **Team** | $99/month | 20 members, RBAC, dependency graph |
| **Self-Hosted** | $1,999/year | Unlimited members, on-premise, SSO, dedicated support |

## Commands

```bash
npm install           # install dependencies
npm run dev           # dev server on localhost:4321
npm run build         # production build to dist/
npm run preview       # preview production build
```

## Design Notes

- **Dark theme** — near-black background (`#0a0a0f`) with slate text
- **Gradient accents** — violet (`#8b5cf6`) to cyan (`#06b6d4`) on text, buttons, and borders
- **Glassmorphism** — navbar uses `backdrop-blur-lg` with semi-transparent background
- **Responsive** — mobile-first with `sm`/`md`/`lg` breakpoints
- **Glow effects** — blurred circular gradients for depth
- **Card borders** — all sections use bordered cards with subtle backgrounds
