-- Enable Row Level Security and create comprehensive policies for all core tables
-- This migration is idempotent: it enables RLS, drops existing policies, then recreates them.

-- ============================================================
-- profiles
-- ============================================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_select" ON public.profiles;
CREATE POLICY "profiles_select"
  ON public.profiles
  FOR SELECT
  USING (
    auth.uid() = id
    OR is_public = true
    OR auth.uid() IN (
      SELECT ml.manager_id
      FROM public.manager_links ml
      WHERE ml.celebrity_id = profiles.id
        AND ml.status = 'active'
    )
  );

DROP POLICY IF EXISTS "profiles_insert_own" ON public.profiles;
CREATE POLICY "profiles_insert_own"
  ON public.profiles
  FOR INSERT
  WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
CREATE POLICY "profiles_update_own"
  ON public.profiles
  FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- ============================================================
-- messages
-- ============================================================
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "messages_select" ON public.messages;
CREATE POLICY "messages_select"
  ON public.messages
  FOR SELECT
  USING (
    auth.uid() = sender_id
    OR auth.uid() = receiver_id
    OR auth.uid() IN (
      SELECT ml.manager_id
      FROM public.manager_links ml
      WHERE ml.celebrity_id = messages.receiver_id
        AND ml.status = 'active'
    )
  );

DROP POLICY IF EXISTS "messages_insert_sender" ON public.messages;
CREATE POLICY "messages_insert_sender"
  ON public.messages
  FOR INSERT
  WITH CHECK (auth.uid() = sender_id);

DROP POLICY IF EXISTS "messages_update_participant_or_manager" ON public.messages;
CREATE POLICY "messages_update_participant_or_manager"
  ON public.messages
  FOR UPDATE
  USING (
    auth.uid() = sender_id
    OR auth.uid() = receiver_id
    OR auth.uid() IN (
      SELECT ml.manager_id
      FROM public.manager_links ml
      WHERE ml.celebrity_id = messages.receiver_id
        AND ml.status = 'active'
    )
  )
  WITH CHECK (
    auth.uid() = sender_id
    OR auth.uid() = receiver_id
    OR auth.uid() IN (
      SELECT ml.manager_id
      FROM public.manager_links ml
      WHERE ml.celebrity_id = messages.receiver_id
        AND ml.status = 'active'
    )
  );

-- ============================================================
-- deal_cards
-- ============================================================
ALTER TABLE public.deal_cards ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "deal_cards_select" ON public.deal_cards;
CREATE POLICY "deal_cards_select"
  ON public.deal_cards
  FOR SELECT
  USING (
    auth.uid() = sender_id
    OR auth.uid() = celebrity_id
    OR auth.uid() IN (
      SELECT ml.manager_id
      FROM public.manager_links ml
      WHERE ml.celebrity_id = deal_cards.celebrity_id
        AND ml.status = 'active'
    )
  );

DROP POLICY IF EXISTS "deal_cards_insert_sender" ON public.deal_cards;
CREATE POLICY "deal_cards_insert_sender"
  ON public.deal_cards
  FOR INSERT
  WITH CHECK (auth.uid() = sender_id);

DROP POLICY IF EXISTS "deal_cards_update_involved_or_manager" ON public.deal_cards;
CREATE POLICY "deal_cards_update_involved_or_manager"
  ON public.deal_cards
  FOR UPDATE
  USING (
    auth.uid() = sender_id
    OR auth.uid() = celebrity_id
    OR auth.uid() IN (
      SELECT ml.manager_id
      FROM public.manager_links ml
      WHERE ml.celebrity_id = deal_cards.celebrity_id
        AND ml.status = 'active'
    )
  )
  WITH CHECK (
    auth.uid() = sender_id
    OR auth.uid() = celebrity_id
    OR auth.uid() IN (
      SELECT ml.manager_id
      FROM public.manager_links ml
      WHERE ml.celebrity_id = deal_cards.celebrity_id
        AND ml.status = 'active'
    )
  );

-- ============================================================
-- message_limits
-- ============================================================
ALTER TABLE public.message_limits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "message_limits_select_own" ON public.message_limits;
CREATE POLICY "message_limits_select_own"
  ON public.message_limits
  FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "message_limits_insert_own" ON public.message_limits;
CREATE POLICY "message_limits_insert_own"
  ON public.message_limits
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "message_limits_update_own" ON public.message_limits;
CREATE POLICY "message_limits_update_own"
  ON public.message_limits
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- manager_invitations
-- ============================================================
ALTER TABLE public.manager_invitations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "manager_invitations_select_celebrity" ON public.manager_invitations;
CREATE POLICY "manager_invitations_select_celebrity"
  ON public.manager_invitations
  FOR SELECT
  USING (auth.uid() = celebrity_id);

DROP POLICY IF EXISTS "manager_invitations_insert_celebrity" ON public.manager_invitations;
CREATE POLICY "manager_invitations_insert_celebrity"
  ON public.manager_invitations
  FOR INSERT
  WITH CHECK (auth.uid() = celebrity_id);

-- ============================================================
-- manager_links
-- ============================================================
ALTER TABLE public.manager_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "manager_links_select_involved" ON public.manager_links;
CREATE POLICY "manager_links_select_involved"
  ON public.manager_links
  FOR SELECT
  USING (auth.uid() = manager_id OR auth.uid() = celebrity_id);

DROP POLICY IF EXISTS "manager_links_insert_involved" ON public.manager_links;
CREATE POLICY "manager_links_insert_involved"
  ON public.manager_links
  FOR INSERT
  WITH CHECK (auth.uid() = manager_id OR auth.uid() = celebrity_id);

DROP POLICY IF EXISTS "manager_links_update_involved" ON public.manager_links;
CREATE POLICY "manager_links_update_involved"
  ON public.manager_links
  FOR UPDATE
  USING (auth.uid() = manager_id OR auth.uid() = celebrity_id)
  WITH CHECK (auth.uid() = manager_id OR auth.uid() = celebrity_id);

-- ============================================================
-- direct_access (conditional: only if table exists)
-- ============================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'direct_access'
  ) THEN
    ALTER TABLE public.direct_access ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS "direct_access_select" ON public.direct_access;
    CREATE POLICY "direct_access_select"
      ON public.direct_access
      FOR SELECT
      USING (auth.uid() = celebrity_id OR auth.uid() = user_id);

    DROP POLICY IF EXISTS "direct_access_insert" ON public.direct_access;
    CREATE POLICY "direct_access_insert"
      ON public.direct_access
      FOR INSERT
      WITH CHECK (auth.uid() = celebrity_id OR auth.uid() = user_id);

    DROP POLICY IF EXISTS "direct_access_update" ON public.direct_access;
    CREATE POLICY "direct_access_update"
      ON public.direct_access
      FOR UPDATE
      USING (auth.uid() = celebrity_id OR auth.uid() = user_id)
      WITH CHECK (auth.uid() = celebrity_id OR auth.uid() = user_id);
  END IF;
END $$;
