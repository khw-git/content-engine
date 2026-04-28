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

    const {
      voiceProfile,
      pillars,
      icpConfig,
      selectedPillar,
      postType,
      postCategory,
      topic,
      recentPosts,
      includeDesignBrief,
      designType,
      workspaceName,
      workspaceType,
      workspaceId,
      retryDifferentAngle,
      existingContent,
      previousDesignBrief,
      detailedPost,
    } = await req.json()

    // Fetch dynamic guidance for this post type from content_styles
    let styleGuidance = ""
    if (workspaceId && postType) {
      const { data: styleRow } = await supabase
        .from("content_styles")
        .select("category, subcategory, guidance")
        .eq("workspace_id", workspaceId)
        .eq("subcategory_key", postType)
        .maybeSingle()

      if (styleRow) {
        styleGuidance = `${styleRow.subcategory.toUpperCase()} post (${styleRow.category}): ${styleRow.guidance}`
      }
    }

    // Fetch posts marked as "used" — these are confirmed good examples
    let usedExamples: { content: string; postType: string }[] = []
    if (workspaceId) {
      const { data: usedPosts } = await supabase
        .from("generated_content")
        .select("content, post_type")
        .eq("workspace_id", workspaceId)
        .eq("status", "used")
        .order("pushed_at", { ascending: false })
        .limit(5)

      if (usedPosts) {
        usedExamples = usedPosts.map((p: any) => ({
          content: p.content?.substring(0, 400) || "",
          postType: p.post_type,
        }))
      }
    }

    // Fetch recent edit history for this workspace to learn from user corrections
    let editExamples: { original: string; edited: string; editType: string; postType: string }[] = []
    if (workspaceId) {
      const { data: edits } = await supabase
        .from("edit_history")
        .select(`
          original_text,
          edited_text,
          edit_type,
          generated_content:content_id (workspace_id, post_type)
        `)
        .in("edit_type", ["minor_edit", "heavy_rewrite"])
        .order("created_at", { ascending: false })
        .limit(50)

      if (edits) {
        editExamples = edits
          .filter((e: any) => e.generated_content?.workspace_id === workspaceId && e.edited_text)
          .slice(0, 10)
          .map((e: any) => ({
            original: e.original_text?.substring(0, 300) || "",
            edited: e.edited_text?.substring(0, 300) || "",
            editType: e.edit_type,
            postType: e.generated_content?.post_type || "",
          }))
      }
    }

    const systemPrompt = buildSystemPrompt({
      voiceProfile,
      pillars,
      icpConfig,
      selectedPillar,
      postType,
      styleGuidance,
      recentPosts,
      includeDesignBrief,
      detailedPost,
      workspaceName,
      workspaceType,
      editExamples,
      usedExamples,
    })

    let userPrompt = ""

    if (existingContent && includeDesignBrief) {
      // Design brief only mode — we already have the post content
      userPrompt = `Here is an existing LinkedIn post. Generate ONLY a design brief for it — do NOT generate a new post.

Post type: ${postType.toUpperCase()}
Pillar: ${selectedPillar.name}

THE POST:
${existingContent}`
    } else {
      userPrompt = `Generate a LinkedIn post.

Post type: ${postType.toUpperCase()}
Pillar: ${selectedPillar.name}
${selectedPillar.description ? `Pillar context: ${selectedPillar.description}` : ""}`

      if (topic) {
        userPrompt += `\nTopic/angle: ${topic}`
      }

      if (retryDifferentAngle) {
        userPrompt += `\n\nIMPORTANT: The previous attempt was too similar to a recent post. Take a completely different angle, hook, and structure. Do NOT repeat any hooks or angles from the recent posts listed in the system prompt.`
      }
    }

    if (includeDesignBrief) {
      const designPrompts: Record<string, string> = {
        carousel: `After the post, add a section starting with "---DESIGN BRIEF---" with a detailed carousel brief:
- Recommended number of slides (typically 5-10)
- Exact text/headline for each slide (keep each to 1-2 short sentences max)
- Visual direction per slide (background colour, icon suggestions, layout)
- Hook slide: what goes on slide 1 to stop the scroll
- CTA slide: what the final slide should say
- Overall visual style recommendation`,
        infographic: `After the post, add a section starting with "---DESIGN BRIEF---" with a detailed infographic brief:
- Key data points or statistics to visualise
- Recommended layout (vertical flow, sections, hierarchy)
- Header/title for the infographic
- 3-5 specific sections with their content and visual treatment
- Colour palette suggestion
- Icon or illustration suggestions for each section
- Footer CTA or branding note`,
        workflow: `After the post, add a section starting with "---DESIGN BRIEF---" with a detailed workflow/process diagram brief:
- Number of steps in the workflow
- Exact label and 1-line description for each step
- Flow direction (left to right, top to bottom, circular)
- Decision points or branches if applicable
- Visual style (arrows, numbered boxes, connected circles)
- Start and end labels
- Any icons or symbols per step`,
        meme: `After the post, add a section starting with "---DESIGN BRIEF---" with a detailed meme brief:
- Recommended meme format/template (e.g. Drake, Distracted Boyfriend, expanding brain, two buttons, custom)
- Exact text for each panel/section of the meme
- The joke or contrast being made
- Tone guidance (self-deprecating, industry inside joke, relatable frustration)
- Alternative meme option if the first doesn't land`,
        comparison: `After the post, add a section starting with "---DESIGN BRIEF---" with a detailed comparison visual brief:
- Two sides being compared (labels for each)
- 4-6 specific comparison points with text for each side
- Visual treatment (split screen, table, before/after, red vs green)
- Header/title for the comparison
- Which side should feel "right" or aspirational
- Any icons or visual cues to reinforce the contrast`,
        quote_card: `After the post, add a section starting with "---DESIGN BRIEF---" with a detailed quote card brief:
- The exact quote to feature (pull the strongest 1-2 sentences from the post)
- Attribution text (name, title, company)
- Background style (solid colour, gradient, subtle pattern, photo overlay)
- Font style suggestion (bold serif, clean sans-serif, handwritten accent)
- Brand colour recommendation
- Optional secondary text or context line below the quote`,
        checklist: `After the post, add a section starting with "---DESIGN BRIEF---" with a detailed checklist visual brief:
- Title/header for the checklist
- 5-8 specific checklist items with exact text
- Which items should be checked vs unchecked (if telling a story)
- Visual style (clean checkboxes, numbered list, scorecard with ratings)
- Any grouping or sections within the checklist
- Footer CTA or scoring guide if applicable`,
        data_viz: `After the post, add a section starting with "---DESIGN BRIEF---" with a detailed data visualisation brief:
- Chart type recommendation (bar, pie, line, donut, comparison bars)
- Exact data points and labels to plot
- Title and subtitle for the chart
- Axis labels if applicable
- Key insight or callout to highlight (e.g. circle one bar, annotate a spike)
- Colour coding recommendations
- Source attribution if referencing external data`,
        screenshot: `After the post, add a section starting with "---DESIGN BRIEF---" with a detailed screenshot/mockup brief:
- What should be shown (dashboard, results page, tool interface, email, message)
- Key elements to highlight or annotate
- Any numbers, metrics, or results that should be visible
- Annotation style (arrows, circles, callout boxes)
- Whether to blur/redact sensitive information
- Device frame recommendation (browser window, mobile, none)`,
      }

      const prompt = designPrompts[designType] ||
        `After the post, add a section starting with "---DESIGN BRIEF---" with structural suggestions for an accompanying graphic (carousel structure, visual hooks, layout ideas). Keep it concise and actionable.`

      const mockupInstruction = `

After the text description, add a section starting with "---MOCKUP---" containing a single inline SVG element that acts as a low-fidelity wireframe/mockup of the design.

SVG rules:
- Use a viewBox of "0 0 400 500" (portrait) or "0 0 600 400" (landscape) depending on the format
- Use only rectangles, text, lines, and circles - no images
- Use a light grey (#f3f4f6) background with dark grey (#374151) text
- Use colour accents sparingly: indigo (#6366f1) for highlights, green (#22c55e) for positive, red (#ef4444) for negative
- Show actual content text from the post - headlines, bullet points, key phrases - not placeholder "lorem ipsum"
- For carousels: show 2-3 slides side by side with content
- For infographics: show the sections stacked vertically with icons represented as circles
- For checklists: show checkbox squares with text lines
- For comparisons: show a split layout
- Keep it clean and readable - this is a wireframe, not a finished design
- Output ONLY the <svg>...</svg> element with no wrapper or code fences`

      let previousBriefInstruction = ""
      if (previousDesignBrief) {
        // Strip mockup SVG from previous brief for comparison
        const prevText = previousDesignBrief.split("---MOCKUP---")[0].trim()
        previousBriefInstruction = `

IMPORTANT: The user has already seen this design brief and wants a DIFFERENT one. Same design type (${designType}), but the structure, layout, content selection, and visual approach must be distinctly different. Do NOT repeat the same sections, headlines, slide content, or layout direction.

PREVIOUS BRIEF (do NOT repeat this):
${prevText.substring(0, 800)}`
      }

      userPrompt += `\n\n${prompt}${previousBriefInstruction}${mockupInstruction}`
    }

    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: includeDesignBrief ? 4000 : 1500,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    })

    const fullText = message.content[0].type === "text" ? message.content[0].text : ""

    let content = fullText
    let designBrief = null
    let designMockup = null

    if (includeDesignBrief && fullText.includes("---DESIGN BRIEF---")) {
      const parts = fullText.split("---DESIGN BRIEF---")
      content = parts[0].trim()
      let briefSection = parts[1] || ""

      // Split mockup from description
      if (briefSection.includes("---MOCKUP---")) {
        const mockupParts = briefSection.split("---MOCKUP---")
        designBrief = mockupParts[0].trim()
        // Extract just the SVG element
        const svgMatch = mockupParts[1].match(/<svg[\s\S]*?<\/svg>/)
        designMockup = svgMatch ? svgMatch[0] : null
      } else {
        designBrief = briefSection.trim()
      }
    }

    // If we were generating a brief for existing content, return the original content
    if (existingContent) {
      content = existingContent
      if (!designBrief) {
        // The whole response might contain both brief and mockup
        let raw = fullText.trim()
        if (raw.includes("---MOCKUP---")) {
          const parts = raw.split("---MOCKUP---")
          designBrief = parts[0].trim()
          const svgMatch = parts[1].match(/<svg[\s\S]*?<\/svg>/)
          designMockup = svgMatch ? svgMatch[0] : null
        } else {
          designBrief = raw
        }
      }
    }

    return new Response(
      JSON.stringify({ content, designBrief, designMockup }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    )
  }
})

function buildSystemPrompt({
  voiceProfile,
  pillars,
  icpConfig,
  selectedPillar,
  postType,
  styleGuidance,
  recentPosts,
  includeDesignBrief,
  detailedPost,
  workspaceName,
  workspaceType,
  editExamples,
  usedExamples,
}: {
  voiceProfile: any
  pillars: any[]
  icpConfig: any
  selectedPillar: any
  postType: string
  styleGuidance: string
  recentPosts: any[]
  includeDesignBrief: boolean
  detailedPost?: boolean
  workspaceName: string
  workspaceType: string
  editExamples: { original: string; edited: string; editType: string; postType: string }[]
  usedExamples: { content: string; postType: string }[]
}) {
  const parts: string[] = []

  parts.push(`You are a LinkedIn content writer for ${workspaceName}. You write posts that sound like a real person, not a content mill.`)

  // Universal LinkedIn rules
  const lengthRule = detailedPost
    ? `- DETAILED POST MODE — THIS IS CRITICAL: The post MUST be between 2,500 and 3,000 characters (including spaces). This is a hard minimum and maximum. Count your output. A standard post is 800-1,200 characters — this must be at least DOUBLE that length. Use the extra space to: go deeper on the reasoning behind decisions, walk through multi-step processes with real detail, tell a fuller story with timestamps and specifics, or break down something complex step by step. Use section breaks (- - - - - - - - - - - - -) to separate distinct narrative shifts. Every section must earn its place but you MUST hit the 2,500 character minimum — do not write a standard-length post.`
    : `- Keep posts between 800 and 1,500 characters (roughly 150-250 words). Concise and punchy.`

  parts.push(`
## LinkedIn Format Rules (MUST follow)
- Short paragraphs (1.5-3 lines max)
- Numbered lists mid-post for frameworks only
- First-person proof over generalisation
- "Founders" as subject noun
- Specific numbers/tools/results
${lengthRule}
- Use numbered or dash (-) bullets, not arrows
- Format for direct copy-paste into LinkedIn

## Hook Formula
Credibility + attainability + teachable framing. Authority through tangible proof, aspirational yet believable, framed as a teachable/repeatable playbook.
Hook line 1: name a tool/trend, implausible result, unexpected scene, or interrogatable claim. NEVER describe the post in line 1.

## NEVER Use
- Contrast lines ("It's not about X, it's about Y")
- Dramatic pivots ("But here's the thing")
- Rhetorical mini-sentences
- Em dashes (use hyphens only)
- Engagement-bait or posts ending with questions
- Question reframes
- Rule-of-three staccato lines
- "Here's the kicker"
- Anything templated, motivational, or LinkedIn-bro coded
- The word "genuinely", "honestly", or "straightforward"`)

  // Post type guidance (dynamic from content_styles table)
  if (styleGuidance) {
    parts.push(`\n## Post Type\n${styleGuidance}`)
  } else {
    // Fallback for legacy content without styles configured
    const fallbackGuide: Record<string, string> = {
      pain: "PAIN post: Identify an ICP pain point and agitate the problem. Make the reader feel seen. No solution selling - just nail the problem.",
      proof: "PROOF post: Results, case studies, specific numbers. Show don't tell. Concrete outcomes with context.",
      bts: "BEHIND THE SCENES post: Process, how we do things, operational transparency. Pull back the curtain on real work.",
      insight: "INSIGHT post: Hot take, industry observation, contrarian POV. Paragraph-based style. Take a strong position.",
    }
    if (fallbackGuide[postType]) {
      parts.push(`\n## Post Type\n${fallbackGuide[postType]}`)
    }
  }

  // Voice profile
  if (voiceProfile) {
    if (voiceProfile.tone_descriptors?.length) {
      parts.push(`\n## Voice/Tone\n${voiceProfile.tone_descriptors.join(", ")}`)
    }
    if (voiceProfile.guardrails) {
      parts.push(`\n## Workspace Guardrails\n${voiceProfile.guardrails}`)
    }
    if (workspaceType === "personal" && voiceProfile.personal_rules) {
      parts.push(`\n## Personal Strategy Rules\n${voiceProfile.personal_rules}`)
    }
    if (voiceProfile.voice_reference) {
      parts.push(`\n## Voice Reference Document\nThe following is a reference document describing this persona's tone, style, and brand voice. Use this to inform your writing — especially if no example posts are available.\n\n${voiceProfile.voice_reference.substring(0, 3000)}`)
    }
    if (voiceProfile.example_posts?.length) {
      parts.push(`\n## Example Posts (match this voice)\n${voiceProfile.example_posts.map((p: string, i: number) => `--- Example ${i + 1} ---\n${p}`).join("\n\n")}`)
    }
  }

  // ICP context
  if (icpConfig) {
    parts.push(`\n## Target ICP`)
    if (icpConfig.job_titles?.length) parts.push(`Job titles: ${icpConfig.job_titles.join(", ")}`)
    if (icpConfig.industries?.length) parts.push(`Industries: ${icpConfig.industries.join(", ")}`)
    if (icpConfig.pain_points?.length) parts.push(`Pain points: ${icpConfig.pain_points.join(", ")}`)
  }

  // Pillar context
  if (selectedPillar.keywords?.length) {
    parts.push(`\n## Pillar Keywords\n${selectedPillar.keywords.join(", ")}`)
  }

  // Posts confirmed as "good" by the user — match this quality and style
  if (usedExamples?.length > 0) {
    const examples = usedExamples.map((e, i) =>
      `--- Confirmed Good ${i + 1} (${e.postType}) ---\n${e.content}`
    ).join("\n\n")
    parts.push(`\n## Confirmed Good Posts (USER-APPROVED QUALITY)\nThe user has marked these posts as successfully used. These represent the gold standard — match their tone, structure, depth, and style.\n\n${examples}`)
  }

  // Edit pattern learning - show Claude how the user corrects its output
  if (editExamples?.length > 0) {
    const examples = editExamples.map((e, i) =>
      `--- Correction ${i + 1} (${e.postType}, ${e.editType}) ---\nBEFORE: ${e.original}\nAFTER: ${e.edited}`
    ).join("\n\n")
    parts.push(`\n## User Edit Patterns (LEARN FROM THESE)\nThe user consistently corrects your output in the following ways. Study the before/after pairs and adapt your writing to match the AFTER versions. These represent the user's preferred style, tone, and structure.\n\n${examples}`)
  }


  // Differentiation + duplicate prevention
  if (recentPosts?.length) {
    const recentHooks = recentPosts.slice(0, 10).map((p: any) => {
      const firstLine = (p.content || "").split("\n")[0] || ""
      return firstLine.substring(0, 100)
    })

    parts.push(`\n## Recent Posts — Differentiation Required
The following posts have already been published. You may use similar structures and formats — that's fine. But each new post MUST feel like a distinctly different piece of content. Specifically:
- Use a DIFFERENT hook/opening line — not a rephrased version of a recent one
- Come at the topic from a DIFFERENT entry point or angle
- Use different specific examples, numbers, or scenarios
- Vary the emotional register (if recent posts were confrontational, try reflective; if they were tactical, try observational)

The reader follows this account — if two posts feel interchangeable, you've failed.

Recent hooks to differentiate from:
${recentHooks.map((h: string, i: number) => `${i + 1}. "${h}"`).join("\n")}

Recent full posts for context:
${recentPosts.slice(0, 8).map((p: any, i: number) => `--- Recent ${i + 1} (${p.post_type}) ---\n${p.content.substring(0, 300)}`).join("\n\n")}`)
  }

  return parts.join("\n")
}
