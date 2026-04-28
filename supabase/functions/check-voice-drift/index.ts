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

    // Check all workspaces at once
    const { data: workspaces } = await supabase
      .from("workspaces")
      .select("id, name")
      .is("deleted_at", null)

    if (!workspaces || workspaces.length === 0) {
      return new Response(
        JSON.stringify({ results: {} }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    const results: Record<string, any> = {}

    for (const ws of workspaces) {
      // Get voice profile example posts
      const { data: profiles } = await supabase
        .from("voice_profiles")
        .select("example_posts, tone_descriptors")
        .eq("workspace_id", ws.id)

      const examplePosts = (profiles || []).flatMap((p: any) => (p.example_posts || []).slice(0, 3))
      const toneDescriptors = (profiles || []).flatMap((p: any) => p.tone_descriptors || [])

      if (examplePosts.length === 0) continue

      // Get recent output
      const { data: recentContent } = await supabase
        .from("generated_content")
        .select("content")
        .eq("workspace_id", ws.id)
        .in("status", ["pushed", "used", "approved"])
        .order("generated_at", { ascending: false })
        .limit(10)

      if (!recentContent || recentContent.length < 5) continue

      // Get recent edits
      const { data: editHistory } = await supabase
        .from("edit_history")
        .select("edited_text, generated_content:content_id (workspace_id)")
        .in("edit_type", ["minor_edit", "heavy_rewrite"])
        .not("edited_text", "is", null)
        .order("created_at", { ascending: false })
        .limit(30)

      const recentEdits = (editHistory || [])
        .filter((h: any) => h.generated_content?.workspace_id === ws.id)
        .slice(0, 8)
        .map((h: any) => h.edited_text?.substring(0, 250) || "")

      // Run drift analysis with Haiku for speed
      const message = await anthropic.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 400,
        messages: [{
          role: "user",
          content: `Analyse voice drift for "${ws.name}". Compare the ORIGINAL voice reference against RECENT output and USER EDITS.

DEFINED TONE: ${toneDescriptors.join(", ") || "not specified"}

ORIGINAL VOICE EXAMPLES:
${examplePosts.map((p: string, i: number) => `${i + 1}. ${p.substring(0, 250)}`).join("\n")}

RECENT GENERATED OUTPUT:
${recentContent.slice(0, 5).map((c: any, i: number) => `${i + 1}. ${c.content.substring(0, 250)}`).join("\n")}

${recentEdits.length > 0 ? `USER EDITS (what they changed output to):\n${recentEdits.slice(0, 5).map((e: string, i: number) => `${i + 1}. ${e}`).join("\n")}` : ""}

Return ONLY a JSON object:
{
  "driftLevel": "none" | "minor" | "moderate" | "significant",
  "driftPct": 15,
  "summary": "one sentence explaining the drift",
  "details": ["specific shift 1", "specific shift 2"],
  "action": "one sentence recommendation"
}

Be precise with driftPct (0-100). Under 10% = none. 10-20% = minor. 20-40% = moderate. 40%+ = significant.`
        }],
      })

      const text = message.content[0].type === "text" ? message.content[0].text : ""
      try {
        const start = text.indexOf("{")
        const end = text.lastIndexOf("}")
        if (start !== -1 && end !== -1) {
          const drift = JSON.parse(text.substring(start, end + 1))
          // Only include if moderate or higher (skip none and minor)
          if (drift.driftLevel === "moderate" || drift.driftLevel === "significant") {
            results[ws.id] = {
              workspaceName: ws.name,
              ...drift,
            }
          }
        }
      } catch {}
    }

    return new Response(
      JSON.stringify({ results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    )
  }
})
