-- Content Hub - Database Migration
-- Run this in your Supabase SQL Editor after creating your project

-- Workspaces (each represents a brand/persona you create content for)
CREATE TABLE workspaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('personal', 'client')),
  posts_per_week INTEGER DEFAULT 4,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Voice profiles per workspace (supports multiple personas per workspace)
CREATE TABLE voice_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  persona_name TEXT, -- nullable for single-persona workspaces
  tone_descriptors TEXT[], -- e.g. ['direct', 'conversational', 'British']
  example_posts TEXT[], -- 3-5 example posts for tone matching
  guardrails TEXT, -- workspace-specific voice rules as text
  personal_rules TEXT, -- nullable, extra rules for personal workspaces
  voice_reference TEXT, -- uploaded voice reference document content
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Content pillars per workspace (topics/themes)
CREATE TABLE content_pillars (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  keywords TEXT[], -- used for topic relevance
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ICP config per workspace (who you're writing for)
CREATE TABLE icp_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  job_titles TEXT[],
  industries TEXT[],
  pain_points TEXT[],
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Generated content
CREATE TABLE generated_content (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  pillar_id UUID REFERENCES content_pillars(id),
  voice_profile_id UUID REFERENCES voice_profiles(id),
  post_type TEXT NOT NULL, -- references content_styles.subcategory_key
  post_category TEXT, -- references content_styles.category
  content TEXT NOT NULL,
  design_brief TEXT, -- nullable, visual/design suggestions
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'in_review', 'approved', 'pushed', 'rejected', 'used')),
  scheduled_for DATE, -- optional scheduling date
  generated_at TIMESTAMPTZ DEFAULT now(),
  pushed_at TIMESTAMPTZ -- when marked complete/used
);

-- Edit history for self-learning feedback loop
CREATE TABLE edit_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_id UUID REFERENCES generated_content(id) ON DELETE CASCADE,
  original_text TEXT NOT NULL,
  edited_text TEXT,
  edit_type TEXT CHECK (edit_type IN ('minor_edit', 'heavy_rewrite', 'rejected')),
  edit_distance_pct NUMERIC, -- percentage of text changed
  rejection_reason TEXT, -- optional note on why rejected
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Content styles per workspace (configurable post types and formats)
CREATE TABLE content_styles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  category TEXT NOT NULL, -- e.g. 'Format', 'Pipeline', 'Authority'
  subcategory TEXT NOT NULL, -- e.g. 'Pain', 'Decision Story'
  subcategory_key TEXT NOT NULL, -- e.g. 'pain', 'decision_story'
  guidance TEXT NOT NULL, -- prompt guidance for generation
  colour TEXT NOT NULL DEFAULT 'gray',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS on all tables, allow all for anon (single-user app)
ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE voice_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_pillars ENABLE ROW LEVEL SECURITY;
ALTER TABLE icp_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE generated_content ENABLE ROW LEVEL SECURITY;
ALTER TABLE edit_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_styles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all" ON workspaces FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON voice_profiles FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON content_pillars FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON icp_configs FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON generated_content FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON edit_history FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON content_styles FOR ALL USING (true) WITH CHECK (true);
