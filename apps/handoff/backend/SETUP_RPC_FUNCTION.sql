-- Create a custom RPC function for executing SQL queries
-- This is needed for the handoff backend to work with Supabase
-- Run this in your Supabase SQL Editor

-- ⚠️ WARNING: This allows arbitrary SQL execution and should only be used in development
-- For production, create specific RPC functions for each database operation

-- First, drop any existing versions of the function
DROP FUNCTION IF EXISTS exec_sql(text, text[]);
DROP FUNCTION IF EXISTS exec_sql(text, json);
DROP FUNCTION IF EXISTS exec_sql(text, jsonb);
DROP FUNCTION IF EXISTS exec_sql(text);

-- Create the new version that handles parameterized queries
CREATE OR REPLACE FUNCTION exec_sql(query text, params jsonb DEFAULT '[]'::jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result jsonb;
  query_upper text;
  prepared_query text;
  param_count int;
  i int;
  param_value text;
BEGIN
  -- Replace $1, $2, etc. with actual values from params array
  prepared_query := query;
  param_count := jsonb_array_length(params);
  
  FOR i IN 1..param_count LOOP
    param_value := params->>(i-1);
    -- Handle NULL values
    IF param_value IS NULL THEN
      prepared_query := replace(prepared_query, '$' || i::text, 'NULL');
    ELSE
      prepared_query := replace(prepared_query, '$' || i::text, quote_literal(param_value));
    END IF;
  END LOOP;
  
  -- Check if query is a SELECT or a DML statement (INSERT/UPDATE/DELETE with RETURNING)
  query_upper := upper(trim(prepared_query));
  
  IF query_upper LIKE 'SELECT%' OR query_upper LIKE 'WITH%' THEN
    -- For SELECT queries, execute directly and aggregate results
    EXECUTE 'SELECT COALESCE(jsonb_agg(to_jsonb(t)), ''[]''::jsonb) FROM (' || prepared_query || ') AS t' INTO result;
  ELSIF query_upper ~ '\sRETURNING\s' THEN
    -- For INSERT/UPDATE/DELETE with RETURNING clause (using regex to match word boundary)
    EXECUTE 'WITH result AS (' || prepared_query || ') SELECT COALESCE(jsonb_agg(to_jsonb(result)), ''[]''::jsonb) FROM result' INTO result;
  ELSE
    -- For INSERT/UPDATE/DELETE without RETURNING, just execute and return empty array
    EXECUTE prepared_query;
    result := '[]'::jsonb;
  END IF;
  
  RETURN COALESCE(result, '[]'::jsonb);
EXCEPTION
  WHEN OTHERS THEN
    -- Log the error and re-raise with more context
    RAISE EXCEPTION 'exec_sql error: % (Query: %)', SQLERRM, left(prepared_query, 500);
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION exec_sql TO authenticated;
GRANT EXECUTE ON FUNCTION exec_sql TO anon;
GRANT EXECUTE ON FUNCTION exec_sql TO service_role;
