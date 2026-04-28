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
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    )

    const anthropic = new Anthropic({
      apiKey: Deno.env.get("ANTHROPIC_API_KEY"),
    })

    const { workspaceId } = await req.json()

    if (!workspaceId) {
      return new Response(
        JSON.stringify({ error: "workspaceId is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    // Fetch edit history joined with generated content for this workspace
    const { data: editHistory } = await supabase
      .from("edit_history")
      .select(`
        *,
        generated_content:content_id (
          workspace_id,
          post_type,
          pillar_id,
          content_pillars:pillar_id (name)
        )
      `)
      .order("created_at", { ascending: false })

    // Filter to this workspace (join filter not available on nested)
    const wsHistory = (editHistory || []).filter(
      (h: any) => h.generated_content?.workspace_id === workspaceId
    )

    if (wsHistory.length === 0) {
      return new Response(
        JSON.stringify({
          postTypeStats: {},
          pillarStats: {},
          suggestions: [],
          rejectionThemes: [],
          totalEdits: 0,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    // Group stats by post_type
    const postTypeStats: Record<string, any> = {}
    const pillarStats: Record<string, any> = {}

    for (const entry of wsHistory) {
      const postType = entry.generated_content?.post_type
      const pillarName = entry.generated_content?.content_pillars?.name || "Unknown"

      // Post type stats
      if (postType) {
        if (!postTypeStats[postType]) {
          postTypeStats[postType] = { total: 0, minor_edit: 0, heavy_rewrite: 0, rejected: 0, totalEditDistance: 0 }
        }
        postTypeStats[postType].total++
        if (entry.edit_type === "minor_edit") postTypeStats[postType].minor_edit++
        if (entry.edit_type === "heavy_rewrite") postTypeStats[postType].heavy_rewrite++
        if (entry.edit_type === "rejected") postTypeStats[postType].rejected++
        if (entry.edit_distance_pct) postTypeStats[postType].totalEditDistance += Number(entry.edit_distance_pct)
      }

      // Pillar stats
      if (!pillarStats[pillarName]) {
        pillarStats[pillarName] = { total: 0, minor_edit: 0, heavy_rewrite: 0, rejected: 0, totalEditDistance: 0 }
      }
      pillarStats[pillarName].total++
      if (entry.edit_type === "minor_edit") pillarStats[pillarName].minor_edit++
      if (entry.edit_type === "heavy_rewrite") pillarStats[pillarName].heavy_rewrite++
      if (entry.edit_type === "rejected") pillarStats[pillarName].rejected++
      if (entry.edit_distance_pct) pillarStats[pillarName].totalEditDistance += Number(entry.edit_distance_pct)
    }

    // Calculate averages
    for (const key of Object.keys(postTypeStats)) {
      const s = postTypeStats[key]
      s.avgEditDistance = s.total > 0 ? Math.round(s.totalEditDistance / (s.total - s.rejected || 1)) : 0
      delete s.totalEditDistance
    }
    for (const key of Object.keys(pillarStats)) {
      const s = pillarStats[key]
      s.avgEditDistance = s.total > 0 ? Math.round(s.totalEditDistance / (s.total - s.rejected || 1)) : 0
      delete s.totalEditDistance
    }

    // Collect rejection reasons
    const rejectionReasons = wsHistory
      .filter((h: any) => h.edit_type === "rejected" && h.rejection_reason)
      .map((h: any) => h.rejection_reason)

    // Fetch workspace voice profile for context (including example posts for drift check)
    const { data: voiceProfiles } = await supabase
      .from("voice_profiles")
      .select("persona_name, tone_descriptors, guardrails, example_posts")
      .eq("workspace_id", workspaceId)

    // Fetch recent generated posts and their edited versions for drift analysis
    const { data: recentContent } = await supabase
      .from("generated_content")
      .select("content, post_type, status")
      .eq("workspace_id", workspaceId)
      .in("status", ["pushed", "used", "approved"])
      .order("generated_at", { ascending: false })
      .limit(15)

    const recentEdits = wsHistory
      .filter((h: any) => h.edit_type !== "rejected" && h.edited_text)
      .slice(0, 15)
      .map((h: any) => h.edited_text?.substring(0, 300) || "")

    // Build Claude prompt
    const statsText = `
## Editing Pattern Summary

### By Post Type
${Object.entries(postTypeStats).map(([type, s]: [string, any]) =>
  `- ${type}: ${s.total} edits (${s.minor_edit} minor, ${s.heavy_rewrite} heavy rewrites, ${s.rejected} rejected, avg ${s.avgEditDistance}% changed)`
).join("\n")}

### By Pillar
${Object.entries(pillarStats).map(([pillar, s]: [string, any]) =>
  `- ${pillar}: ${s.total} edits (${s.minor_edit} minor, ${s.heavy_rewrite} heavy rewrites, ${s.rejected} rejected, avg ${s.avgEditDistance}% changed)`
).join("\n")}

${rejectionReasons.length > 0 ? `### Rejection Reasons\n${rejectionReasons.map((r: string) => `- "${r}"`).join("\n")}` : ""}

### Current Voice Profile
${(voiceProfiles || []).map((p: any) =>
  `Persona: ${p.persona_name || "Default"}\nTone: ${(p.tone_descriptors || []).join(", ")}\nGuardrails: ${(p.guardrails || "").substring(0, 500)}`
).join("\n\n")}
`

    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1500,
      messages: [{
        role: "user",
        content: `You are analysing editing patterns for a LinkedIn content production system. Based on the data below, suggest 3-5 specific, actionable voice profile refinements.

Each suggestion should:
- Reference a specific post type or pillar where the pattern is strongest
- Be concrete enough to paste directly into voice guardrails (not vague advice)
- Address the root cause of heavy rewrites or rejections

${statsText}

Return ONLY a JSON array of strings, each string being one suggestion. No other text.`
      }],
    })

    const responseText = message.content[0].type === "text" ? message.content[0].text : ""
    const jsonMatch = responseText.match(/\[[\s\S]*?\]/)
    const suggestions = jsonMatch ? JSON.parse(jsonMatch[0]) : []

    // Extract rejection themes
    let rejectionThemes: string[] = []
    if (rejectionReasons.length >= 3) {
      const themeMsg = await anthropic.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 500,
        messages: [{
          role: "user",
          content: `Group these rejection reasons into 2-4 recurring themes. Return ONLY a JSON array of strings, each being a theme name with a count.\n\nReasons:\n${rejectionReasons.map((r: string) => `- "${r}"`).join("\n")}`
        }],
      })
      const themeText = themeMsg.content[0].type === "text" ? themeMsg.content[0].text : ""
      const themeMatch = themeText.match(/\[[\s\S]*?\]/)
      rejectionThemes = themeMatch ? JSON.parse(themeMatch[0]) : []
    }

    // Voice drift analysis
    let voiceDrift: any = null
    const examplePosts = (voiceProfiles || []).flatMap((p: any) => (p.example_posts || []).slice(0, 3))
    const recentOutputs = (recentContent || []).map((c: any) => c.content?.substring(0, 300) || "")

    if (examplePosts.length > 0 && (recentOutputs.length >= 5 || recentEdits.length >= 5)) {
      const driftMsg = await anthropic.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 800,
        messages: [{
          role: "user",
          content: `You are a voice consistency analyst for a LinkedIn content system. Compare three sets of content and identify drift.

## ORIGINAL VOICE REFERENCE (the gold standard — how the voice was defined)
${examplePosts.map((p: string, i: number) => `--- Example ${i + 1} ---\n${p.substring(0, 400)}`).join("\n\n")}

## RECENT GENERATED OUTPUT (what Claude is producing now)
${recentOutputs.slice(0, 8).map((p: string, i: number) => `--- Generated ${i + 1} ---\n${p}`).join("\n\n")}

${recentEdits.length > 0 ? `## USER-EDITED VERSIONS (what the user changed Claude's output to)
${recentEdits.slice(0, 8).map((p: string, i: number) => `--- Edited ${i + 1} ---\n${p}`).join("\n\n")}` : ""}

Analyse voice drift:
1. Is the generated output drifting AWAY from the original voice reference? In what ways?
2. Are the user's edits pulling content TOWARD the original voice, or in a NEW direction?
3. What specific attributes have shifted? (tone, sentence length, formality, hook style, structure, vocabulary)

Return ONLY a JSON object:
{
  "driftLevel": "none" | "minor" | "moderate" | "significant",
  "driftDirection": "one sentence: what direction the voice is drifting",
  "specificShifts": ["shift 1", "shift 2", "shift 3"],
  "recommendation": "one sentence: what to do about it"
}`
        }],
      })

      const driftText = driftMsg.content[0].type === "text" ? driftMsg.content[0].text : ""
      try {
        const start = driftText.indexOf("{")
        const end = driftText.lastIndexOf("}")
        if (start !== -1 && end !== -1) {
          voiceDrift = JSON.parse(driftText.substring(start, end + 1))
        }
      } catch {}
    }

    return new Response(
      JSON.stringify({
        postTypeStats,
        pillarStats,
        suggestions,
        rejectionThemes,
        voiceDrift,
        totalEdits: wsHistory.length,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    )
  }
})
