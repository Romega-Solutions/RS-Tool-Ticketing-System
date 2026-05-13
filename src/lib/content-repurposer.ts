import { createAdminClient } from '@/lib/supabase/admin';
import { groqChat } from '@/lib/groq';

export type ContentOutputs = {
  linkedin_carousel: string;
  twitter_thread: string;
  newsletter_html: string;
  instagram_caption: string;
};

export type ContentDraftRecord = {
  id?: number;
  source_title: string;
  source_type: string;
  source_content: string;
  outputs: ContentOutputs;
  model: string | null;
  tokens_in: number | null;
  tokens_out: number | null;
  created_at: string;
  created_by?: number | null;
};

const CONTENT_SYSTEM_PROMPT = `You repurpose long-form marketing source material for Romega Solutions.

Return valid JSON only with this exact shape:
{
  "linkedin_carousel": "string",
  "twitter_thread": "string",
  "newsletter_html": "string",
  "instagram_caption": "string"
}

Requirements:
- Keep the tone sharp, practical, and B2B-service oriented.
- LinkedIn carousel: 6-8 short slides, each prefixed with "Slide N:" on its own line.
- Twitter thread: 6-9 posts, each prefixed with "1/" etc.
- newsletter_html: valid HTML fragment with one headline, short intro, 2-4 short sections, and CTA.
- instagram_caption: concise, readable, with a CTA and at most 6 hashtags.
- No markdown fences. JSON only.`;

function extractJsonObject(text: string): ContentOutputs {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('Model did not return JSON');
  const parsed = JSON.parse(match[0]) as Partial<ContentOutputs>;
  const outputs: ContentOutputs = {
    linkedin_carousel: parsed.linkedin_carousel?.trim() ?? '',
    twitter_thread: parsed.twitter_thread?.trim() ?? '',
    newsletter_html: parsed.newsletter_html?.trim() ?? '',
    instagram_caption: parsed.instagram_caption?.trim() ?? '',
  };
  if (!outputs.linkedin_carousel || !outputs.twitter_thread || !outputs.newsletter_html || !outputs.instagram_caption) {
    throw new Error('Model returned incomplete content outputs');
  }
  return outputs;
}

export async function generateContentOutputs(input: {
  sourceTitle: string;
  sourceType: string;
  sourceContent: string;
}) {
  const result = await groqChat(
    [
      { role: 'system', content: CONTENT_SYSTEM_PROMPT },
      {
        role: 'user',
        content: JSON.stringify({
          title: input.sourceTitle,
          type: input.sourceType,
          content: input.sourceContent,
        }),
      },
    ],
    { maxTokens: 1200, temperature: 0.45 },
  );

  return {
    outputs: extractJsonObject(result.text),
    model: result.model,
    tokensIn: result.tokensIn,
    tokensOut: result.tokensOut,
  };
}

export async function createContentDraft(input: {
  sourceTitle: string;
  sourceType: string;
  sourceContent: string;
  createdBy?: number | null;
}) {
  const generated = await generateContentOutputs(input);
  const supabase = createAdminClient();

  const row = {
    source_title: input.sourceTitle.trim(),
    source_type: input.sourceType.trim(),
    source_content: input.sourceContent.trim(),
    outputs: generated.outputs,
    model: generated.model,
    tokens_in: generated.tokensIn,
    tokens_out: generated.tokensOut,
    created_at: new Date().toISOString(),
    created_by: input.createdBy ?? null,
  };

  const { data, error } = await supabase
    .from('content_drafts')
    .insert(row)
    .select()
    .single();

  if (error || !data) throw new Error(`Failed to save content draft: ${error?.message ?? 'unknown'}`);
  return data as ContentDraftRecord;
}

export async function getRecentContentDrafts(limit = 12): Promise<ContentDraftRecord[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('content_drafts')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error?.message?.toLowerCase().includes('does not exist')) return [];
  return (data as ContentDraftRecord[] | null) ?? [];
}
