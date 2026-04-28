import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import Anthropic from "npm:@anthropic-ai/sdk@^0.39.0"
import { createClient } from "npm:@supabase/supabase-js@^2.103.0"

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

    const supabaseUrl = Deno.env.get("SUPABASE_URL") || ""
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || ""
    const supabase = createClient(supabaseUrl, supabaseKey)

    const body = await req.json()
    const { contentId, workspaceId, currentContent, postType, pillarName, userMessage, highlightedText, conversationHistory, voiceProfileId } = body

    if (!workspaceId || !currentContent || !userMessage) {
      return new Response(
        JSON.stringify({ error: "workspaceId, currentContent, and userMessage are required" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    // Fetch voice profile
    let voiceProfile: any = null
    if (voiceProfileId) {
      const { data } = await supabase
        .from("voice_profiles")
        .select("*")
        .eq("id", voiceProfileId)
        .single()
      voiceProfile = data
    } else {
      const { data } = await supabase
        .from("voice_profiles")
        .select("*")
        .eq("workspace_id", workspaceId)
        .limit(1)
        .single()
      voiceProfile = data
    }

    // Fetch workspace
    const { data: workspace } = await supabase
      .from("workspaces")
      .select("name, type")
      .eq("id", workspaceId)
      .single()

    // Fetch ICP config
    const { data: icpConfig } = await supabase
      .from("icp_configs")
      .select("*")
      .eq("workspace_id", workspaceId)
      .single()

    // Fetch confirmed good posts for style reference
    const { data: usedPosts } = await supabase
      .from("generated_content")
      .select("content, post_type")
      .eq("workspace_id", workspaceId)
      .eq("status", "used")
      .order("pushed_at", { ascending: false })
      .limit(3)

    // Fetch recent edit patterns
    const { data: recentEdits } = await supabase
      .from("edit_history")
      .select("original_text, edited_text, edit_type, generated_content!inner(workspace_id, post_type)")
      .eq("generated_content.workspace_id", workspaceId)
      .in("edit_type", ["minor_edit", "heavy_rewrite"])
      .order("created_at", { ascending: false })
      .limit(5)

    // Fetch recent refinement logs for this workspace to show continuity
    const { data: recentRefinements } = await supabase
      .from("refinement_log")
      .select("messages, applied_content")
      .eq("workspace_id", workspaceId)
      .not("applied_content", "is", null)
      .order("created_at", { ascending: false })
      .limit(3)

    // Build system prompt
    const systemParts: string[] = []

    systemParts.push(`You are a LinkedIn content refinement assistant for ${workspace?.name || "this workspace"}. You help the user edit, improve, and polish LinkedIn posts while maintaining their authentic voice.

Your role:
- Help refine the post when asked — rewrite sections, adjust tone, tighten language, strengthen hooks
- Offer specific, actionable suggestions — not vague advice
- When you suggest a rewrite, output the FULL revised post (not just the changed section) so the user can apply it directly
- Maintain the voice profile strictly — never drift toward generic LinkedIn tone
- If the user asks you to do something that violates the guardrails, flag it but offer an alternative
${highlightedText ? `
IMPORTANT: The user has highlighted a SPECIFIC section of the post for refinement:
"${highlightedText}"
Focus your refinement on this highlighted section ONLY. Keep the rest of the post exactly as-is. When you output the revised post, include the FULL post with only the highlighted section changed.` : ""}`)


    // Voice context
    if (voiceProfile) {
      if (voiceProfile.persona_name) {
        systemParts.push(`\n## Persona: ${voiceProfile.persona_name}`)
      }
      if (voiceProfile.tone_descriptors?.length) {
        systemParts.push(`## Voice/Tone\n${voiceProfile.tone_descriptors.join(", ")}`)
      }
      if (voiceProfile.guardrails) {
        systemParts.push(`## Guardrails\n${voiceProfile.guardrails}`)
      }
      if (workspace?.type === "personal" && voiceProfile.personal_rules) {
        systemParts.push(`## Personal Strategy Rules\n${voiceProfile.personal_rules}`)
      }
      if (voiceProfile.voice_reference) {
        systemParts.push(`## Voice Reference Document\n${voiceProfile.voice_reference.substring(0, 2000)}`)
      }
      if (voiceProfile.example_posts?.length) {
        systemParts.push(`## Example Posts (voice reference)\n${voiceProfile.example_posts.slice(0, 2).map((p: string, i: number) => `--- Example ${i + 1} ---\n${p}`).join("\n\n")}`)
      }
    }

    // LinkedIn rules
    systemParts.push(`
## LinkedIn Rules (ALWAYS apply)
- Short paragraphs (1.5-3 lines max), 200-400 words
- Use numbered or dash (-) bullets, not arrows
- Hook line 1: specific number, tool, or interrogatable claim. NEVER describe the post.
- NEVER use: contrast lines, dramatic pivots, rhetorical mini-sentences, em dashes, engagement-bait, questions at end, "genuinely", "honestly", "straightforward"`)

    // ICP
    if (icpConfig) {
      const icpParts = []
      if (icpConfig.job_titles?.length) icpParts.push(`Targets: ${icpConfig.job_titles.join(", ")}`)
      if (icpConfig.pain_points?.length) icpParts.push(`Pain points: ${icpConfig.pain_points.join(", ")}`)
      if (icpParts.length) systemParts.push(`\n## ICP Context\n${icpParts.join("\n")}`)
    }

    // Post type
    if (postType) {
      const typeGuide: Record<string, string> = {
        pain: "This is a PAIN post — agitate the problem, make the reader feel seen.",
        proof: "This is a PROOF post — results, specific numbers, show don't tell.",
        bts: "This is a BTS post — operational transparency, pull back the curtain.",
        insight: "This is an INSIGHT post — hot take, contrarian POV, paragraph-based.",
      }
      systemParts.push(`\n## Post Type\n${typeGuide[postType] || postType}`)
    }

    // Confirmed good posts as quality reference
    if (usedPosts?.length) {
      systemParts.push(`\n## Posts The User Approved (gold standard)\n${usedPosts.map((p: any, i: number) => `--- Approved ${i + 1} (${p.post_type}) ---\n${p.content.substring(0, 400)}`).join("\n\n")}`)
    }

    // Edit patterns
    if (recentEdits?.length) {
      const editExamples = recentEdits.map((e: any) =>
        `BEFORE: ${(e.original_text || "").substring(0, 200)}...\nAFTER: ${(e.edited_text || "").substring(0, 200)}...`
      ).join("\n\n")
      systemParts.push(`\n## How This User Edits (adapt to these patterns)\n${editExamples}`)
    }

    // Refinement patterns — what this user typically asks for and applies
    if (recentRefinements?.length) {
      const refinementExamples = recentRefinements.map((r: any) => {
        const msgs = r.messages || []
        const userAsks = msgs.filter((m: any) => m.role === "user").map((m: any) => m.content).join("; ")
        return `Asked for: ${userAsks.substring(0, 150)}\nApplied result: ${(r.applied_content || "").substring(0, 200)}...`
      }).join("\n\n")
      systemParts.push(`\n## Recent Refinement Patterns (what this user typically requests)\n${refinementExamples}`)
    }

    // Build conversation messages
    const messages: any[] = []

    // First message establishes the content being refined
    messages.push({
      role: "user",
      content: `Here is the ${postType || "LinkedIn"} post${pillarName ? ` (pillar: ${pillarName})` : ""} I'm reviewing:\n\n---\n${currentContent}\n---\n\nI'd like your help refining it.`,
    })
    messages.push({
      role: "assistant",
      content: `I've read the post. What would you like me to help with? I can rewrite sections, strengthen the hook, tighten the language, adjust tone, or suggest structural changes.`,
    })

    // Add conversation history
    if (conversationHistory?.length) {
      for (const msg of conversationHistory) {
        messages.push({ role: msg.role, content: msg.content })
      }
    }

    // Add the new user message
    messages.push({ role: "user", content: userMessage })

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1500,
      system: systemParts.join("\n"),
      messages,
    })

    const assistantContent = response.content[0].type === "text" ? response.content[0].text : ""

    // Save/update the refinement log
    if (contentId) {
      const fullHistory = [
        ...(conversationHistory || []),
        { role: "user", content: userMessage },
        { role: "assistant", content: assistantContent },
      ]

      // Check if there's an existing log for this content
      const { data: existingLog } = await supabase
        .from("refinement_log")
        .select("id")
        .eq("content_id", contentId)
        .single()

      if (existingLog) {
        await supabase
          .from("refinement_log")
          .update({ messages: fullHistory, updated_at: new Date().toISOString() })
          .eq("id", existingLog.id)
      } else {
        await supabase
          .from("refinement_log")
          .insert({
            content_id: contentId,
            workspace_id: workspaceId,
            messages: fullHistory,
          })
      }
    }

    return new Response(
      JSON.stringify({ content: assistantContent }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    )
  }
})
