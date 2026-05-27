-- 1. Create the table with soft delete and usage_count
CREATE TABLE IF NOT EXISTS master_packing_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    source TEXT DEFAULT 'auto-learned',
    usage_count INTEGER DEFAULT 1,
    is_active BOOLEAN DEFAULT TRUE
);

-- 2. Prevent duplicates (case-insensitive)
CREATE UNIQUE INDEX IF NOT EXISTS unique_lower_name 
ON master_packing_items (LOWER(name));

-- 3. Optimize query performance for the dropdown (which sorts by usage_count DESC)
CREATE INDEX IF NOT EXISTS idx_usage_count 
ON master_packing_items (usage_count DESC);

-- 4. Migrate existing data and clean it (TRIM and LOWER)
INSERT INTO master_packing_items (name, source, usage_count)
SELECT DISTINCT TRIM(LOWER(value)), 'migrated', 1 
FROM master_list 
WHERE category_key = 'Packing List Items'
AND value IS NOT NULL
ON CONFLICT (LOWER(name)) DO NOTHING;

-- 5. Create an RPC for safe bulk upsert from the client
-- This handles the LOWER(name) conflict safely in a single API call
CREATE OR REPLACE FUNCTION bulk_learn_packing_items(item_names TEXT[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    item_name TEXT;
BEGIN
    FOREACH item_name IN ARRAY item_names
    LOOP
        INSERT INTO master_packing_items (name, usage_count, source)
        VALUES (TRIM(item_name), 1, 'auto-learned')
        ON CONFLICT (LOWER(name))
        DO UPDATE SET usage_count = master_packing_items.usage_count + 1;
    END LOOP;
END;
$$;
