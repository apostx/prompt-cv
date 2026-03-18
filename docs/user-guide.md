# User Guide

This guide explains how to use Prompt CV as an end user, including creating custom templates and instructions.

## Getting Started

1. **Sign in** at the Prompt CV web dashboard with your Google account
2. **Grant Drive access** when prompted (required to save CVs to your Drive)
3. **Connect MCP** (optional) — go to the MCP tab, copy the Server URL, and add it as an MCP connector in Claude

## Creating a CV Template

CV templates are regular Google Docs with Handlebars placeholders. The formatting you apply in Google Docs (fonts, sizes, colors, spacing) is preserved in generated CVs.

### Step 1: Design Your Layout

Create a new Google Doc and design your CV layout. Use any formatting you like — bold headers, colored sections, custom fonts, tables, etc.

### Step 2: Add Placeholders

Replace sample text with Handlebars expressions:

```
{{header.name}}                     → Full name
{{header.email}}                    → Email address
{{header.phone}}                    → Phone number
{{header.location}}                 → City, Country
{{header.linkedin}}                 → LinkedIn URL

{{summary}}                         → Professional summary

{{#each experience}}
  {{company}}                       → Company name
  {{position}}                      → Job title
  {{period}}                        → Employment period
  {{#each highlights}}
    {{this}}                        → Achievement bullet point
  {{/each}}
{{/each}}

{{#each education}}
  {{institution}}                   → School name
  {{degree}}                        → Degree title
  {{period}}                        → Study period
{{/each}}

{{#each skills}}
  {{category}}: {{items}}           → Skill category and list
{{/each}}
```

### Step 3: Configure

1. Copy the Google Doc ID from the URL: `docs.google.com/document/d/THIS_PART/edit`
2. Go to **Settings** in the dashboard and paste it as the **CV Template Doc ID**

See the [default schema](/defaults/schema.txt) for the complete data structure.

## Creating Custom Instructions

Instructions tell the AI how to collect and structure your CV data. Default instructions are provided, but custom ones produce much better results.

### Step 1: Start from Defaults

View the [default instructions](/defaults/instructions.txt) and copy them into a new Google Doc.

### Step 2: Customize

Add your specific requirements:
- Industry-specific terminology and standards
- Preferred tone and writing style
- Specific sections you want (projects, certifications, publications)
- Rules about length, bullet point format, etc.
- Context about what makes a good CV in your field

### Step 3: Configure

Copy the Google Doc ID and set it as the **Instructions Doc ID** in Settings.

## Optimizing Your Instructions: The Feedback Loop

The most effective method for creating great CV instructions involves using two AI assistants:

### The Claude + ChatGPT Workflow

1. **Generate with Claude (via MCP)** — Claude follows your instructions and generates CV data. Claude excels at creating detailed, well-structured professional descriptions.

2. **Analyze with ChatGPT** — Paste the generated CV into ChatGPT and ask for a detailed analysis:
   - What's working well?
   - What could be improved?
   - Are there missing elements for the target role?
   - How does it compare to industry standards?

   ChatGPT tends to provide excellent analytical suggestions, even if its own CV data generation isn't as strong.

3. **Refine instructions with Claude** — Take ChatGPT's suggestions and ask Claude to update your instructions document to address the feedback. For example:
   - "Add a rule that each bullet point should start with a strong action verb"
   - "Include guidance about quantifying achievements with metrics"
   - "Add instructions for tailoring the summary to the specific job posting"

4. **Repeat** — Generate a new CV with the updated instructions, analyze again, and refine. After 2-3 iterations, your instructions will produce consistently excellent CVs.

> **Tip:** Claude tends to be satisfied with its output and rarely suggests improvements on its own. Using ChatGPT as an external reviewer provides the critical feedback needed to improve the instructions.

## Folder Structure

Generated CVs are saved to your Google Drive under the folder path configured in Settings (default: `cv/generated`). The folder is created automatically on first generation.

Each CV filename is derived from: `name_position_company` (snake_case). If a CV with the same name already exists in the folder, it's updated in place.
