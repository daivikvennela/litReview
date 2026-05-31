import { useRef, useState } from 'react'
import { useAppStore } from '@/store'
import { sendChat, type ChatMode } from '@/lib/api'

export type StreamQueryOptions = {
  model?: string
  articleIds?: string[]
  mode?: ChatMode
  detailLevel?: 0 | 1 | 2 | 3
}

export function useStreamQuery() {
  const [isStreaming, setIsStreaming] = useState(false)
  const abortControllerRef = useRef<AbortController | null>(null)
  const { addMessage, updateLastAssistant } = useAppStore()

  const sendMessage = (question: string, opts?: StreamQueryOptions) => {
    if (isStreaming) return

    abortControllerRef.current?.abort()
    const controller = new AbortController()
    abortControllerRef.current = controller

    setIsStreaming(true)

    addMessage({ role: 'user', content: question })
    addMessage({ role: 'assistant', content: '' })

    sendChat(
      question,
      {
        model: opts?.model,
        articleIds: opts?.articleIds,
        mode: opts?.mode,
        detailLevel: opts?.detailLevel ?? 0,
        signal: controller.signal,
      },
      (chunk) => {
        if (!controller.signal.aborted) updateLastAssistant(chunk)
      },
      undefined,
      (err) => {
        if (!controller.signal.aborted) updateLastAssistant(`\n[Error: ${err}]`)
      },
    )
      .catch((err: unknown) => {
        if (err instanceof Error && err.name === 'AbortError') return
        if (!controller.signal.aborted) {
          updateLastAssistant(`\n[Error: ${err instanceof Error ? err.message : String(err)}]`)
        }
      })
      .finally(() => {
        if (abortControllerRef.current === controller) {
          abortControllerRef.current = null
        }
        setIsStreaming(false)
      })
  }

  const stop = () => {
    abortControllerRef.current?.abort()
    abortControllerRef.current = null
    setIsStreaming(false)
  }

  return { sendMessage, isStreaming, stop }
}
