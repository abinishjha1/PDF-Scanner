# Supabase Setup for PDF Scanner

Run this SQL in your Supabase SQL Editor to create the required table:

```sql
-- Create scanner_images table
CREATE TABLE IF NOT EXISTS scanner_images (
  id BIGSERIAL PRIMARY KEY,
  session_id TEXT NOT NULL,
  image_data TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for faster session queries
CREATE INDEX IF NOT EXISTS idx_scanner_images_session 
ON scanner_images(session_id);

-- Enable Row Level Security (optional but recommended)
ALTER TABLE scanner_images ENABLE ROW LEVEL SECURITY;

-- Allow public read/write for scanner_images
CREATE POLICY "Allow public access" ON scanner_images
FOR ALL USING (true) WITH CHECK (true);

-- Auto-cleanup old sessions (optional - deletes after 24 hours)
-- Run this as a scheduled function or manually
-- DELETE FROM scanner_images WHERE created_at < NOW() - INTERVAL '24 hours';
```

## Steps:
1. Go to your Supabase Dashboard
2. Navigate to SQL Editor
3. Paste and run the SQL above
4. Copy your **anon public key** (not the service role key)
5. Update the SUPABASE_KEY in mobile.js and main.js
