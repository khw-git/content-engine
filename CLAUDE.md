# Content Hub - CLAUDE.md

## Project Overview

An open-source, AI-powered multi-persona LinkedIn content engine with a self-learning feedback loop. Generates posts in distinct voices per workspace, tracks edits to improve over time, and detects voice drift.

## Tech Stack

- Frontend: React + Vite + Tailwind CSS
- Backend/DB: Supabase (Postgres + Edge Functions)
- Content AI: Claude API (Anthropic SDK)

## Architecture

### Workspaces
Each workspace represents a brand or person you create content for. Workspaces can be type "personal" (your own LinkedIn) or "client" (someone you manage). Each workspace has its own voice profile(s), content pillars, ICP config, and content styles.

### Multi-Persona Support
A workspace can have multiple voice profiles (personas). Each persona has its own tone descriptors, example posts, and guardrails. The generation engine produces content in the selected persona's voice.

### Content Styles (per-workspace, configurable)
Content styles are stored in the `content_styles` table and configured per workspace. Each style has a category, subcategory, subcategory_key, and guidance text. The system auto-cycles through styles for variety.

Default styles use a single "Format" category with Pain, Proof, Behind the Scenes, and Insight subcategories. Power users can create multiple categories with many subcategories.

### Self-Learning Loop
1. **Edit tracking**: When you edit generated content, the system calculates edit distance and classifies edits as minor tweaks or heavy rewrites
2. **Pattern feedback**: The `analyse-feedback` edge function aggregates edit patterns by post type, pillar, and persona to identify systematic issues
3. **Used post examples**: Recently used/pushed posts are fed back into the generation prompt so the AI learns what "good" looks like for this workspace
4. **Voice drift detection**: The `check-voice-drift` function compares recent output against the voice profile to flag when generation quality drifts

### Auto-Rotation
The system tracks how many posts of each type have been generated and automatically suggests the least-used type next, ensuring balanced content variety.

## Database Schema

```sql
workspaces          -- brands/people you create content for
voice_profiles      -- tone, examples, guardrails per persona
content_pillars     -- topics/themes per workspace
icp_configs         -- ideal reader profile per workspace
generated_content   -- all generated posts with status tracking
edit_history        -- edit tracking for feedback loop
content_styles      -- configurable post formats per workspace
```

## Edge Functions

- `generate-content/` -- core generation with buildSystemPrompt, edit pattern learning, used post examples
- `suggest-topics/` -- topic suggestions with style guidance
- `refine-content/` -- refinement loop for iterating on drafts
- `analyse-feedback/` -- feedback analysis, voice drift detection, suggestions
- `check-voice-drift/` -- periodic voice drift monitoring
- `parse-workspace-upload/` -- AI parsing of uploaded voice/brand docs

## Key Architecture Decisions

1. **Generation is user-triggered.** No autonomous decisions or scheduled generation.
2. **Supabase over local storage.** Persistent across sessions, supports Edge Functions.
3. **Auto-rotation is enforced by default** but manually overridable.
4. **Feedback loop is semi-autonomous.** It analyses edit patterns and suggests voice refinements, but you approve before any changes are applied.
5. **Duplicate detection happens at generation time.** Claude sees the last 20 used posts and avoids repeating angles/hooks.

## Content Generation Rules

### Universal LinkedIn rules (built into system prompt)
- Short paragraphs (1-3 lines max)
- First-person proof over generalisation
- Specific numbers/tools/results
- 200-400 words
- Format for direct copy-paste into LinkedIn
- No engagement bait or question endings
- No em dashes (hyphens only)

### Per-workspace customisation
- Voice profiles define tone, guardrails, and example posts
- ICP config shapes who the post speaks to
- Content pillars define what topics to cover
- Content styles define how each format should be structured
