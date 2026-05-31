import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  composePrompts,
  type GeneratedPrompt,
  type PromptComposeContext,
} from '@/lib/promptComposer'

export type UsePromptComposerOptions = {
  value: string
  onChange: (value: string) => void
  onAccept: (prompt: GeneratedPrompt) => void
  context: PromptComposeContext
  disabled?: boolean
}

export function usePromptComposer({
  value,
  onChange,
  onAccept,
  context,
  disabled = false,
}: UsePromptComposerOptions) {
  const [open, setOpen] = useState(false)
  const [highlightIndex, setHighlightIndex] = useState(0)
  const [liveMessage, setLiveMessage] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState(value)

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedQuery(value), 200)
    return () => window.clearTimeout(t)
  }, [value])

  const composeContext = useMemo(
    (): PromptComposeContext => ({
      ...context,
      partialQuery: debouncedQuery,
    }),
    [context, debouncedQuery],
  )

  const suggestions = useMemo(
    () => (disabled ? [] : composePrompts(composeContext)),
    [composeContext, disabled],
  )

  useEffect(() => {
    setHighlightIndex(0)
  }, [suggestions])

  const highlighted = suggestions[highlightIndex] ?? suggestions[0]
  const showDropdown = open && !disabled && suggestions.length > 0

  const acceptSuggestion = useCallback(
    (prompt: GeneratedPrompt, textarea?: HTMLTextAreaElement | null) => {
      onChange(prompt.text)
      onAccept(prompt)
      setOpen(true)
      setLiveMessage('Suggestion applied')

      requestAnimationFrame(() => {
        if (!textarea) return
        textarea.focus()
        const end = prompt.text.length
        textarea.setSelectionRange(end, end)
      })
    },
    [onAccept, onChange],
  )

  const handleFocus = useCallback(() => {
    if (!disabled) {
      setOpen(true)
      setHighlightIndex(0)
    }
  }, [disabled])

  const handleBlur = useCallback(() => {
    window.setTimeout(() => setOpen(false), 150)
  }, [])

  const handleChange = useCallback(
    (next: string) => {
      onChange(next)
      setHighlightIndex(0)
      if (!disabled) setOpen(true)
    },
    [disabled, onChange],
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (disabled) return false

      if (e.key === 'Escape') {
        if (showDropdown) {
          e.preventDefault()
          setOpen(false)
          return true
        }
        return false
      }

      if (showDropdown && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
        e.preventDefault()
        setHighlightIndex((i) => {
          if (e.key === 'ArrowDown') return Math.min(i + 1, suggestions.length - 1)
          return Math.max(i - 1, 0)
        })
        return true
      }

      if (e.key === 'Tab' && showDropdown && highlighted) {
        e.preventDefault()
        acceptSuggestion(highlighted, e.currentTarget)
        return true
      }

      return false
    },
    [acceptSuggestion, disabled, highlighted, showDropdown, suggestions.length],
  )

  return {
    suggestions,
    highlightIndex,
    setHighlightIndex,
    showDropdown,
    open,
    setOpen,
    highlighted,
    liveMessage,
    acceptSuggestion,
    handleFocus,
    handleBlur,
    handleChange,
    handleKeyDown,
  }
}
