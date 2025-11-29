/**
 * Blog CMS Example - How Ghost uses MemoryLayer
 * 
 * This shows the configuration pattern used in Ghost for semantic blog post linking.
 */

import { MemoryLayer } from '../src/index.js';

// Ghost configuration: Local SQLite with custom memory types
const ml = new MemoryLayer({
    storage: 'sqlite://ghost-memories.db',
    apiKey: process.env.OPENAI_API_KEY,
    memoryTypes: ['topic', 'reference', 'entity'], // Ghost-specific types
    minConfidence: 0.7
});

// Extract memories from blog posts
const blogPost = `
# Building Scalable APIs with Node.js

In this post, we'll explore best practices for building APIs.
We'll cover Express.js, validation, and database design with PostgreSQL.
`;

await ml.extract(blogPost, {
    types: ['topic', 'reference']
});

// Find related posts using semantic search
const relatedPosts = await ml.search("API development", {
    limit: 5,
    types: ['topic'],
    includeRelationships: true
});

console.log('Related posts:', relatedPosts);

// Build SEO-optimized context for "Related Posts" section
const context = await ml.buildContext("Node.js API tutorials", {
    tokenBudget: 500,
    limit: 3
});

console.log('SEO Context:', context);
