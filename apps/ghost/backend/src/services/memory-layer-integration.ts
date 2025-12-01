import { MemoryExtractor } from '@memorylayer/memory-extraction';
import { ContextEngine } from '@memorylayer/context-engine';
import { ChatCapture } from '@memorylayer/chat-capture';
import { LocalStorageClient } from '../adapters/local-storage-client.js';
import { LocalEmbeddingProvider } from '../adapters/local-embedding-provider.js';
import { SingleUserManager } from '../adapters/single-user-manager.js';
import { initializeDatabase } from '../db/migrations.js';

/**
 * MemoryLayer Integration Service
 * Initializes and manages MemoryLayer components with local adapters
 * Privacy: Balanced mode - local storage + local embeddings + Gemini API
 */
export class MemoryLayerIntegration {
    public storageClient: LocalStorageClient;
    public embeddingProvider: LocalEmbeddingProvider;
    public singleUserManager: SingleUserManager;
    public memoryExtractor: MemoryExtractor | null = null;
    public contextEngine: ContextEngine | null = null;
    public chatCapture: ChatCapture | null = null;

    private initialized: boolean = false;

    constructor(dbPath: string = './ghost.db', externalStorageClient?: any) {
        // Initialize database
        const db = initializeDatabase(dbPath);

        // Use external storageClient if provided (for integration with SQLiteStorage)
        // Otherwise create local adapters
        if (externalStorageClient) {
            this.storageClient = externalStorageClient;
        } else {
            this.storageClient = new LocalStorageClient(db);
        }
        this.embeddingProvider = new LocalEmbeddingProvider();
        this.singleUserManager = new SingleUserManager(db);
    }

    /**
     * Initialize MemoryLayer components
     * Must be called before using any MemoryLayer features
     */
    async initialize(): Promise<void> {
        if (this.initialized) return;

        console.log('Initializing MemoryLayer integration...');

        // Initialize single-user workspace
        await this.singleUserManager.initialize();

        // Initialize ContextEngine with local adapters
        this.contextEngine = new ContextEngine({
            storageClient: this.storageClient as any, // Type compatibility
            embeddingProvider: this.embeddingProvider as any, // Type compatibility
            defaultTemplate: 'chat',
            defaultTokenBudget: 2000,
            logger: {
                info: (msg: string, ctx?: any) => console.log(`[ContextEngine] ${msg}`, ctx),
                warn: (msg: string, ctx?: any) => console.warn(`[ContextEngine] ${msg}`, ctx),
                error: (msg: string, ctx?: any) => console.error(`[ContextEngine] ${msg}`, ctx),
                debug: (msg: string, ctx?: any) => console.debug(`[ContextEngine] ${msg}`, ctx),
            },
        });

        // Register concise template for Ghost
        this.contextEngine.registerTemplate('concise', {
            name: 'concise',
            header: 'Context:',
            memoryFormat: '- {{summary}}',
            separator: '\n',
            includeMetadata: false,
        });

        // Initialize ChatCapture
        this.chatCapture = new ChatCapture({
            logger: {
                info: (msg: string, ctx?: any) => console.log(`[ChatCapture] ${msg}`, ctx),
                warn: (msg: string, ctx?: any) => console.warn(`[ChatCapture] ${msg}`, ctx),
                error: (msg: string, ctx?: any) => console.error(`[ChatCapture] ${msg}`, ctx),
                debug: (msg: string, ctx?: any) => console.debug(`[ChatCapture] ${msg}`, ctx),
            },
        });

        // Initialize MemoryExtractor with chunking enabled for file ingestion
        if (!this.memoryExtractor) {
            const geminiApiKey = process.env.GEMINI_API_KEY;
            if (!geminiApiKey) {
                console.warn('[MemoryLayer] GEMINI_API_KEY not set - MemoryExtractor will not be available');
                this.initialized = true;
                return;
            }

            // Import provider and strategy
            const { GeminiProvider, StructuredOutputStrategy } = await import('@memorylayer/memory-extraction');

            const provider = new GeminiProvider({
                apiKey: geminiApiKey,
                timeout: 60000,  // 60 seconds for file extraction (can be slow for large files)
            });

            const strategy = new StructuredOutputStrategy();

            this.memoryExtractor = new (await import('@memorylayer/memory-extraction')).MemoryExtractor({
                provider,
                strategy,
                memoryTypes: ['entity', 'fact'],
                minConfidence: 0.7,
                chunking: {
                    enabled: true,
                    maxTokensPerChunk: 32000,  // ~24k words, good for document sections
                    strategy: 'semantic',  // Split by topic for documents
                    overlapPercentage: 0.1,  // 10% overlap
                    failureMode: 'continue-on-error',
                },
                logger: {
                    info: (msg: string, ctx?: any) => console.log(`[MemoryExtractor] ${msg}`, ctx),
                    warn: (msg: string, ctx?: any) => console.warn(`[MemoryExtractor] ${msg}`, ctx),
                    error: (msg: string, ctx?: any) => console.error(`[MemoryExtractor] ${msg}`, ctx),
                    debug: (msg: string, ctx?: any) => console.debug(`[MemoryExtractor] ${msg}`, ctx),
                },
            });

            console.log('[MemoryLayer] MemoryExtractor initialized with chunking enabled');
        }

        this.initialized = true;
        console.log('MemoryLayer integration initialized successfully');
    }

    /**
     * Get default workspace ID
     */
    getWorkspaceId(): string {
        return this.singleUserManager.getWorkspaceId();
    }

    /**
     * Get default user ID
     */
    getUserId(): string {
        return this.singleUserManager.getUserId();
    }

    /**
     * Check if MemoryLayer is initialized
     */
    isInitialized(): boolean {
        return this.initialized;
    }
}

// Export singleton instance
const DATABASE_PATH = process.env.DATABASE_PATH || './ghost.db';
export const memoryLayerIntegration = new MemoryLayerIntegration(DATABASE_PATH);
