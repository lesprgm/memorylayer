/**
 * Hello World - Get started with MemoryLayer in 5 lines
 */

import { MemoryLayer } from '../src/index.js';

// Create your memory-powered app in 5 lines
const ml = new MemoryLayer({
    storage: 'sqlite://memory.db',
    apiKey: process.env.OPENAI_API_KEY
});

// Extract memories from text
await ml.extract("Project Alpha deadline is Q4 2024");
await ml.extract("We decided to use PostgreSQL for the database");
await ml.extract("John is the tech lead on Project Alpha");

// Search using natural language
const results = await ml.search("when is the deadline?");
console.log('Found:', results);

// Build context for AI
const context = await ml.buildContext("Tell me about Project Alpha");
console.log('Context:', context);
