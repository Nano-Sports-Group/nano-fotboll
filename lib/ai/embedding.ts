import { openai } from '@ai-sdk/openai'
import { embed, embedMany } from 'ai'
import { createClient } from '@supabase/supabase-js'
import { SPORT } from '@/lib/vertical'

const embeddingModel = openai.embedding('text-embedding-3-small')

// ponytail: ~500 tokens ≈ 2000 chars; split on double-newline first, sentences as fallback
export function chunk(text: string): string[] {
  const MAX = 2000
  const paragraphs = text.split(/\n\n+/).filter(Boolean)
  const chunks: string[] = []
  let current = ''
  for (const p of paragraphs) {
    if (current.length + p.length > MAX && current) {
      chunks.push(current.trim())
      current = p
    } else {
      current = current ? current + '\n\n' + p : p
    }
  }
  if (current.trim()) chunks.push(current.trim())
  return chunks.length ? chunks : [text.slice(0, MAX)]
}

export async function embedChunks(chunks: string[]): Promise<{ chunk: string; embedding: number[] }[]> {
  const { embeddings } = await embedMany({ model: embeddingModel, values: chunks })
  return chunks.map((chunk, i) => ({ chunk, embedding: embeddings[i] as number[] }))
}

export async function embedQuery(query: string): Promise<number[]> {
  const { embedding } = await embed({ model: embeddingModel, value: query })
  return embedding as number[]
}

function getDb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

export async function searchArticles(
  query: string,
  count = 5
): Promise<{ title: string; url: string; chunk: string; similarity: number }[]> {
  const vec = await embedQuery(query)
  const db = getDb()

  // match_articles söker över alla sporter — hämta fler och behåll bara vertikalens artiklar.
  const { data: matches } = await db.rpc('match_articles', {
    query_embedding: vec,
    match_threshold: 0.5,
    match_count: count * 3,
  })
  if (!matches?.length) return []

  const ids = matches.map((m: { content_id: string }) => m.content_id)
  const { data: articles } = await db
    .from('articles')
    .select('id, title, url, slug')
    .eq('sport', SPORT)
    .in('id', ids)

  const articleMap = new Map((articles ?? []).map((a) => [a.id, a]))

  return matches
    .filter((m: { content_id: string }) => articleMap.has(m.content_id))
    .slice(0, count)
    .map((m: { content_id: string; chunk: string; similarity: number }) => {
      const a = articleMap.get(m.content_id)
      return {
        title: a?.title ?? 'Artikel',
        url: a?.url ?? (a?.slug ? `/artikel/${a.slug}` : ''),
        chunk: m.chunk,
        similarity: m.similarity,
      }
    })
}
