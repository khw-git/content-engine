import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"
import Anthropic from "npm:@anthropic-ai/sdk@^0.39.0"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  try {
    const anthropic = new Anthropic({
      apiKey: Deno.env.get("ANTHROPIC_API_KEY"),
    })

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    )

    const { workspace_id, file_text, file_name } = await req.json()

    if (!workspace_id || !file_text) {
      return new Response(
        JSON.stringify({ error: "workspace_id and file_text are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    // Fetch current workspace profile for context
    const { data: workspace } = await supabase
      .from("workspaces")
      .select("name, type")
      .eq("id", workspace_id)
      .single()

    const { data: voiceProfile } = await supabase
      .from("voice_profiles")
      .select("tone_descriptors, guardrails, example_posts, personal_rules")
      .eq("workspace_id", workspace_id)
      .single()

    const { data: icpConfig } = await supabase
      .from("icp_configs")
      .select("job_titles, industries, pain_points")
      .eq("workspace_id", workspace_id)
      .single()

    const { data: pillars } = await supabase
      .from("content_pillars")
      .select("name, description, keywords")
      .eq("workspace_id", workspace_id)

    const currentProfile = {
      workspace: workspace?.name || "Unknown",
      type: workspace?.type || "client",
      voice: voiceProfile ? {
        tone: voiceProfile.tone_descriptors || [],
        guardrails: voiceProfile.guardrails?.substring(0, 500) || "",
        exampleCount: voiceProfile.example_posts?.length || 0,
      } : null,
      icp: icpConfig ? {
        jobTitles: icpConfig.job_titles || [],
        industries: icpConfig.industries || [],
        painPoints: icpConfig.pain_points || [],
      } : null,
      pillars: (pillars || []).map(p => p.name),
    }

    // Truncate file text to avoid token limits
    const truncated = file_text.substring(0, 30000)

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 8192,
      messages: [
        {
          role: "user",
          content: `You are a workspace profile parser for a B2B content production system. A user has uploaded a file about their business. Extract and structure the information into the appropriate workspace sections.

WORKSPACE: ${currentProfile.workspace} (${currentProfile.type})
CURRENT PROFILE (for context - supplement, don't overwrite useful existing data):
${JSON.stringify(currentProfile, null, 2)}

UPLOADED FILE: ${file_name || "unknown"}
CONTENT:
${truncated}

Extract information into these sections. Only include sections where the file contains relevant data.

CRITICAL EXTRACTION RULES:
- Be EXHAUSTIVE. Extract every specific detail, name, number, example, and proof point from the source text.
- Descriptions must be RICH AND PRACTITIONER-LEVEL, not one-line summaries. A good pillar description is 3-8 sentences covering: what the pillar argues, what posts in this pillar look like, specific client examples and proof points, the hook pattern, and the villain/antagonist.
- Keywords should include specific terms, tools, concepts, client names, and proof points mentioned - not generic category words.
- Preserve the original language and specificity. If the source says "561 leads across Clusters A, B, and D" then that exact detail belongs in the description or keywords, not a generic "lead segmentation".
- Pain points should be specific observed problems, not generic challenges. "Founder defines ICP as SMEs in UK with 10-200 employees and wonders why nothing converts" not "poor ICP definition".

Return a JSON object with these optional keys:

{
  "voice_profile": {
    "tone_descriptors": ["array of tone words - e.g. direct, friendly, authoritative"],
    "guardrails": "any voice/tone rules, writing style notes, brand guidelines as a text block - preserve full detail",
    "example_posts": ["any example content/posts found in the document - include full text"]
  },
  "icp_config": {
    "job_titles": ["every specific job title mentioned as a target"],
    "industries": ["every specific industry, vertical, or sector mentioned"],
    "pain_points": ["specific pain points with context - not generic labels but the actual observed problem with enough detail to be actionable"]
  },
  "content_pillars": [
    {
      "name": "Pillar name",
      "description": "RICH description: what this pillar covers and argues, what posts look like, specific client examples and proof points referenced, hook patterns, the villain/antagonist. 3-8 sentences minimum. Preserve specific numbers, client names, and methodologies from the source.",
      "keywords": ["specific terms, tools, methodologies, client names, proof point references, concepts - not generic category words"]
    }
  ],
  "summary": "One paragraph summary of what was extracted and any notable information that didn't fit the sections above"
}

Only include sections where you found relevant data. Do not fabricate or assume information not present in the document.

Return ONLY the JSON object, no markdown or explanation.`
        }
      ],
    })

    const text = response.content[0].type === "text" ? response.content[0].text : ""
    let parsed: any = {}
    try {
      const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim()
      const start = cleaned.indexOf("{")
      const end = cleaned.lastIndexOf("}")
      if (start === -1 || end === -1) throw new Error("No JSON found")
      parsed = JSON.parse(cleaned.substring(start, end + 1))
    } catch {
      return new Response(
        JSON.stringify({ error: "Failed to parse response", raw: text }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    return new Response(
      JSON.stringify({ parsed, workspace: currentProfile.workspace }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    )
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    )
  }
})
