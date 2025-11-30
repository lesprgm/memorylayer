#!/usr/bin/env node

/**
 * Test script for local embedding provider
 * Downloads the model and tests embedding generation
 */

import { LocalEmbeddingProvider } from './dist/adapters/local-embedding-provider.js';

async function testEmbeddings() {
    console.log('🚀 Testing Local Embedding Provider\n');

    const provider = new LocalEmbeddingProvider();

    console.log(`📦 Model: ${provider.model}`);
    console.log(`📏 Dimensions: ${provider.dimensions}`);
    console.log(`📁 Cache directory: ${process.env.EMBEDDING_CACHE_DIR || './models'}\n`);

    console.log('⏳ Downloading model (this may take ~30 seconds on first run)...\n');

    const startTime = Date.now();

    // Test single embedding
    const text1 = "Sarah works at Acme Corp and her email is sarah@acme.com";
    console.log(`🔤 Generating embedding for: "${text1}"`);
    const embedding1 = await provider.embed(text1);

    const duration1 = Date.now() - startTime;
    console.log(`✅ Generated ${embedding1.length}-dimensional embedding in ${duration1}ms\n`);

    // Test another embedding (should be faster - model is cached)
    const text2 = "John is the CEO of TechStart Inc";
    console.log(`🔤 Generating embedding for: "${text2}"`);
    const startTime2 = Date.now();
    const embedding2 = await provider.embed(text2);
    const duration2 = Date.now() - startTime2;
    console.log(`✅ Generated ${embedding2.length}-dimensional embedding in ${duration2}ms\n`);

    // Test similarity
    const similarity = cosineSimilarity(embedding1, embedding2);
    console.log(`📊 Cosine similarity between texts: ${similarity.toFixed(4)}`);
    console.log(`   (0 = completely different, 1 = identical)\n`);

    // Test batch embeddings
    console.log('🔤 Testing batch embeddings...');
    const texts = [
        "The quick brown fox",
        "jumps over the lazy dog",
        "Machine learning is fascinating"
    ];
    const startTime3 = Date.now();
    const embeddings = await provider.embedBatch(texts);
    const duration3 = Date.now() - startTime3;
    console.log(`✅ Generated ${embeddings.length} embeddings in ${duration3}ms\n`);

    console.log('🎉 All tests passed!');
    console.log(`\n📝 Summary:`);
    console.log(`   - Model downloaded and cached`);
    console.log(`   - Single embedding: ${duration1}ms (first run)`);
    console.log(`   - Single embedding: ${duration2}ms (cached)`);
    console.log(`   - Batch embeddings: ${duration3}ms for ${embeddings.length} texts`);
    console.log(`   - Average: ${(duration3 / embeddings.length).toFixed(0)}ms per embedding`);
}

function cosineSimilarity(a, b) {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
        dotProduct += a[i] * b[i];
        normA += a[i] * a[i];
        normB += b[i] * b[i];
    }

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

// Run test
testEmbeddings().catch(error => {
    console.error('❌ Error:', error);
    process.exit(1);
});
