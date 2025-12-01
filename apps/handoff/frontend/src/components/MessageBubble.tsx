import { useState } from 'react'
import { Memory } from '../lib/api'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useNavigate } from 'react-router-dom'

interface MessageBubbleProps {
    role: 'user' | 'assistant'
    content: string
    timestamp: Date
    sources?: Memory[]
}

export default function MessageBubble({ role, content, timestamp, sources }: MessageBubbleProps) {
    const [isSourcesExpanded, setIsSourcesExpanded] = useState(false)
    const [showCopy, setShowCopy] = useState(false)
    const [copied, setCopied] = useState(false)
    const navigate = useNavigate()

    const handleCopy = async () => {
        await navigator.clipboard.writeText(content)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
    }

    return (
        <div
            className={`flex gap-4 ${role === 'assistant' ? 'bg-transparent' : 'flex-row-reverse'}`}
            onMouseEnter={() => setShowCopy(true)}
            onMouseLeave={() => setShowCopy(false)}
        >
            {/* Avatar */}
            <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium ${role === 'assistant'
                ? 'bg-[var(--color-accent-indigo)] text-white'
                : 'bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)]'
                }`}>
                {role === 'assistant' ? 'AI' : 'You'}
            </div>

            {/* Message Content */}
            <div className={`flex flex-col max-w-[80%] space-y-1 ${role === 'user' ? 'items-end' : 'items-start'}`}>
                <div className="flex items-end gap-2">
                    <div className={`rounded-2xl px-5 py-3 text-[var(--text-base)] leading-relaxed shadow-sm relative group ${role === 'user'
                        ? 'bg-[var(--color-accent-blue)] text-white'
                        : 'bg-white border border-[var(--color-border-subtle)] text-[var(--color-text-primary)]'
                        }`}>
                        <div className="prose prose-sm max-w-none prose-headings:font-semibold prose-h1:text-lg prose-h2:text-base prose-h3:text-sm prose-p:my-2 prose-ul:my-2 prose-ol:my-2 prose-li:my-0.5 prose-a:text-blue-600 prose-a:no-underline hover:prose-a:underline prose-code:text-xs prose-code:bg-gray-100 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-pre:bg-gray-100 prose-pre:p-2 prose-pre:rounded prose-pre:text-xs">
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                {content}
                            </ReactMarkdown>
                        </div>

                        {/* Copy Button */}
                        {role === 'assistant' && (showCopy || copied) && (
                            <button
                                onClick={handleCopy}
                                className={`absolute -bottom-6 right-0 p-1 rounded text-xs transition-colors flex items-center gap-1 ${copied ? 'text-green-600' : 'text-gray-400 hover:text-gray-600'
                                    }`}
                                title="Copy to clipboard"
                            >
                                {copied ? (
                                    <>
                                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                        </svg>
                                        Copied
                                    </>
                                ) : (
                                    <>
                                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                                        </svg>
                                        Copy
                                    </>
                                )}
                            </button>
                        )}
                    </div>
                </div>

                {/* Timestamp */}
                <span className="text-[10px] text-gray-400 px-1">
                    {timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>

                {/* Sources */}
                {sources && sources.length > 0 && (
                    <div className="w-full mt-2">
                        <button
                            onClick={() => setIsSourcesExpanded(!isSourcesExpanded)}
                            className="flex items-center gap-2 text-xs font-medium text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] transition-colors mb-2"
                        >
                            <svg
                                className={`w-3 h-3 transition-transform ${isSourcesExpanded ? 'rotate-90' : ''}`}
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                            >
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                            </svg>
                            {sources.length} Sources Used
                        </button>

                        {isSourcesExpanded && (
                            <div className="grid gap-2 animate-in fade-in slide-in-from-top-2 duration-200">
                                {sources.map(source => (
                                    <div
                                        key={source.id}
                                        className="card-clean p-3 text-sm hover:border-[var(--color-accent-blue)] cursor-pointer transition-colors bg-gray-50/50"
                                        onClick={() => {
                                            if (source.conversation_id) {
                                                navigate(`/chats?id=${source.conversation_id}`)
                                            }
                                        }}
                                    >
                                        <div className="flex items-center justify-between mb-1">
                                            <div className="flex items-center gap-2">
                                                <span className={`badge ${source.type} text-[10px] px-1.5 py-0.5`}>{source.type}</span>
                                                <span className="text-[var(--color-text-tertiary)] text-[10px]">
                                                    {new Date(source.created_at).toLocaleDateString()}
                                                </span>
                                            </div>
                                            <span className="text-[var(--color-text-tertiary)] text-[10px] font-medium" title="Confidence Score">
                                                {(source.confidence * 100).toFixed(0)}%
                                            </span>
                                        </div>
                                        <p className="text-[var(--color-text-secondary)] text-xs leading-relaxed">
                                            {source.content}
                                        </p>
                                        {source.conversation_id && (
                                            <div className="mt-2 text-[10px] text-[var(--color-accent-blue)] hover:underline">
                                                View in conversation →
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    )
}
