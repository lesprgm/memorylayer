-- Final proper exec_sql using format() with correct type handling

DROP FUNCTION IF EXISTS exec_sql(text, jsonb);

CREATE OR REPLACE FUNCTION exec_sql(query text, params jsonb DEFAULT '[]'::jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result jsonb;
  query_clean text;
  query_upper text;
  param_count int;
  execute_stmt text;
  p1 text; p2 text; p3 text; p4 text; p5 text;
  p6 text; p7 text; p8 text; p9 text; p10 text;
BEGIN
  -- Trim leading whitespace/newlines so SELECT detection works with indented queries
  query_clean := regexp_replace(query, '^\s+', '');
  param_count := jsonb_array_length(params);
  query_upper := upper(query_clean);
  
  IF param_count = 0 THEN
    -- No parameters
    IF query_upper LIKE 'SELECT%' THEN
      EXECUTE 'SELECT COALESCE(jsonb_agg(to_jsonb(t)), ''[]''::jsonb) FROM (' || query_clean || ') AS t' INTO result;
    ELSIF query_upper ~ '.*\sRETURNING\s.*' THEN
      EXECUTE 'WITH result AS (' || query_clean || ') SELECT COALESCE(jsonb_agg(to_jsonb(result)), ''[]''::jsonb) FROM result' INTO result;
    ELSE
      EXECUTE query_clean;
      result := '[{"debug": true}]'::jsonb;
    END IF;
  ELSE
    -- Extract text values from JSONB array
    p1 := CASE WHEN param_count >= 1 THEN params->>0 END;
    p2 := CASE WHEN param_count >= 2 THEN params->>1 END;
    p3 := CASE WHEN param_count >= 3 THEN params->>2 END;
    p4 := CASE WHEN param_count >= 4 THEN params->>3 END;
    p5 := CASE WHEN param_count >= 5 THEN params->>4 END;
    p6 := CASE WHEN param_count >= 6 THEN params->>5 END;
    p7 := CASE WHEN param_count >= 7 THEN params->>6 END;
    p8 := CASE WHEN param_count >= 8 THEN params->>7 END;
    p9 := CASE WHEN param_count >= 9 THEN params->>8 END;
    p10 := CASE WHEN param_count >= 10 THEN params->>9 END;
    
    -- Replace $1, $2, etc. with %L placeholders
    execute_stmt := query_clean;
    FOR i IN 1..param_count LOOP
      execute_stmt := replace(execute_stmt, '$' || i::text, '%L');
    END LOOP;
    
    -- Use format() with extracted text values
    IF param_count > 10 THEN
      RAISE EXCEPTION 'Too many parameters (max 10): %', param_count;
    END IF;
    
    execute_stmt := CASE param_count
      WHEN 1 THEN format(execute_stmt, p1)
      WHEN 2 THEN format(execute_stmt, p1, p2)
      WHEN 3 THEN format(execute_stmt, p1, p2, p3)
      WHEN 4 THEN format(execute_stmt, p1, p2, p3, p4)
      WHEN 5 THEN format(execute_stmt, p1, p2, p3, p4, p5)
      WHEN 6 THEN format(execute_stmt, p1, p2, p3, p4, p5, p6)
      WHEN 7 THEN format(execute_stmt, p1, p2, p3, p4, p5, p6, p7)
      WHEN 8 THEN format(execute_stmt, p1, p2, p3, p4, p5, p6, p7, p8)
      WHEN 9 THEN format(execute_stmt, p1, p2, p3, p4, p5, p6, p7, p8, p9)
      WHEN 10 THEN format(execute_stmt, p1, p2, p3, p4, p5, p6, p7, p8, p9, p10)
    END;
    
    -- Execute
    IF query_upper LIKE 'SELECT%' THEN
      EXECUTE 'SELECT COALESCE(jsonb_agg(to_jsonb(t)), ''[]''::jsonb) FROM (' || execute_stmt || ') AS t' INTO result;
    ELSIF query_upper ~ '.*\sRETURNING\s.*' THEN
      EXECUTE 'WITH result AS (' || execute_stmt || ') SELECT COALESCE(jsonb_agg(to_jsonb(result)), ''[]''::jsonb) FROM result' INTO result;
    ELSE
      EXECUTE execute_stmt;
      result := '[{"debug": true}]'::jsonb;
    END IF;
  END IF;
  
  RETURN COALESCE(result, '[]'::jsonb);
EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'exec_sql error: % (Query: %)', SQLERRM, left(COALESCE(execute_stmt, query), 500);
END;
$$;

GRANT EXECUTE ON FUNCTION exec_sql TO authenticated;
GRANT EXECUTE ON FUNCTION exec_sql TO anon;
GRANT EXECUTE ON FUNCTION exec_sql TO service_role;
