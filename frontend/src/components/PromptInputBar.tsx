import { useId, useRef } from 'react'
import { Send, StopCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { usePromptComposer } from '@/hooks/usePromptComposer'
import type { GeneratedPrompt, PromptComposeContext } from '@/lib/promptComposer'

type PromptInputBarProps = {
  value: string
  onChange: (value: string) => void
  onAccept: (prompt: GeneratedPrompt) => void
  onSubmit: () => void
  onStop?: () => void
  isStreaming?: boolean
  disabled?: boolean
  context: PromptComposeContext
  placeholder?: string
}

export default function PromptInputBar({
  value,
  onChange,
  onAccept,
  onSubmit,
  onStop,
  isStreaming = false,
  disabled = false,
  context,
  placeholder = 'Ask a research question… (Tab to accept suggestion, Enter to send)',
}: PromptInputBarProps) {
  const listboxId = useId()
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const inputDisabled = disabled || isStreaming

  const {
    suggestions,
    highlightIndex,
    setHighlightIndex,
    showDropdown,
    highlighted,
    liveMessage,
    acceptSuggestion,
    handleFocus,
    handleBlur,
    handleChange,
    handleKeyDown,
  } = usePromptComposer({
    value,
    onChange,
    onAccept,
    context,
    disabled: inputDisabled,
  })

  return (
    <div className="flex gap-3 max-w-4xl mx-auto flex-1 min-w-0">
      <div className="relative flex-1 min-w-0 rounded-xl border border-slate-200/60 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 focus-within:ring-2 focus-within:ring-blue-500/20 focus-within:border-blue-300 transition-all">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => handleChange(e.target.value)}
          onFocus={handleFocus}
          onBlur={handleBlur}
          onKeyDown={(e) => {
            const handled = handleKeyDown(e)
            if (handled) return
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              onSubmit()
            }
          }}
          placeholder={placeholder}
          rows={2}
          disabled={inputDisabled}
          role="combobox"
          aria-expanded={showDropdown}
          aria-controls={showDropdown ? listboxId : undefined}
          aria-autocomplete="list"
          aria-activedescendant={
            showDropdown && highlighted ? `${listboxId}-option-${highlightIndex}` : undefined
          }
          className="relative w-full resize-none bg-transparent rounded-xl px-4 py-3 text-[14px] text-slate-800 dark:text-slate-100 focus:outline-none placeholder:text-slate-400 dark:placeholder:text-slate-500 disabled:opacity-60"
        />
        <div className="sr-only" aria-live="polite">
          {liveMessage}
        </div>
        {showDropdown && (
          <ul
            id={listboxId}
            role="listbox"
            className="absolute bottom-full left-0 right-0 mb-1 max-h-72 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-lg z-30 py-1"
            onMouseDown={(e) => e.preventDefault()}
          >
            {suggestions.map((s, i) => (
              <li
                key={s.id}
                id={`${listboxId}-option-${i}`}
                role="option"
                aria-selected={i === highlightIndex}
                className={cn(
                  'px-3 py-2.5 cursor-pointer border-b border-slate-100 dark:border-slate-800 last:border-0',
                  i === highlightIndex
                    ? 'bg-blue-50 dark:bg-blue-950/40'
                    : 'hover:bg-slate-50 dark:hover:bg-slate-800',
                )}
                onMouseEnter={() => setHighlightIndex(i)}
                onClick={() => acceptSuggestion(s, textareaRef.current)}
              >
                <div className="flex items-center gap-2 flex-wrap">
                  <span
                    className={cn(
                      'font-medium text-[13px]',
                      i === highlightIndex
                        ? 'text-blue-900 dark:text-blue-100'
                        : 'text-slate-800 dark:text-slate-100',
                    )}
                  >
                    {s.label}
                  </span>
                  {s.badge && (
                    <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
                      {s.badge}
                    </span>
                  )}
                  {s.requiresScope && context.articles.length === 0 && (
                    <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-md bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300">
                      Select papers
                    </span>
                  )}
                </div>
                <p className="text-[12px] text-slate-500 dark:text-slate-400 line-clamp-2 mt-1 leading-snug">
                  {s.preview}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
      <button
        type="button"
        onClick={isStreaming ? onStop : onSubmit}
        disabled={!isStreaming && !value.trim()}
        className={cn(
          'inline-flex items-center justify-center gap-2 min-w-[5.5rem] px-4 py-2 rounded-xl text-white font-medium text-sm transition-all duration-200 self-end shadow-sm shrink-0',
          isStreaming
            ? 'bg-red-500 hover:bg-red-600'
            : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:shadow-glow disabled:from-slate-300 disabled:to-slate-300 disabled:shadow-none',
        )}
      >
        {isStreaming ? (
          <>
            <StopCircle className="w-5 h-5" />
            Stop
          </>
        ) : (
          <>
            <Send className="w-5 h-5" />
            Send
          </>
        )}
      </button>
    </div>
  )
}
