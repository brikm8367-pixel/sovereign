-- Create ratchet_sessions table for encrypted E2E session state backups
CREATE TABLE IF NOT EXISTS public.ratchet_sessions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  partner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  encrypted_state TEXT NOT NULL,
  state_version INT NOT NULL DEFAULT 1,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, partner_id)
);

-- Enable Row Level Security
ALTER TABLE public.ratchet_sessions ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only access their own session backups
CREATE POLICY IF NOT EXISTS "Users can manage their own ratchet sessions"
ON public.ratchet_sessions
FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);
