import { useState, useEffect, useRef } from 'react'
import Layout from '../components/layout/Layout'
import { PageHeader } from '../components/PageHeader'
import { useWorkspace } from '../contexts/WorkspaceContext'
import { api, Memory } from '../lib/api'
import { useChatConversations, useCreateChatConversation, useChatConversation } from '../hooks/useChatConversation'
import MessageBubble from '../components/MessageBubble'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
  sources?: Memory[]
}

export default function Ask() {
  const { currentWorkspace } = useWorkspace()
  const [messages, setMessages] = useState<Message[]>([])
  const [query, setQuery] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Fetch conversations and current conversation
  const { data: conversationsData } = useChatConversations(currentWorkspace?.id || null)
  const { data: conversationData } = useChatConversation(currentConversationId, currentWorkspace?.id || null)
  const createConversation = useCreateChatConversation()

  // Load messages from current conversation
  useEffect(() => {
    if (conversationData?.conversation?.messages) {
      const loadedMessages: Message[] = conversationData.conversation.messages.map(msg => ({
        id: msg.id,
        role: msg.role as 'user' | 'assistant',
        content: msg.content,
        timestamp: new Date(msg.created_at),
        sources: [] // Sources would be loaded separately if needed
      }))
      setMessages(loadedMessages)
    } else if (!currentConversationId) {
      setMessages([])
    }
  }, [conversationData, currentConversationId])

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages, isTyping])

  // Auto-focus input on mount
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!query.trim() || !currentWorkspace) return

    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: query,
      timestamp: new Date()
    }

    setMessages(prev => [...prev, userMsg])
    const userQuery = query
    setQuery('')
    setIsTyping(true)

    try {
      // Create a new conversation if this is the first message
      let conversationId = currentConversationId
      if (!conversationId) {
        const newConv = await createConversation.mutateAsync({
          workspaceId: currentWorkspace.id,
          title: userQuery.slice(0, 50) // Use first 50 chars as title
        })
        conversationId = newConv.conversation.id
        setCurrentConversationId(conversationId)
      }

      // Call API (single call handles both generation and persistence)
      const response = await api.chat({
        message: userQuery,
        workspaceId: currentWorkspace.id,
        history: messages.map(m => ({ role: m.role, content: m.content }))
      })

      const assistantMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: response.content,
        timestamp: new Date(),
        sources: response.sources
      }

      setMessages(prev => [...prev, assistantMsg])
    } catch (err) {
      console.error('Failed to get response', err)

      // Add error message
      const errorMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: "I'm sorry, I encountered an error while processing your request. Please try again.",
        timestamp: new Date()
      }
      setMessages(prev => [...prev, errorMsg])
    } finally {
      setIsTyping(false)
      // Focus back on input after response
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }

  const handleNewConversation = () => {
    setCurrentConversationId(null)
    setMessages([])
    inputRef.current?.focus()
  }

  const handleQuickPrompt = (prompt: string) => {
    setQuery(prompt)
    inputRef.current?.focus()
  }

  return (
    <Layout>
      <div className="flex flex-col h-[calc(100vh-12rem)]">
        <div className="flex items-center justify-between mb-4">
          <PageHeader
            kicker="AI Assistant"
            title="Ask Anything"
            subtitle="Query your external brain using natural language."
            dense
          />

          {/* Conversation Selector */}
          <div className="flex items-center gap-2">
            {conversationsData?.conversations && conversationsData.conversations.length > 0 && (
              <div className="relative">
                <select
                  value={currentConversationId || ''}
                  onChange={(e) => setCurrentConversationId(e.target.value || null)}
                  className="appearance-none pl-4 pr-10 py-2 bg-white border border-[var(--color-border-subtle)] rounded-lg text-sm focus:outline-none focus:border-[var(--color-accent-blue)] cursor-pointer hover:bg-gray-50 transition-colors max-w-[200px] truncate"
                >
                  <option value="">Current Session</option>
                  {conversationsData.conversations.map((conv) => (
                    <option key={conv.id} value={conv.id}>
                      {conv.title || `Conversation ${conv.id.slice(0, 8)}`}
                    </option>
                  ))}
                </select>
                <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </div>
            )}
            <button
              onClick={handleNewConversation}
              className="px-4 py-2 bg-[var(--color-accent-blue)] hover:bg-[var(--color-accent-blue-hover)] text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2 shadow-sm"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              New Chat
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto space-y-6 py-6 pr-4">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center space-y-8 opacity-0 animate-in fade-in duration-500 fill-mode-forwards">
              <div className="w-24 h-24 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-full flex items-center justify-center shadow-sm border border-blue-100">
                <svg className="w-12 h-12 text-[var(--color-accent-blue)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                </svg>
              </div>
              <div className="max-w-md space-y-2">
                <h3 className="text-xl font-semibold text-[var(--color-text-primary)]">How can I help you today?</h3>
                <p className="text-[var(--color-text-secondary)]">
                  I can answer questions based on your imported conversations and memories.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 w-full max-w-2xl px-4">
                {[
                  "What did we decide about the database?",
                  "Who is working on the mobile app?",
                  "Summarize the last team meeting",
                  "What are the key risks for the project?"
                ].map((prompt, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleQuickPrompt(prompt)}
                    className="p-4 text-left text-sm bg-white border border-[var(--color-border-subtle)] rounded-xl hover:border-[var(--color-accent-blue)] hover:shadow-md transition-all group"
                  >
                    <span className="text-[var(--color-text-primary)] group-hover:text-[var(--color-accent-blue)] transition-colors">
                      "{prompt}"
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((msg) => (
              <MessageBubble
                key={msg.id}
                role={msg.role}
                content={msg.content}
                timestamp={msg.timestamp}
                sources={msg.sources}
              />
            ))
          )}

          {isTyping && (
            <div className="flex gap-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div className="w-8 h-8 rounded-full bg-[var(--color-accent-indigo)] flex items-center justify-center text-white text-xs font-medium shadow-sm">
                AI
              </div>
              <div className="bg-white border border-[var(--color-border-subtle)] rounded-2xl px-5 py-4 shadow-sm flex items-center gap-2">
                <div className="flex gap-1">
                  <div className="w-2 h-2 bg-[var(--color-accent-blue)] rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <div className="w-2 h-2 bg-[var(--color-accent-blue)] rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <div className="w-2 h-2 bg-[var(--color-accent-blue)] rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
                <span className="text-xs text-gray-400 font-medium ml-2">Thinking...</span>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <div className="mt-4 relative">
          <form onSubmit={handleSearch} className="relative group">
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Ask a question about your memories..."
              className="w-full bg-white border border-[var(--color-border-subtle)] rounded-xl py-4 pl-5 pr-14 text-[var(--text-base)] shadow-sm focus:border-[var(--color-accent-blue)] focus:ring-2 focus:ring-[var(--color-accent-blue)] focus:ring-opacity-20 transition-all outline-none placeholder:text-[var(--color-text-tertiary)]"
            />
            <button
              type="submit"
              disabled={!query.trim() || isTyping}
              className="absolute right-2 top-2 bottom-2 aspect-square bg-[var(--color-bg-tertiary)] hover:bg-[var(--color-accent-blue)] text-[var(--color-text-secondary)] hover:text-white rounded-lg flex items-center justify-center transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
              </svg>
            </button>
          </form>
          <div className="text-center mt-2">
            <p className="text-xs text-gray-400">
              AI can make mistakes. Please verify important information.
            </p>
          </div>
        </div>
      </div>
    </Layout>
  )
}
