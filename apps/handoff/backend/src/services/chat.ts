import OpenAI from 'openai'
import { DatabaseClient } from '../lib/db'
import { MemoryService } from './memory'
import { EmbeddingService } from './embedding'

export class ChatService {
    private memoryService: MemoryService
    private embeddingService: EmbeddingService | null = null
    private openai: OpenAI
    private model: string
    private db: DatabaseClient

    constructor(
        db: DatabaseClient,
        openaiApiKey: string,
        baseURL?: string,
        model: string = 'gpt-4o',
        embeddingService?: EmbeddingService,
        openaiClient?: OpenAI
    ) {
        this.db = db
        this.memoryService = new MemoryService(db, embeddingService)
        this.embeddingService = embeddingService || null
        this.openai = openaiClient ?? new OpenAI({
            apiKey: openaiApiKey,
            baseURL: baseURL,
        })
        this.model = model
    }

    async chat(
        query: string,
        workspaceId: string,
        history: { role: 'user' | 'assistant'; content: string }[] = []
    ): Promise<{ content: string; sources: any[] }> {
        let memories: any[] = []

        // Use vector similarity search if embedding service is available
        if (this.embeddingService) {
            try {
                // Generate embedding for the query
                const queryEmbedding = await this.embeddingService.generateEmbedding(query)
                // Always pull keyword matches first to guarantee direct hits
                const keywordResult = await this.memoryService.getMemories({
                    workspaceId,
                    search: query,
                    limit: 30
                })
                console.info('[KeywordSearch] workspace:', workspaceId, 'search:', query, 'rows:', keywordResult.memories.length)

                // If no keyword hits, try a simplified keyword (longest token)
                let tokenResult = keywordResult
                if (keywordResult.memories.length === 0) {
                    const tokens = (query.toLowerCase().match(/[a-z0-9]+/g) || [])
                        .filter(t => t.length >= 3)
                        .sort((a, b) => b.length - a.length)
                    for (const token of tokens) {
                        const res = await this.memoryService.getMemories({
                            workspaceId,
                            search: token,
                            limit: 30
                        })
                        console.info('[KeywordSearch:token]', token, 'rows:', res.memories.length)
                        if (res.memories.length > 0) {
                            tokenResult = res
                            break
                        }
                    }
                }

                // Perform vector similarity search
                const similarityQuery = `
                    SELECT m.*,
                           1 - (m.embedding <=> params.embedding) AS similarity
                    FROM memories m
                    CROSS JOIN (SELECT $1::vector AS embedding, $2::uuid AS workspace_id) params
                    WHERE m.workspace_id = params.workspace_id
                      AND m.embedding IS NOT NULL
                    ORDER BY m.embedding <=> params.embedding
                    LIMIT 10
                `

                memories = await this.db.query(similarityQuery, [
                    JSON.stringify(queryEmbedding),
                    workspaceId
                ])

                // Filter out malformed rows returned by exec_sql or mocks
                const validMemories = memories.filter(
                    m => m && typeof m.type === 'string' && typeof m.content === 'string'
                )
                console.info('[VectorSearch] rows:', validMemories.length, 'ids:', validMemories.slice(0, 3).map(m => m.id))
                console.info('[KeywordSearch] rows:', keywordResult.memories.length)

                // Blend keyword results (priority) with vector results
                const merged = new Map<string, any>()
                for (const m of tokenResult.memories) merged.set(m.id, m)
                for (const m of validMemories) merged.set(m.id, m)

                const blended = Array.from(merged.values()).slice(0, 10)

                if (blended.length === 0) {
                    console.info('[VectorSearch] fallback to keyword search (no matches)')
                }

                memories = blended
            } catch (error) {
                console.error('Vector search failed, falling back to keyword search:', error)
                // Fall back to keyword search
                const memoriesResult = await this.memoryService.getMemories({
                    workspaceId,
                    search: query,
                    limit: 10
                })
                memories = memoriesResult.memories
            }
        } else {
            // Fall back to keyword search if no embedding service
            const memoriesResult = await this.memoryService.getMemories({
                workspaceId,
                search: query,
                limit: 10
            })
            memories = memoriesResult.memories
        }

        // 2. Construct system prompt with context
        const contextText = memories.map(m => {
            const confidence = m.confidence || 0
            return `[${m.type.toUpperCase()}] (Confidence: ${(confidence * 100).toFixed(0)}%): ${m.content}`
        }).join('\n\n')

        const systemPrompt = `You are an AI assistant for the user's "external brain". 
You have access to the following memories extracted from the user's conversations:

${contextText}

Answer the user's question based PRIMARILY on these memories. 
If the answer is not in the memories, say you don't know based on the available context.
Do not make up facts.
Cite your sources implicitly by referring to the specific details.
`

        // 3. Call OpenAI
        const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
            { role: 'system', content: systemPrompt },
            ...history.map(h => ({ role: h.role, content: h.content })),
            { role: 'user', content: query }
        ]

        const completion = await this.openai.chat.completions.create({
            model: this.model,
            messages,
            temperature: 0.5,
        })

        const answer = completion.choices[0].message.content || 'I could not generate a response.'

        return {
            content: answer,
            sources: memories
        }
    }
}
