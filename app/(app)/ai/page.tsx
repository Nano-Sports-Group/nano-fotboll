'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { Send, Sparkles, Copy, Check, RotateCcw } from 'lucide-react'
import { motion, AnimatePresence, useReducedMotion } from 'motion/react'
import Link from 'next/link'
import { extractTextDeltas } from '@/lib/ai/ui-stream'
import { vertical } from '@/lib/vertical'

const HOCKEY = vertical.id === 'hockey'
const LEAGUE = vertical.leagueName

// ── Constants ────────────────────────────────────────────────────────────────

const UPGRADE_RESPONSE = `**AI-assistenten ingår i PRO.**

Som PRO-medlem får du:
- Obegränsade frågor om ${LEAGUE}-statistik
- Realtidsdata: tabell, matcher & spelarstatistik
- Nyhetsanalys från 1 000+ artiklar
- Svar inom sekunder, dygnet runt

**Uppgradera till PRO** och få tillgång direkt.`

const SUGGESTIONS = HOCKEY
  ? [
      { label: 'Tabellläge', q: 'Hur ser SHL-tabellen ut just nu?' },
      { label: 'Frölunda',   q: 'Senaste nyheter om Frölunda' },
      { label: 'Matcher',    q: 'Vilka matcher spelas härnäst?' },
      { label: 'Bäst form',  q: 'Vilka lag har bäst form just nu?' },
    ]
  : [
      { label: 'Tabellläge',  q: 'Hur ser tabellen ut just nu?' },
      { label: 'Skytteligan', q: 'Vem leder skytteligan?' },
      { label: 'Malmö FF',    q: 'Senaste nyheter om Malmö FF' },
      { label: 'Bäst form',   q: 'Vilka lag har bäst form just nu?' },
    ]

// Ligaspecifikt, inte generisk AI-utfyllnad
const THINKING_MESSAGES = [
  `Analyserar ${LEAGUE}-data…`,
  'Kollar senaste matchresultaten…',
  'Söker bland nyheterna…',
  HOCKEY ? 'Hämtar tabelläget…' : 'Hämtar spelarstatistik…',
  HOCKEY ? 'Jämför lagens form…' : 'Beräknar xG-form…',
]

type Msg = { role: 'user' | 'assistant'; text: string }

// ── Main ─────────────────────────────────────────────────────────────────────

export default function AiChatPage() {
  const [messages, setMessages] = useState<Msg[]>([])
  const [input, setInput]       = useState('')
  const [loading, setLoading]   = useState(false)
  const [thinkingMsg]           = useState(
    () => THINKING_MESSAGES[Math.floor(Math.random() * THINKING_MESSAGES.length)]
  )

  const bottomRef   = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const prefersReduced = useReducedMotion()

  // ── Auto-grow textarea ──────────────────────────────────────────────────
  const adjustHeight = useCallback(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 120) + 'px'
  }, [])

  useEffect(() => { adjustHeight() }, [input, adjustHeight])

  // ── Auto-focus on desktop ───────────────────────────────────────────────
  useEffect(() => {
    if (window.matchMedia('(pointer: fine)').matches) {
      textareaRef.current?.focus()
    }
  }, [])

  // ── Lock page scroll + track visualViewport (mobile keyboard) ───────────
  const [viewportH, setViewportH] = useState<number | null>(null)
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const vv = window.visualViewport
    if (vv) {
      const update = () => setViewportH(vv.height)
      vv.addEventListener('resize', update)
      update()
      return () => { vv.removeEventListener('resize', update); document.body.style.overflow = prev }
    }
    return () => { document.body.style.overflow = prev }
  }, [])

  // ── Scroll to bottom ────────────────────────────────────────────────────
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: prefersReduced ? 'instant' : 'smooth' })
  }, [messages, loading, prefersReduced])

  // ── Send ────────────────────────────────────────────────────────────────
  const ask = useCallback(async (question: string, historyOverride?: Msg[]) => {
    if (!question.trim() || loading) return
    const q = question.trim()
    const baseHistory = historyOverride ?? messages
    setInput('')
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
    if (!historyOverride) setMessages(prev => [...prev, { role: 'user', text: q }])
    setLoading(true)

    try {
      // Samma protokoll som useChat: UIMessage med parts in, UI message stream ut.
      const toMsg = (role: Msg['role'], text: string) => ({ role, parts: [{ type: 'text', text }] })
      const history = baseHistory.filter(m => m.text.trim()).map(m => toMsg(m.role, m.text))
      const res = await fetch('/api/elite/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [...history, toMsg('user', q)] }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        // Serverns 403 är auktoritativ — matcha aldrig på plannamn i copyn.
        const errText = res.status === 403
          ? UPGRADE_RESPONSE
          : 'Ett fel uppstod. Försök igen om en stund.'
        setMessages(prev => [...prev, { role: 'assistant', text: errText }])
        return
      }

      // Stream text tokens into the last assistant message
      setMessages(prev => [...prev, { role: 'assistant', text: '' }])
      const reader = res.body!.getReader()
      const dec = new TextDecoder()
      let pending = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const parsed = extractTextDeltas(pending + dec.decode(value, { stream: true }))
        pending = parsed.rest
        const chunk = parsed.deltas.join('')
        if (!chunk) continue
        setMessages(prev => {
          const msgs = [...prev]
          msgs[msgs.length - 1] = { role: 'assistant', text: msgs[msgs.length - 1].text + chunk }
          return msgs
        })
      }
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', text: 'Något gick fel. Försök igen.' }])
    } finally {
      setLoading(false)
    }
  }, [loading, messages])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      ask(input)
    }
  }

  // ── Regenerate last response ────────────────────────────────────────────
  const regenerate = useCallback((assistantIndex: number) => {
    const lastUser = [...messages.slice(0, assistantIndex)].reverse().find(m => m.role === 'user')
    if (!lastUser || loading) return
    const historyBefore = messages.slice(0, assistantIndex - 1)
    setMessages(historyBefore)
    ask(lastUser.text, historyBefore)
  }, [messages, loading, ask])

  return (
    <div
      className="relative flex flex-col items-center px-0 sm:px-6"
      style={{ height: viewportH ? `${viewportH}px` : 'calc(100svh - 3.5rem)' }}
    >
      {/* Header */}
      <header className="flex w-full max-w-2xl shrink-0 items-center gap-2.5 px-5 py-4">
        <Sparkles size={16} className="text-pitch-ink" aria-hidden />
        <h1 className="text-sm font-semibold text-foreground">{vertical.productName} AI</h1>
        <span className="ml-auto flex shrink-0 items-center gap-1.5 rounded-full border border-amber-500/20 bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-500">
          <Sparkles size={9} aria-hidden />
          PRO
        </span>
      </header>

      {/* Messages */}
      <div className="w-full flex-1 overflow-y-auto" role="log" aria-label="Konversation" aria-live="polite">
        <div className="mx-auto max-w-2xl">
          <AnimatePresence initial={false}>
            {messages.length === 0 && !loading ? (
              <EmptyState key="empty" onAsk={ask} />
            ) : (
              <div className="space-y-6 px-5 py-4">
                {messages.map((m, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                    className={m.role === 'user' ? 'flex justify-end' : ''}
                  >
                    {m.role === 'user' ? (
                      <div className="max-w-[82%] rounded-2xl rounded-tr-sm bg-muted px-4 py-3 text-sm leading-relaxed text-foreground">
                        {m.text}
                      </div>
                    ) : (
                      <div className="text-sm leading-relaxed text-foreground">
                        <AssistantMessage text={m.text} isStreaming={i === messages.length - 1 && loading} />
                        {!(i === messages.length - 1 && loading) && (
                          <MessageActions text={m.text} onRegenerate={() => regenerate(i)} />
                        )}
                      </div>
                    )}
                  </motion.div>
                ))}

                {loading && (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.2 }}
                    aria-label={`${vertical.productName} AI tänker`}
                  >
                    <ThinkingIndicator message={thinkingMsg} />
                  </motion.div>
                )}

                <div ref={bottomRef} />
              </div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Input bar */}
      <div className="w-full shrink-0 px-4 pb-[calc(env(safe-area-inset-bottom)+7.5rem)] pt-2 sm:pb-[calc(env(safe-area-inset-bottom)+10rem)]">
        <div className="mx-auto max-w-2xl">
          <form
            onSubmit={(e) => { e.preventDefault(); ask(input) }}
            aria-label="Skriv en fråga"
            className="flex items-center justify-center gap-2 rounded-2xl px-4 py-2.5 shadow-sm transition-colors focus-within:ring-1 focus-within:ring-pitch/40"
            style={{ background: 'var(--muted)', border: '1px solid color-mix(in srgb, var(--foreground) 10%, transparent)' }}
          >
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={`Fråga ${vertical.productName} AI om ${LEAGUE}…`}
              disabled={loading}
              rows={1}
              aria-label="Fråga"
              className="flex-1 resize-none bg-transparent text-center text-sm text-foreground placeholder:text-muted-foreground focus:outline-none disabled:opacity-50 leading-relaxed max-h-[120px]"
              style={{ overflowY: 'auto' }}
            />
            <motion.button
              type="submit"
              disabled={loading || !input.trim()}
              whileTap={{ scale: 0.88 }}
              transition={{ duration: 0.1 }}
              aria-label="Skicka fråga"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-pitch text-white transition-opacity hover:opacity-90 disabled:opacity-30 touch-manipulation"
            >
              <Send size={14} aria-hidden />
            </motion.button>
          </form>
          <p className="mt-2.5 text-center text-xs text-muted-foreground">
            Kräver{' '}
            <Link href="/prenumerera" className="text-pitch-ink hover:underline">
              PRO-prenumeration
            </Link>
            {' '}· Enter för att skicka
          </p>
        </div>
      </div>
    </div>
  )
}

// ── Empty State ───────────────────────────────────────────────────────────────

function EmptyState({ onAsk }: { onAsk: (q: string) => void }) {
  return (
    <motion.div
      key="empty"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      className="flex min-h-[60vh] flex-col items-center justify-center gap-6 px-6 py-12"
    >
      {/* Breathing icon */}
      <motion.div
        animate={{ scale: [1, 1.06, 1] }}
        transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
        className="flex h-16 w-16 items-center justify-center rounded-2xl bg-pitch/10"
        aria-hidden
      >
        <Sparkles size={28} className="text-pitch-ink" />
      </motion.div>

      <div className="text-center">
        <h2 className="text-xl font-semibold text-foreground text-balance">Vad vill du veta?</h2>
        <p className="mt-1 text-sm text-muted-foreground">Fråga om {LEAGUE} — statistik, matcher, nyheter</p>
      </div>

      {/* Staggered chips */}
      <div className="grid w-full max-w-sm grid-cols-2 gap-2" role="list" aria-label="Förslag">
        {SUGGESTIONS.map((s, i) => (
          <motion.button
            key={s.q}
            type="button"
            role="listitem"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.06 + 0.1, duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            whileTap={{ scale: 0.96 }}
            onClick={() => onAsk(s.q)}
            className="rounded-xl border border-border bg-background px-4 py-3 text-left transition-colors hover:border-pitch/40 hover:bg-pitch/5 touch-manipulation"
            aria-label={s.q}
          >
            <span className="text-xs font-medium text-foreground">{s.label}</span>
          </motion.button>
        ))}
      </div>
    </motion.div>
  )
}

// ── Message Actions (copy / regenerate) ────────────────────────────────────────

function MessageActions({ text, onRegenerate }: { text: string; onRegenerate: () => void }) {
  const [copied, setCopied] = useState(false)

  const copy = useCallback(() => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }, [text])

  return (
    <div className="mt-2 flex items-center gap-1">
      <button
        type="button"
        onClick={copy}
        aria-label="Kopiera svar"
        className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground touch-manipulation"
      >
        {copied ? <Check size={13} /> : <Copy size={13} />}
      </button>
      <button
        type="button"
        onClick={onRegenerate}
        aria-label="Generera om svar"
        className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground touch-manipulation"
      >
        <RotateCcw size={13} />
      </button>
    </div>
  )
}

// ── Thinking Indicator ────────────────────────────────────────────────────────

function ThinkingIndicator({ message }: { message: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="flex items-center gap-1" aria-hidden>
        {[0, 1, 2].map((i) => (
          <motion.span
            key={i}
            className="h-1.5 w-1.5 rounded-full bg-muted-foreground"
            animate={{ opacity: [0.3, 1, 0.3] }}
            transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut', delay: i * 0.2 }}
          />
        ))}
      </div>
      <span className="text-xs text-muted-foreground">{message}</span>
    </div>
  )
}

// ── Assistant Message ─────────────────────────────────────────────────────────

function AssistantMessage({ text, isStreaming }: { text: string; isStreaming: boolean }) {
  const lines = text.split('\n')

  return (
    <div className="space-y-2">
      {lines.map((line, i) => {
        if (!line) return <div key={i} className="h-1" />

        if (line.startsWith('**') && line.endsWith('**')) {
          return <p key={i} className="font-semibold text-foreground">{line.slice(2, -2)}</p>
        }

        if (line.startsWith('- ')) {
          return (
            <p key={i} className="pl-2 text-foreground/80">
              · {line.slice(2)}
            </p>
          )
        }

        if (line.includes('**')) {
          const parts = line.split(/\*\*(.*?)\*\*/)
          return (
            <p key={i} className="text-foreground/80">
              {parts.map((part, k) =>
                k % 2 === 1
                  ? <strong key={k} className="font-semibold text-foreground">{part}</strong>
                  : part
              )}
            </p>
          )
        }

        return <p key={i} className="text-foreground/80">{line}</p>
      })}

      {/* Show upgrade CTA only for paywall messages */}
      {!isStreaming && text === UPGRADE_RESPONSE && (
        <motion.div
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, delay: 0.1 }}
        >
          <Link
            href="/prenumerera"
            className="mt-3 flex items-center justify-center gap-2 w-full rounded-xl bg-pitch py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 touch-manipulation"
          >
            <Sparkles size={14} aria-hidden />
            Uppgradera till PRO
          </Link>
        </motion.div>
      )}
    </div>
  )
}
