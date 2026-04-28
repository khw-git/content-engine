# Content Hub

An AI-powered multi-persona LinkedIn content engine with a self-learning feedback loop. Generate posts in distinct voices, track edits to improve over time, and detect when your AI output starts drifting from your authentic voice.

## Key Features

- **Per-workspace voice profiles** -- configure tone, example posts, and guardrails for each brand or persona
- **Multi-persona support** -- multiple voice profiles per workspace (e.g. co-founders who each post)
- **Configurable content styles** -- define your own post formats with AI guidance per type
- **Auto-rotation** -- automatically cycles through content pillars and post types for balanced variety
- **Edit-pattern learning** -- tracks your edits to generated content and feeds patterns back into future generation
- **Voice drift detection** -- compares recent output against your voice profile to flag quality drift
- **Design briefs** -- optional visual/design suggestions for carousel, infographic, or other formats
- **Refinement loop** -- iterate on drafts with Claude, refining specific sections or the whole post
- **Bulk generation** -- generate content across multiple workspaces in one session
- **Review queue** -- approval flow with inline editing, edit tracking, and batch actions

## Prerequisites

- [Node.js](https://nodejs.org/) 18+
- A [Supabase](https://supabase.com/) account (free tier works)
- An [Anthropic API key](https://console.anthropic.com/) for Claude

## Setup

### 1. Clone and install

```bash
git clone https://github.com/your-username/content-hub.git
cd content-hub
npm install
```

### 2. Create a Supabase project

1. Go to [supabase.com](https://supabase.com/) and create a new project
2. Open the SQL Editor and run `supabase/migration.sql` to create the database schema
3. Optionally run `supabase/seed.sql` to create a starter workspace with example config

### 3. Configure environment

```bash
cp .env.example .env
```

Edit `.env` and add your Supabase project URL and anon key (found in Settings > API).

### 4. Deploy edge functions

Install the [Supabase CLI](https://supabase.com/docs/guides/cli) and link your project:

```bash
supabase login
supabase link --project-ref your-project-ref
```

Set your Anthropic API key as a secret:

```bash
supabase secrets set ANTHROPIC_API_KEY=sk-ant-your-key-here
```

Deploy the edge functions:

```bash
supabase functions deploy generate-content
supabase functions deploy suggest-topics
supabase functions deploy refine-content
supabase functions deploy analyse-feedback
supabase functions deploy check-voice-drift
supabase functions deploy parse-workspace-upload
```

### 5. Run locally

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

## How the Self-Learning Loop Works

1. **Generate** -- Claude generates a post using your voice profile, content pillars, ICP, and recent used posts as context
2. **Review and Edit** -- you review the post, editing as needed. The system calculates edit distance and classifies edits as minor tweaks or heavy rewrites
3. **Mark as Used** -- when you actually use a post (copy to LinkedIn), mark it as "used"
4. **Feedback analysis** -- the analyse-feedback function aggregates edit patterns to identify which post types or pillars consistently need heavy rewrites
5. **Voice drift check** -- the check-voice-drift function compares recent generations against your voice profile to flag when output starts drifting
6. **Continuous improvement** -- used posts are fed back as positive examples in future generation prompts, and edit patterns inform the system prompt

## How to Add a Workspace

1. Click "Add Workspace" on the dashboard
2. Give it a name and choose type (personal or client)
3. Click into the workspace to configure:
   - **Voice Profile** -- set tone descriptors, paste example posts, write guardrails
   - **Content Pillars** -- add 3-5 core topics with descriptions and keywords
   - **Content Styles** -- configure post formats (defaults: Pain, Proof, BTS, Insight)
   - **ICP Config** -- define your ideal reader's job titles, industries, and pain points
   - **Feedback** -- view edit pattern analysis and voice drift reports

## Tech Stack

- **Frontend**: React 19, Vite, Tailwind CSS v4
- **Backend**: Supabase (Postgres, Edge Functions, Row Level Security)
- **AI**: Claude API via Anthropic SDK (claude-sonnet-4-20250514)
- **Routing**: React Router v7

## Project Structure

```
src/
  App.jsx              -- router and sidebar navigation
  pages/
    Dashboard.jsx      -- workspace overview with stats and format alerts
    Generate.jsx       -- main generation page with style selection
    ReviewQueue.jsx    -- review/approval flow with inline editing
    WorkspaceDetail.jsx -- workspace configuration tabs
    MasterAdmin.jsx    -- bulk generation across workspaces
    Settings.jsx       -- deleted workspace management
  hooks/
    useAutoRotation.js -- auto-cycling through content types
    useContentStyles.js -- workspace content style management
    useGenerateContent.js -- content generation logic
    useReviewQueue.js  -- review queue with edit tracking
    useWorkspaces.js   -- workspace CRUD
    useVoiceProfile.js -- voice profile management
    useContentPillars.js -- pillar management
    useIcpConfig.js    -- ICP configuration
  components/
    RefinePanel.jsx    -- Claude refinement sidebar
    DesignBriefDisplay.jsx -- design brief renderer
    TabNav.jsx         -- tab navigation component
    TagInput.jsx       -- tag input component
  lib/
    supabase.js        -- Supabase client
    postTypeUtils.js   -- post type label utilities
supabase/
  functions/           -- Supabase Edge Functions
  migration.sql        -- database schema
  seed.sql             -- starter workspace data
```

## License

MIT
