# Prompt CV

AI-powered CV generator that uses Google Docs Handlebars templates and MCP (Model Context Protocol) for seamless AI agent integration.

## Why Prompt CV?

Most free CV generators break words, lines, and pages badly. Paid ones offer no guarantee of quality, and rarely tailor content to the actual job you're applying for. Browser-based AI assistants like ChatGPT and Claude are great at analyzing work experience and crafting targeted descriptions, but they struggle with producing well-formatted, visually polished documents.

Prompt CV solves this by generating CVs as **Google Docs**, so you get the best of both worlds:

- **AI handles the content** — analyzing your experience, tailoring descriptions to job postings, structuring data
- **Google Docs handles the formatting** — your template controls fonts, spacing, layout, and styling
- **You stay in control** — edit the generated doc if needed, export to PDF with one click, no lock-in

### The MCP Advantage

Providing detailed CV generation instructions to an AI every time you open a new chat is tedious, and reusing the same chat window degrades performance as the context grows. Prompt CV's MCP server solves this: one command (`get_cv_instructions`) delivers all the instructions the AI needs, every time, in a fresh context.

### Cost-Effective by Design

Prompt CV avoids AI API costs entirely. It works with the ChatGPT or Claude subscription you already have, through their browser interfaces. The infrastructure runs on AWS Free Tier (12 months), making it practically free for job seekers.

## Features

- **MCP Integration** — Connect Claude or other MCP-compatible AI assistants with a single URL
- **Google Docs Templates** — Design CV layouts in Google Docs using Handlebars syntax
- **Multi-User OAuth** — Each user authenticates with their own Google account
- **REST API** — Generate CVs programmatically without MCP
- **Page Optimization** — Automatically adjust margins to fit CVs within target page count
- **Web Dashboard** — Manage settings, view generated CVs, access documentation
- **Security Management** — View and revoke Google OAuth permissions from the dashboard
- **Admin Dashboard** — Admin users can view all registered users and CV generation stats

## Architecture

Prompt CV runs on three AWS stacks:

| Stack | Description |
|-------|-------------|
| **Prod** (`template.yaml`) | CV API Lambda + Frontend (S3 + CloudFront) |
| **Auth** (`template-auth.yaml`) | Google OAuth, DynamoDB tables, authenticated CV API |
| **MCP** (`template-mcp.yaml`) | MCP server on EC2 + CloudFront for persistent connections |

**Tech stack:** Node.js 20 (TypeScript, ESM), Angular 21, AWS SAM, Google Docs/Drive API, DynamoDB

## Quick Start

### Prerequisites

- [AWS CLI](https://aws.amazon.com/cli/) + [AWS SAM CLI](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-sam-cli.html)
- [Node.js 20+](https://nodejs.org/)
- AWS account ([setup guide](docs/aws-setup.md))
- Google Cloud project with OAuth credentials ([setup guide](docs/google-setup.md))

### Build & Deploy

Stacks must be deployed in order (each depends on the previous). See [AWS Setup Guide](docs/aws-setup.md) for detailed commands and parameter values.

```bash
# 1. Deploy prod stack (CV API + frontend hosting)
cd backend && npm install
sam build && sam deploy --guided

# 2. Deploy auth stack (OAuth + DynamoDB)
sam build -t template-auth.yaml
sam deploy --config-file samconfig-auth.toml --resolve-s3 \
  --parameter-overrides GoogleClientId=... GoogleClientSecret=... \
    JwtSecret=$(openssl rand -hex 32) FrontendUrl=FRONTEND_URL_FROM_STEP_1

# 3. Deploy MCP stack (EC2 + CloudFront — see docs/aws-setup.md for full parameters)
npm run build:mcp
sam build -t template-mcp.yaml
sam deploy --config-file samconfig-mcp.toml --resolve-s3 \
  --parameter-overrides ApiUrl=... AuthApiUrl=... CvAuthFunctionName=... ...

# 4. Deploy frontend (auto-discovers API URLs from stack outputs)
cd ../frontend && npm install
node scripts/deploy.js
```

## Setup Guides

- **[AWS Account Setup](docs/aws-setup.md)** — IAM, SAM CLI, free tier configuration
- **[Google Cloud Setup](docs/google-setup.md)** — OAuth credentials, API enablement, security recommendations
- **[User Guide](docs/user-guide.md)** — Creating custom templates, instructions, and the Claude+ChatGPT workflow

## MCP Tools

| Tool | Description |
|------|-------------|
| `get_doc_content` | Retrieve plain text of Google Docs (single or batch) |
| `get_cv_instructions` | Start CV session, return instructions + context content |
| `update_cv_data` | Deep-merge data into session (optional finalize) |
| `finalize_cv` | Generate CV from session data + template |
| `optimize_cv` | Fit CV within target pages via margin optimization |

## Best Practices

- **Split context documents** — Separate your work history into focused docs (experience, projects, certifications) rather than one massive file. Reference them in your instructions or provide them during the session.
- **Write custom instructions** — Default instructions are a good start, but tailoring them to your industry, seniority level, and target roles produces significantly better results.
- **Cross-validate with multiple AIs** — Generate with one AI (e.g., Claude via MCP), then paste the result into another (e.g., ChatGPT) for review. Different models catch different issues.
- **Tailor per application** — Tell the AI the target position and company. The instructions will automatically emphasize relevant skills and tailor the summary.
- **Optimize page length** — Use `optimize_cv` after generation to fit within 1-2 pages by adjusting margins automatically.

## License

[AGPL-3.0](LICENSE) — If you modify and host this software, you must share your source code.
