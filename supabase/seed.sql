-- Content Hub - Seed Data
-- Creates one example workspace with starter configuration.
-- Run this after migration.sql to get started quickly.

-- =============================================================================
-- 1. Create a workspace
-- Change "My Brand" to your name or company name.
-- Type can be 'personal' (your own LinkedIn) or 'client' (someone you manage).
-- =============================================================================

INSERT INTO workspaces (id, name, type, posts_per_week)
VALUES ('00000000-0000-0000-0000-000000000001', 'My Brand', 'personal', 4);

-- =============================================================================
-- 2. Voice profile
-- Customise the tone_descriptors to match your writing style.
-- Add 3-5 of your best LinkedIn posts as example_posts for tone matching.
-- The guardrails field is free-text rules the AI will follow.
-- =============================================================================

INSERT INTO voice_profiles (workspace_id, persona_name, tone_descriptors, example_posts, guardrails)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  NULL, -- NULL for single-persona, or set a name like 'Alice' for multi-persona
  ARRAY['direct', 'conversational', 'knowledgeable'],
  ARRAY[]::TEXT[], -- Paste your best LinkedIn posts here for tone matching
  'Short paragraphs (1-3 lines max).
First-person proof over generalisation.
Specific numbers, tools, and results - never vague.
200-400 words.
No engagement bait or posts ending with questions.
No em dashes - use hyphens only.
Format for direct copy-paste into LinkedIn.'
);

-- =============================================================================
-- 3. Content pillars
-- These are your core topics. The AI cycles through them for variety.
-- Add keywords to help the AI understand what falls under each pillar.
-- =============================================================================

INSERT INTO content_pillars (workspace_id, name, description, keywords) VALUES
  ('00000000-0000-0000-0000-000000000001', 'Industry Insights', 'Trends, observations, and opinions about your industry', ARRAY['trends', 'market', 'industry']),
  ('00000000-0000-0000-0000-000000000001', 'Lessons Learned', 'Real experiences, mistakes, and what you learned from them', ARRAY['lessons', 'mistakes', 'experience']),
  ('00000000-0000-0000-0000-000000000001', 'How We Work', 'Behind the scenes of your process, tools, and approach', ARRAY['process', 'tools', 'workflow']);

-- =============================================================================
-- 4. ICP config
-- Who is your ideal reader? This shapes the AI's framing and language.
-- =============================================================================

INSERT INTO icp_configs (workspace_id, job_titles, industries, pain_points)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  ARRAY['Founder', 'CEO', 'Head of Marketing', 'VP Sales'],
  ARRAY['B2B SaaS', 'Technology', 'Professional Services'],
  ARRAY['Not enough inbound leads', 'Content takes too long to create', 'Inconsistent posting schedule', 'Hard to maintain authentic voice at scale']
);

-- =============================================================================
-- 5. Content styles (post formats)
-- These define the types of posts the AI can generate.
-- The system auto-rotates through them for variety.
-- Guidance text is injected into the AI prompt for each format.
-- =============================================================================

INSERT INTO content_styles (workspace_id, category, subcategory, subcategory_key, guidance, colour, sort_order) VALUES
  ('00000000-0000-0000-0000-000000000001', 'Format', 'Pain', 'pain',
   'Write about a specific pain point your ICP experiences. Name the problem directly. Use a real scenario or story. End with a reframe or insight, not a pitch.',
   'rose', 0),
  ('00000000-0000-0000-0000-000000000001', 'Format', 'Proof', 'proof',
   'Share a concrete result, case study, or outcome. Lead with the specific numbers. Walk through what was done and why it worked. Let the proof speak for itself.',
   'emerald', 1),
  ('00000000-0000-0000-0000-000000000001', 'Format', 'Behind the Scenes', 'bts',
   'Pull back the curtain on your process, tools, or decision-making. Show the messy reality, not the polished version. Make the reader feel like an insider.',
   'amber', 2),
  ('00000000-0000-0000-0000-000000000001', 'Format', 'Insight', 'insight',
   'Share a non-obvious observation or contrarian take about your industry. Ground it in personal experience. The best insights make people stop and think.',
   'indigo', 3);
