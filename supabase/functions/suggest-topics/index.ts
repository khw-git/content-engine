import "jsr:@supabase/functions-js/edge-runtime.d.ts"
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

    const { workspaceId, pillar, postType, postTypeLabel, postTypeGuidance, icpConfig, recentPosts } = await req.json()

    if (!pillar || !postType || !icpConfig) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: pillar, postType, icpConfig" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    const recentPostsSection = recentPosts && recentPosts.length > 0
      ? `\nIMPORTANT: Avoid repeating angles from these recent posts:\n${recentPosts.map((p: { content: string }) => '- ' + p.content.substring(0, 100)).join('\n')}`
      : ''

    const styleSection = postTypeGuidance
      ? `\nCONTENT STYLE REQUIREMENTS (you MUST follow these closely):\nStyle: ${postTypeLabel || postType}\nGuidance: ${postTypeGuidance}\n\nEvery suggested angle MUST fit this content style. If the style says first person, every angle must be a first-person story. If it says walk through a decision, every angle must be about a specific decision the author made. Do not suggest angles that ignore the style guidance.`
      : ''

    const message = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      messages: [{
        role: "user",
        content: `Generate 6 specific, non-generic LinkedIn post topic suggestions for a "${postTypeLabel || postType}" post.
${styleSection}

Content pillar: ${pillar.name}
Pillar keywords: ${(pillar.keywords || []).join(', ')}
Target audience: ${(icpConfig.job_titles || []).join(', ')}
Pain points: ${(icpConfig.pain_points || []).join(', ')}
${recentPostsSection}

Each suggestion should be a single sentence describing a specific angle that directly follows the content style requirements above. Not a headline, not generic advice. Think about unusual entry points, specific scenarios, and contrarian takes - but always grounded in the style guidance.

Return ONLY a JSON array of 6 strings, no other text.`
      }],
    })

    const responseText = message.content[0].type === "text" ? message.content[0].text : ""
    const jsonMatch = responseText.match(/\[[\s\S]*?\]/)

    if (!jsonMatch) {
      return new Response(
        JSON.stringify({ error: "Failed to parse suggestions from AI response" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    const suggestions: string[] = JSON.parse(jsonMatch[0])

    return new Response(
      JSON.stringify({ suggestions }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    )
  }
})
