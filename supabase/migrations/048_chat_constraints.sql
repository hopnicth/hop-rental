-- 048: Chat foundation with performance, retention, and data-efficiency guards.
-- Mutations are intended to go through server APIs. RLS exposes only readable
-- rows to participants/platform staff for Realtime and direct reads.

DO $$ BEGIN
  CREATE TYPE public.chat_subject_type AS ENUM ('general', 'product', 'asset', 'order', 'rental_booking');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.chat_conversation_status AS ENUM ('open', 'closed', 'archived');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.chat_participant_role AS ENUM ('customer', 'staff', 'super_admin', 'system');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.chat_message_type AS ENUM ('text', 'attachment', 'system');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.chat_attachment_kind AS ENUM ('image', 'document');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.chat_conversations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_type    public.chat_subject_type NOT NULL DEFAULT 'general',
  subject_id      TEXT,
  customer_id     UUID REFERENCES public.users(id) ON DELETE SET NULL,
  status          public.chat_conversation_status NOT NULL DEFAULT 'open',
  last_message_id UUID,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at       TIMESTAMPTZ,
  archived_at     TIMESTAMPTZ,
  CONSTRAINT chat_subject_id_required
    CHECK (subject_type = 'general' OR NULLIF(trim(subject_id), '') IS NOT NULL),
  CONSTRAINT chat_archive_timestamp_required
    CHECK (status <> 'archived' OR archived_at IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS public.chat_participants (
  conversation_id  UUID NOT NULL REFERENCES public.chat_conversations(id) ON DELETE CASCADE,
  user_id          UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  participant_role public.chat_participant_role NOT NULL DEFAULT 'customer',
  last_read_at     TIMESTAMPTZ,
  joined_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  left_at          TIMESTAMPTZ,
  PRIMARY KEY (conversation_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.chat_messages (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.chat_conversations(id) ON DELETE CASCADE,
  sender_id       UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  message_type    public.chat_message_type NOT NULL DEFAULT 'text',
  body            TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  edited_at       TIMESTAMPTZ,
  deleted_at      TIMESTAMPTZ,
  deleted_by      UUID REFERENCES public.users(id) ON DELETE SET NULL,
  CONSTRAINT chat_message_body_limit CHECK (
    (
      deleted_at IS NULL
      AND message_type = 'text'
      AND NULLIF(trim(body), '') IS NOT NULL
      AND char_length(body) <= 4000
    )
    OR (
      deleted_at IS NULL
      AND message_type IN ('attachment', 'system')
      AND (body IS NULL OR char_length(body) <= 4000)
    )
    OR (
      deleted_at IS NOT NULL
      AND (body IS NULL OR char_length(body) <= 4000)
    )
  )
);

ALTER TABLE public.chat_conversations
  DROP CONSTRAINT IF EXISTS chat_conversations_last_message_id_fkey;
ALTER TABLE public.chat_conversations
  ADD CONSTRAINT chat_conversations_last_message_id_fkey
  FOREIGN KEY (last_message_id) REFERENCES public.chat_messages(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.chat_attachments (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id     UUID NOT NULL REFERENCES public.chat_messages(id) ON DELETE CASCADE,
  storage_bucket TEXT NOT NULL DEFAULT 'chat-attachments',
  storage_path   TEXT NOT NULL,
  file_name      TEXT,
  mime_type      TEXT NOT NULL,
  file_size      BIGINT NOT NULL,
  kind           public.chat_attachment_kind NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at     TIMESTAMPTZ,
  CONSTRAINT chat_attachment_storage_path_external CHECK (
    storage_path !~* '^data:'
    AND storage_path !~* 'base64,'
    AND char_length(storage_path) BETWEEN 1 AND 1024
  ),
  CONSTRAINT chat_attachment_allowed_mime CHECK (
    mime_type IN ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')
  ),
  CONSTRAINT chat_attachment_size_limit CHECK (
    file_size > 0
    AND (
      (kind = 'image' AND mime_type IN ('image/jpeg', 'image/png', 'image/webp') AND file_size <= 5242880)
      OR (kind = 'document' AND mime_type = 'application/pdf' AND file_size <= 10485760)
    )
  ),
  UNIQUE (storage_bucket, storage_path)
);

CREATE INDEX IF NOT EXISTS idx_chat_participants_user
  ON public.chat_participants(user_id, conversation_id);
CREATE INDEX IF NOT EXISTS idx_chat_conversations_status_updated
  ON public.chat_conversations(status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_conversations_subject
  ON public.chat_conversations(subject_type, subject_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_conversation_created
  ON public.chat_messages(conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_messages_sender_recent
  ON public.chat_messages(sender_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_attachments_message
  ON public.chat_attachments(message_id);
CREATE INDEX IF NOT EXISTS idx_chat_attachments_deleted_old
  ON public.chat_attachments(deleted_at, created_at) WHERE deleted_at IS NOT NULL;

COMMENT ON TABLE public.chat_messages IS
  'Minimal chat message rows. No profile/order/product snapshots; resolve related data with joins.';
COMMENT ON COLUMN public.chat_messages.body IS
  'Message text, capped at 4,000 chars. Longer content must be sent as an attachment.';
COMMENT ON TABLE public.chat_attachments IS
  'Attachment metadata only. Binary files live in Supabase Storage, never base64 in the database.';

CREATE OR REPLACE FUNCTION public.chat_is_platform_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = auth.uid()
      AND u.platform_role IN ('staff', 'super_admin')
  );
$$;

CREATE OR REPLACE FUNCTION public.chat_is_participant(target_conversation_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.chat_participants p
    WHERE p.conversation_id = target_conversation_id
      AND p.user_id = auth.uid()
      AND p.left_at IS NULL
  );
$$;

CREATE OR REPLACE FUNCTION public.chat_can_access_conversation(target_conversation_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.chat_is_participant(target_conversation_id)
    OR public.chat_is_platform_admin();
$$;

GRANT EXECUTE ON FUNCTION public.chat_is_platform_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.chat_is_participant(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.chat_can_access_conversation(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.chat_guard_message_write()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  recent_count INTEGER;
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.body := NULLIF(trim(NEW.body), '');

    IF NEW.message_type = 'text' AND NEW.body IS NULL THEN
      RAISE EXCEPTION 'chat message body is required'
        USING ERRCODE = 'check_violation';
    END IF;

    IF NEW.body IS NOT NULL AND char_length(NEW.body) > 4000 THEN
      RAISE EXCEPTION 'chat message body must be 4000 characters or fewer; use an attachment for long content'
        USING ERRCODE = 'string_data_right_truncation';
    END IF;

    SELECT COUNT(*) INTO recent_count
    FROM public.chat_messages m
    WHERE m.sender_id = NEW.sender_id
      AND m.created_at >= now() - interval '1 second';

    IF recent_count >= 10 THEN
      RAISE EXCEPTION 'chat message rate limit exceeded'
        USING ERRCODE = 'too_many_connections';
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL THEN
      NEW.body := NULL;
    ELSIF NEW.body IS NOT NULL AND char_length(NEW.body) > 4000 THEN
      RAISE EXCEPTION 'chat message body must be 4000 characters or fewer; use an attachment for long content'
        USING ERRCODE = 'string_data_right_truncation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS chat_messages_guard_write_trg ON public.chat_messages;
CREATE TRIGGER chat_messages_guard_write_trg
  BEFORE INSERT OR UPDATE ON public.chat_messages
  FOR EACH ROW EXECUTE FUNCTION public.chat_guard_message_write();

CREATE OR REPLACE FUNCTION public.chat_after_message_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE public.chat_conversations
  SET last_message_id = NEW.id,
      updated_at = NEW.created_at
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS chat_messages_after_insert_trg ON public.chat_messages;
CREATE TRIGGER chat_messages_after_insert_trg
  AFTER INSERT ON public.chat_messages
  FOR EACH ROW EXECUTE FUNCTION public.chat_after_message_insert();

DROP TRIGGER IF EXISTS set_chat_conversations_updated_at ON public.chat_conversations;
CREATE TRIGGER set_chat_conversations_updated_at
  BEFORE UPDATE ON public.chat_conversations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE OR REPLACE FUNCTION public.chat_archive_inactive_conversations()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  affected INTEGER;
BEGIN
  UPDATE public.chat_conversations c
  SET status = 'archived', archived_at = now()
  WHERE c.status <> 'archived'
    AND COALESCE(c.updated_at, c.created_at) < now() - interval '1 year';

  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END;
$$;

CREATE OR REPLACE FUNCTION public.chat_mark_deleted_message_attachments_for_cleanup()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  affected INTEGER;
BEGIN
  UPDATE public.chat_attachments a
  SET deleted_at = COALESCE(a.deleted_at, now())
  FROM public.chat_messages m
  WHERE m.id = a.message_id
    AND m.deleted_at IS NOT NULL
    AND m.deleted_at < now() - interval '3 months'
    AND a.deleted_at IS NULL;

  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END;
$$;

ALTER TABLE public.chat_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_attachments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "chat_conversations_select_access" ON public.chat_conversations;
CREATE POLICY "chat_conversations_select_access"
  ON public.chat_conversations FOR SELECT
  USING (public.chat_can_access_conversation(id));

DROP POLICY IF EXISTS "chat_participants_select_access" ON public.chat_participants;
CREATE POLICY "chat_participants_select_access"
  ON public.chat_participants FOR SELECT
  USING (public.chat_can_access_conversation(conversation_id));

DROP POLICY IF EXISTS "chat_messages_select_access" ON public.chat_messages;
CREATE POLICY "chat_messages_select_access"
  ON public.chat_messages FOR SELECT
  USING (public.chat_can_access_conversation(conversation_id));

DROP POLICY IF EXISTS "chat_attachments_select_access" ON public.chat_attachments;
CREATE POLICY "chat_attachments_select_access"
  ON public.chat_attachments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.chat_messages m
      WHERE m.id = chat_attachments.message_id
        AND public.chat_can_access_conversation(m.conversation_id)
    )
  );

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'chat-attachments',
  'chat-attachments',
  FALSE,
  10485760,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
ON CONFLICT (id) DO UPDATE
SET public = FALSE,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_conversations;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_object THEN NULL;
END $$;