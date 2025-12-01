-- Fix workspace_members table schema to match the backend expectations
-- Run this in your Supabase SQL Editor

-- Add missing id column as primary key
ALTER TABLE workspace_members 
ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid();

-- Add missing created_at column
ALTER TABLE workspace_members 
ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- Drop the old primary key if it exists
ALTER TABLE workspace_members 
DROP CONSTRAINT IF EXISTS workspace_members_pkey;

-- Set id as the new primary key
ALTER TABLE workspace_members 
ADD PRIMARY KEY (id);

-- Rename joined_at to match if needed (optional - the code uses created_at)
-- If you want to keep joined_at, you can skip this
-- ALTER TABLE workspace_members RENAME COLUMN joined_at TO created_at;
