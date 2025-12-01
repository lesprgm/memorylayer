-- Add missing conversation_id column to memories table
-- Run this in your Supabase SQL Editor

ALTER TABLE memories 
ADD COLUMN IF NOT EXISTS conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE;

-- Create index for conversation_id lookups
CREATE INDEX IF NOT EXISTS idx_memories_conversation_id ON memories(conversation_id);

-- Add comment
COMMENT ON COLUMN memories.conversation_id IS 'Links memory to the conversation it was extracted from';
