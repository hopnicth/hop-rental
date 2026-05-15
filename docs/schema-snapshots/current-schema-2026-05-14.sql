


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE SCHEMA IF NOT EXISTS "storage";


ALTER SCHEMA "storage" OWNER TO "supabase_admin";


CREATE TYPE "public"."asset_document_kind" AS ENUM (
    'manual',
    'certificate',
    'brochure',
    'spec_sheet',
    'service_attachment',
    'internal_note',
    'other'
);


ALTER TYPE "public"."asset_document_kind" OWNER TO "postgres";


CREATE TYPE "public"."asset_document_visibility" AS ENUM (
    'public',
    'customer_after_booking',
    'internal'
);


ALTER TYPE "public"."asset_document_visibility" OWNER TO "postgres";


CREATE TYPE "public"."asset_status" AS ENUM (
    'draft',
    'active',
    'archived'
);


ALTER TYPE "public"."asset_status" OWNER TO "postgres";


CREATE TYPE "public"."catalog_product_type" AS ENUM (
    'sale',
    'rental',
    'hybrid'
);


ALTER TYPE "public"."catalog_product_type" OWNER TO "postgres";


CREATE TYPE "public"."chat_attachment_kind" AS ENUM (
    'image',
    'document'
);


ALTER TYPE "public"."chat_attachment_kind" OWNER TO "postgres";


CREATE TYPE "public"."chat_conversation_status" AS ENUM (
    'open',
    'closed',
    'archived'
);


ALTER TYPE "public"."chat_conversation_status" OWNER TO "postgres";


CREATE TYPE "public"."chat_message_type" AS ENUM (
    'text',
    'attachment',
    'system'
);


ALTER TYPE "public"."chat_message_type" OWNER TO "postgres";


CREATE TYPE "public"."chat_participant_role" AS ENUM (
    'customer',
    'staff',
    'super_admin',
    'system'
);


ALTER TYPE "public"."chat_participant_role" OWNER TO "postgres";


CREATE TYPE "public"."chat_subject_type" AS ENUM (
    'general',
    'product',
    'asset',
    'order',
    'rental_booking'
);


ALTER TYPE "public"."chat_subject_type" OWNER TO "postgres";


CREATE TYPE "public"."company_role" AS ENUM (
    'b2b_admin',
    'b2b_user'
);


ALTER TYPE "public"."company_role" OWNER TO "postgres";


CREATE TYPE "public"."kyc_status" AS ENUM (
    'pending',
    'verified',
    'rejected'
);


ALTER TYPE "public"."kyc_status" OWNER TO "postgres";


CREATE TYPE "public"."membership_level" AS ENUM (
    'bronze',
    'silver',
    'gold'
);


ALTER TYPE "public"."membership_level" OWNER TO "postgres";


CREATE TYPE "public"."order_checkout_mode" AS ENUM (
    'payment',
    'quotation'
);


ALTER TYPE "public"."order_checkout_mode" OWNER TO "postgres";


CREATE TYPE "public"."order_fulfillment_status" AS ENUM (
    'not_applicable',
    'unfulfilled',
    'preparing',
    'ready_for_carrier_pickup',
    'shipped',
    'delivered',
    'returned',
    'cancelled'
);


ALTER TYPE "public"."order_fulfillment_status" OWNER TO "postgres";


CREATE TYPE "public"."order_payment_method" AS ENUM (
    'credit_card',
    'promptpay',
    'company_credit',
    'cash',
    'qr_transfer',
    'bank_transfer',
    'card',
    'other'
);


ALTER TYPE "public"."order_payment_method" OWNER TO "postgres";


CREATE TYPE "public"."order_payment_status" AS ENUM (
    'not_applicable',
    'pending_review',
    'awaiting_payment',
    'paid',
    'deferred',
    'cancelled',
    'refunded'
);


ALTER TYPE "public"."order_payment_status" OWNER TO "postgres";


CREATE TYPE "public"."order_shipping_mode" AS ENUM (
    'delivery',
    'pickup'
);


ALTER TYPE "public"."order_shipping_mode" OWNER TO "postgres";


CREATE TYPE "public"."order_status" AS ENUM (
    'submitted',
    'confirmed',
    'completed',
    'cancelled'
);


ALTER TYPE "public"."order_status" OWNER TO "postgres";


CREATE TYPE "public"."payment_attempt_method" AS ENUM (
    'credit_card',
    'promptpay'
);


ALTER TYPE "public"."payment_attempt_method" OWNER TO "postgres";


CREATE TYPE "public"."payment_attempt_status" AS ENUM (
    'created',
    'pending',
    'requires_action',
    'paid',
    'failed',
    'expired',
    'cancelled',
    'refunded',
    'finalizing',
    'finalized',
    'partial_finalized',
    'finalization_failed'
);


ALTER TYPE "public"."payment_attempt_status" OWNER TO "postgres";


CREATE TYPE "public"."payment_event_status" AS ENUM (
    'received',
    'processed',
    'ignored',
    'failed'
);


ALTER TYPE "public"."payment_event_status" OWNER TO "postgres";


CREATE TYPE "public"."payment_gateway" AS ENUM (
    'omise'
);


ALTER TYPE "public"."payment_gateway" OWNER TO "postgres";


CREATE TYPE "public"."platform_role" AS ENUM (
    'customer',
    'staff',
    'super_admin'
);


ALTER TYPE "public"."platform_role" OWNER TO "postgres";


CREATE TYPE "public"."product_shipping_size" AS ENUM (
    'free',
    's',
    'm',
    'l',
    'xl'
);


ALTER TYPE "public"."product_shipping_size" OWNER TO "postgres";


CREATE TYPE "public"."rental_asset_allocation_status" AS ENUM (
    'allocated',
    'picked_up',
    'returned',
    'released',
    'cancelled'
);


ALTER TYPE "public"."rental_asset_allocation_status" OWNER TO "postgres";


CREATE TYPE "public"."rental_asset_event_type" AS ENUM (
    'created',
    'status_changed',
    'allocated',
    'picked_up',
    'returned',
    'released',
    'maintenance_started',
    'maintenance_completed',
    'hub_transferred',
    'retired',
    'note'
);


ALTER TYPE "public"."rental_asset_event_type" OWNER TO "postgres";


CREATE TYPE "public"."rental_asset_status" AS ENUM (
    'available',
    'reserved',
    'out_on_rent',
    'inspection',
    'maintenance',
    'retired',
    'lost'
);


ALTER TYPE "public"."rental_asset_status" OWNER TO "postgres";


CREATE TYPE "public"."rental_booking_document_type" AS ENUM (
    'repair',
    'fine',
    'damage_evidence',
    'handover',
    'other'
);


ALTER TYPE "public"."rental_booking_document_type" OWNER TO "postgres";


CREATE TYPE "public"."rental_booking_handover_return_status" AS ENUM (
    'pending',
    'returned_complete',
    'returned_partial',
    'missing',
    'damaged'
);


ALTER TYPE "public"."rental_booking_handover_return_status" OWNER TO "postgres";


CREATE TYPE "public"."rental_booking_status" AS ENUM (
    'draft',
    'confirmed',
    'cancelled',
    'picked_up',
    'returned',
    'no_show'
);


ALTER TYPE "public"."rental_booking_status" OWNER TO "postgres";


CREATE TYPE "public"."rental_checklist_item_response_type" AS ENUM (
    'check',
    'text',
    'number'
);


ALTER TYPE "public"."rental_checklist_item_response_type" OWNER TO "postgres";


CREATE TYPE "public"."rental_checklist_item_result" AS ENUM (
    'pending',
    'passed',
    'failed',
    'not_applicable'
);


ALTER TYPE "public"."rental_checklist_item_result" OWNER TO "postgres";


CREATE TYPE "public"."rental_checklist_kind" AS ENUM (
    'pickup',
    'return',
    'inspection',
    'service'
);


ALTER TYPE "public"."rental_checklist_kind" OWNER TO "postgres";


CREATE TYPE "public"."rental_checklist_status" AS ENUM (
    'draft',
    'in_progress',
    'completed',
    'cancelled'
);


ALTER TYPE "public"."rental_checklist_status" OWNER TO "postgres";


CREATE TYPE "public"."rental_pricing_model" AS ENUM (
    'daily'
);


ALTER TYPE "public"."rental_pricing_model" OWNER TO "postgres";


CREATE TYPE "public"."rental_service_cycle_unit" AS ENUM (
    'day',
    'week',
    'month',
    'year'
);


ALTER TYPE "public"."rental_service_cycle_unit" OWNER TO "postgres";


CREATE TYPE "public"."rental_service_event_type" AS ENUM (
    'inspection',
    'preventive_maintenance',
    'repair',
    'cleaning',
    'calibration',
    'other'
);


ALTER TYPE "public"."rental_service_event_type" OWNER TO "postgres";


CREATE TYPE "public"."sku_inventory_kind" AS ENUM (
    'sale',
    'rental',
    'shared'
);


ALTER TYPE "public"."sku_inventory_kind" OWNER TO "postgres";


CREATE TYPE "storage"."buckettype" AS ENUM (
    'STANDARD',
    'ANALYTICS',
    'VECTOR'
);


ALTER TYPE "storage"."buckettype" OWNER TO "supabase_storage_admin";


CREATE OR REPLACE FUNCTION "public"."asset_branch_inventory_sync_branch"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  inv_branch_id   TEXT;
  inv_branch_code TEXT;
  inv_branch_name TEXT;
BEGIN
  SELECT b.id, b.code, COALESCE(b.name_th, b.name_en, b.code)
    INTO inv_branch_id, inv_branch_code, inv_branch_name
  FROM public.inventories i
  JOIN public.store_branches b ON b.id = i.branch_id
  WHERE i.id = NEW.inventory_id;

  IF inv_branch_id IS NULL THEN
    RAISE EXCEPTION 'inventory_id % does not exist or has no branch', NEW.inventory_id;
  END IF;

  NEW.branch_id   := inv_branch_id;
  NEW.branch_code := COALESCE(NEW.branch_code, inv_branch_code);
  NEW.branch_name := COALESCE(NULLIF(trim(NEW.branch_name), ''), inv_branch_name);
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."asset_branch_inventory_sync_branch"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."asset_filter_options_sync_trg"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.assets_sync_filter_keys(NEW.asset_id);
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM public.assets_sync_filter_keys(OLD.asset_id);
  END IF;
  RETURN NULL;
END;
$$;


ALTER FUNCTION "public"."asset_filter_options_sync_trg"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."assets_check_storage_inventory"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  inv_branch TEXT;
BEGIN
  IF NEW.storage_inventory_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT branch_id INTO inv_branch
  FROM public.inventories
  WHERE id = NEW.storage_inventory_id;

  IF inv_branch IS NULL THEN
    RAISE EXCEPTION 'storage_inventory_id % does not exist', NEW.storage_inventory_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF NEW.storage_branch_id IS NULL THEN
    NEW.storage_branch_id := inv_branch;
  ELSIF NEW.storage_branch_id <> inv_branch THEN
    RAISE EXCEPTION 'storage_inventory_id % does not belong to storage_branch_id %', NEW.storage_inventory_id, NEW.storage_branch_id
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."assets_check_storage_inventory"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."assets_clear_filter_options_on_category_change"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  IF OLD.main_category_key IS DISTINCT FROM NEW.main_category_key THEN
    DELETE FROM public.asset_filter_options
     WHERE asset_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."assets_clear_filter_options_on_category_change"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."assets_resync_filter_options_from_tags"("p_asset_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  r_main_category TEXT;
  r_tag_keys      TEXT[];
BEGIN
  SELECT main_category_key, COALESCE(tag_keys, ARRAY[]::TEXT[])
    INTO r_main_category, r_tag_keys
    FROM public.assets
   WHERE id = p_asset_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  DELETE FROM public.asset_filter_options afo
   WHERE afo.asset_id = p_asset_id
     AND NOT EXISTS (
       SELECT 1
         FROM public.filter_options fo
         JOIN public.filter_groups  fg ON fg.id = fo.group_id
        WHERE fo.id = afo.filter_option_id
          AND fg.main_category_key = r_main_category
          AND fg.is_active = TRUE
          AND fg.filter_type IN ('checkbox','dropdown')
          AND fo.is_active = TRUE
          AND fo.key = ANY(r_tag_keys)
     );

  INSERT INTO public.asset_filter_options (asset_id, filter_option_id)
  SELECT p_asset_id, fo.id
    FROM public.filter_options fo
    JOIN public.filter_groups  fg ON fg.id = fo.group_id
   WHERE fg.main_category_key = r_main_category
     AND fg.is_active = TRUE
     AND fg.filter_type IN ('checkbox','dropdown')
     AND fo.is_active = TRUE
     AND fo.key = ANY(r_tag_keys)
  ON CONFLICT DO NOTHING;
END;
$$;


ALTER FUNCTION "public"."assets_resync_filter_options_from_tags"("p_asset_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."assets_resync_filter_options_from_tags"("p_asset_id" "uuid") IS 'Recomputes asset_filter_options for one asset from assets.tag_keys (case-sensitive match against filter_options.key).';



CREATE OR REPLACE FUNCTION "public"."assets_resync_filter_options_trg"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  PERFORM public.assets_resync_filter_options_from_tags(NEW.id);
  RETURN NULL;
END;
$$;


ALTER FUNCTION "public"."assets_resync_filter_options_trg"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."assets_search_vector_update"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.search_keywords := COALESCE(NEW.search_keywords, ARRAY[]::TEXT[]);

  NEW.search_vector :=
    setweight(to_tsvector('simple',
      coalesce(NEW.code, '') || ' ' ||
      coalesce(NEW.slug, '') || ' ' ||
      coalesce(NEW.name_th, '') || ' ' ||
      coalesce(NEW.name_en, '') || ' ' ||
      coalesce(NEW.name_cn, '') || ' ' ||
      coalesce(NEW.name_jp, '')
    ), 'A') ||
    setweight(to_tsvector('simple',
      coalesce(NEW.brand, '') || ' ' ||
      coalesce(NEW.main_category_key, '') || ' ' ||
      coalesce(array_to_string(NEW.category_keys, ' '), '') || ' ' ||
      coalesce(array_to_string(NEW.tag_keys, ' '), '') || ' ' ||
      coalesce(array_to_string(NEW.search_keywords, ' '), '')
    ), 'B') ||
    setweight(to_tsvector('simple',
      coalesce(NEW.description_th, '') || ' ' ||
      coalesce(NEW.description_en, '') || ' ' ||
      coalesce(NEW.description_cn, '') || ' ' ||
      coalesce(NEW.description_jp, '')
    ), 'C') ||
    setweight(to_tsvector('simple',
      coalesce(NEW.spec_summary::TEXT, '') || ' ' ||
      coalesce(NEW.detail_blocks::TEXT, '')
    ), 'D');

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."assets_search_vector_update"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."assets_sync_category_keys"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  IF NEW.main_category_key IS NULL OR char_length(trim(NEW.main_category_key)) = 0 THEN
    SELECT mc.key
    INTO NEW.main_category_key
    FROM unnest(COALESCE(NEW.category_keys, ARRAY[]::TEXT[])) AS raw_key(key)
    JOIN public.main_categories mc ON mc.key = raw_key.key
    LIMIT 1;
  END IF;

  IF NEW.main_category_key IS NULL OR char_length(trim(NEW.main_category_key)) = 0 THEN
    NEW.main_category_key := 'others';
  END IF;

  NEW.tag_keys := COALESCE(NEW.tag_keys, ARRAY[]::TEXT[]);

  IF cardinality(NEW.tag_keys) = 0 AND cardinality(COALESCE(NEW.category_keys, ARRAY[]::TEXT[])) > 0 THEN
    NEW.tag_keys := ARRAY(
      SELECT raw_key.key
      FROM unnest(COALESCE(NEW.category_keys, ARRAY[]::TEXT[])) AS raw_key(key)
      WHERE raw_key.key IS NOT NULL
        AND char_length(trim(raw_key.key)) > 0
        AND raw_key.key <> NEW.main_category_key
    );
  END IF;

  NEW.category_keys := ARRAY(
    SELECT DISTINCT raw_key.key
    FROM unnest(array_prepend(NEW.main_category_key, NEW.tag_keys)) AS raw_key(key)
    WHERE raw_key.key IS NOT NULL
      AND char_length(trim(raw_key.key)) > 0
  );

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."assets_sync_category_keys"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."assets_sync_filter_keys"("p_asset_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  UPDATE public.assets
  SET filter_keys = COALESCE(
    (
      SELECT array_agg(DISTINCT fg.key || '__' || fo.key)
      FROM public.asset_filter_options afo
      JOIN public.filter_options fo ON fo.id = afo.filter_option_id
      JOIN public.filter_groups  fg ON fg.id = fo.group_id
      WHERE afo.asset_id = p_asset_id
    ),
    ARRAY[]::TEXT[]
  )
  WHERE id = p_asset_id;
END;
$$;


ALTER FUNCTION "public"."assets_sync_filter_keys"("p_asset_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."autocomplete_assets"("prefix" "text", "p_limit" integer DEFAULT 8, "p_include_hidden" boolean DEFAULT false) RETURNS TABLE("id" "uuid", "code" "text", "slug" "text", "status" "public"."asset_status", "name_th" "text", "name_en" "text", "name_cn" "text", "name_jp" "text", "brand" "text", "thumbnail_url" "text", "main_category_key" "text", "category_keys" "text"[], "similarity_score" real)
    LANGUAGE "sql" STABLE
    AS $$
  WITH query AS (
    SELECT nullif(trim(prefix), '') AS raw
  )
  SELECT
    a.id,
    a.code,
    a.slug,
    a.status,
    a.name_th,
    a.name_en,
    a.name_cn,
    a.name_jp,
    a.brand,
    a.thumbnail_url,
    a.main_category_key,
    a.category_keys,
    GREATEST(
      extensions.similarity(coalesce(a.code, ''), q.raw),
      extensions.similarity(coalesce(a.slug, ''), q.raw),
      extensions.similarity(coalesce(a.name_th, ''), q.raw),
      extensions.similarity(coalesce(a.name_en, ''), q.raw),
      extensions.similarity(coalesce(a.brand, ''), q.raw)
    )::REAL AS similarity_score
  FROM public.assets a
  CROSS JOIN query q
  WHERE
    q.raw IS NOT NULL
    AND (p_include_hidden OR (a.status = 'active' AND a.is_hidden = FALSE))
    AND (
      a.search_vector @@ plainto_tsquery('simple', q.raw)
      OR a.code ILIKE q.raw || '%'
      OR a.slug ILIKE q.raw || '%'
      OR a.name_th ILIKE '%' || q.raw || '%'
      OR a.name_en ILIKE '%' || q.raw || '%'
      OR coalesce(a.brand, '') ILIKE '%' || q.raw || '%'
      OR (coalesce(a.code, '') || ' ' || coalesce(a.slug, '') || ' ' || coalesce(a.name_th, '') || ' ' || coalesce(a.name_en, '')) ILIKE '%' || q.raw || '%'
      OR extensions.similarity(coalesce(a.code, ''), q.raw) > 0.2
      OR extensions.similarity(coalesce(a.name_th, ''), q.raw) > 0.2
      OR extensions.similarity(coalesce(a.name_en, ''), q.raw) > 0.2
    )
  ORDER BY
    (lower(a.code) = lower(q.raw)) DESC,
    (a.code ILIKE q.raw || '%') DESC,
    similarity_score DESC,
    a.rental_count DESC,
    a.sort_order ASC,
    a.updated_at DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 8), 1), 50);
$$;


ALTER FUNCTION "public"."autocomplete_assets"("prefix" "text", "p_limit" integer, "p_include_hidden" boolean) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."autocomplete_assets"("prefix" "text", "p_limit" integer, "p_include_hidden" boolean) IS 'Typeahead suggestions for assets using exact code/prefix, full-text search, and trigram similarity. p_include_hidden is intended for service-role/admin calls; RLS still applies for normal callers.';



CREATE OR REPLACE FUNCTION "public"."autocomplete_products"("prefix" "text", "p_limit" integer DEFAULT 8) RETURNS TABLE("id" "text", "slug" "text", "name_th" "text", "name_en" "text", "name_cn" "text", "name_jp" "text", "media_gallery" "jsonb", "type" "public"."catalog_product_type", "category_keys" "text"[], "similarity_score" real)
    LANGUAGE "sql" STABLE
    AS $$
  SELECT
    p.id,
    p.slug,
    p.name_th,
    p.name_en,
    p.name_cn,
    p.name_jp,
    COALESCE(p.media_gallery, '[]'::JSONB),
    p.type,
    p.category_keys,
    GREATEST(
      extensions.similarity(coalesce(p.name_th, ''), prefix),
      extensions.similarity(coalesce(p.name_en, ''), prefix)
    )::REAL AS similarity_score
  FROM public.products p
  LEFT JOIN public.product_metrics pm ON pm.product_id = p.id
  WHERE
    p.is_hidden = FALSE
    AND nullif(trim(prefix), '') IS NOT NULL
    AND (
      p.name_th ILIKE prefix || '%'
      OR p.name_en ILIKE prefix || '%'
      OR (coalesce(p.name_th, '') || ' ' || coalesce(p.name_en, '')) ILIKE '%' || prefix || '%'
      OR extensions.similarity(coalesce(p.name_th, ''), prefix) > 0.2
      OR extensions.similarity(coalesce(p.name_en, ''), prefix) > 0.2
    )
  ORDER BY
    similarity_score DESC,
    COALESCE(pm.order_count, 0) DESC,
    COALESCE(pm.trending_score, 0) DESC
  LIMIT p_limit;
$$;


ALTER FUNCTION "public"."autocomplete_products"("prefix" "text", "p_limit" integer) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."autocomplete_products"("prefix" "text", "p_limit" integer) IS 'Typeahead suggestions for product names using trigram similarity + prefix ILIKE. Ordered with product_metrics-backed popularity.';



CREATE OR REPLACE FUNCTION "public"."cart_items_apply_pricing_snapshot_defaults"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.original_unit_price := COALESCE(NEW.original_unit_price, NEW.unit_price);
  NEW.discount_percent := COALESCE(NEW.discount_percent, 0);
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."cart_items_apply_pricing_snapshot_defaults"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."chat_after_message_insert"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  UPDATE public.chat_conversations
  SET last_message_id = NEW.id,
      updated_at = NEW.created_at
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."chat_after_message_insert"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."chat_archive_inactive_conversations"() RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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


ALTER FUNCTION "public"."chat_archive_inactive_conversations"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."chat_can_access_conversation"("target_conversation_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT public.chat_is_participant(target_conversation_id)
    OR public.chat_is_platform_admin();
$$;


ALTER FUNCTION "public"."chat_can_access_conversation"("target_conversation_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."chat_guard_message_write"() RETURNS "trigger"
    LANGUAGE "plpgsql"
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


ALTER FUNCTION "public"."chat_guard_message_write"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."chat_is_participant"("target_conversation_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.chat_participants p
    WHERE p.conversation_id = target_conversation_id
      AND p.user_id = auth.uid()
      AND p.left_at IS NULL
  );
$$;


ALTER FUNCTION "public"."chat_is_participant"("target_conversation_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."chat_is_platform_admin"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = auth.uid()
      AND u.platform_role IN ('staff', 'super_admin')
  );
$$;


ALTER FUNCTION "public"."chat_is_platform_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."chat_mark_deleted_message_attachments_for_cleanup"() RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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


ALTER FUNCTION "public"."chat_mark_deleted_message_attachments_for_cleanup"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."decrement_product_wishlist_count"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  UPDATE public.product_metrics
  SET wishlist_count = GREATEST(wishlist_count - 1, 0),
      updated_at = now()
  WHERE product_id = OLD.product_id;

  RETURN OLD;
END;
$$;


ALTER FUNCTION "public"."decrement_product_wishlist_count"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ensure_product_metrics_row"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  INSERT INTO public.product_metrics (product_id)
  VALUES (NEW.id)
  ON CONFLICT (product_id) DO NOTHING;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."ensure_product_metrics_row"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ensure_rental_booking_asset_sku_match"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  booking_sku_id TEXT;
  asset_sku_id   TEXT;
BEGIN
  SELECT sku_id INTO booking_sku_id
  FROM public.rental_bookings
  WHERE id = NEW.booking_id;

  SELECT sku_id INTO asset_sku_id
  FROM public.rental_assets
  WHERE id = NEW.asset_id;

  IF booking_sku_id IS NULL OR asset_sku_id IS NULL THEN
    RAISE EXCEPTION 'Booking or asset missing for rental allocation';
  END IF;

  IF booking_sku_id <> asset_sku_id THEN
    RAISE EXCEPTION 'Allocated asset SKU (%) does not match booking SKU (%)', asset_sku_id, booking_sku_id;
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."ensure_rental_booking_asset_sku_match"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ensure_single_default_address"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  IF NEW.is_default = true THEN
    IF NEW.user_id IS NOT NULL THEN
      UPDATE public.addresses SET is_default = false
       WHERE user_id = NEW.user_id AND id != NEW.id AND is_default = true;
    END IF;
    IF NEW.company_id IS NOT NULL THEN
      UPDATE public.addresses SET is_default = false
       WHERE company_id = NEW.company_id AND id != NEW.id AND is_default = true;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."ensure_single_default_address"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."f_apply_order_inventory"("p_order_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_already_applied TIMESTAMPTZ;
  v_branch_id       TEXT;
  v_item            RECORD;
  v_inv             RECORD;
  v_remaining       INTEGER;
  v_take            INTEGER;
BEGIN
  SELECT inventory_applied_at, pos_branch_id
    INTO v_already_applied, v_branch_id
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'order % not found', p_order_id;
  END IF;
  IF v_already_applied IS NOT NULL THEN
    RETURN FALSE;
  END IF;

  FOR v_item IN
    SELECT sku_id, SUM(quantity)::INTEGER AS qty
    FROM public.order_items
    WHERE order_id = p_order_id
    GROUP BY sku_id
  LOOP
    v_remaining := v_item.qty;
    FOR v_inv IN
      SELECT id, on_hand, available
      FROM public.sku_branch_inventory
      WHERE sku_id = v_item.sku_id
        AND inventory_kind IN ('sale', 'shared')
        AND (v_branch_id IS NULL OR branch_id = v_branch_id)
        AND available > 0
      ORDER BY created_at ASC, id ASC
      FOR UPDATE
    LOOP
      EXIT WHEN v_remaining <= 0;
      v_take := LEAST(v_inv.available, v_remaining);
      UPDATE public.sku_branch_inventory
      SET on_hand = GREATEST(0, on_hand - v_take),
          available = GREATEST(0, available - v_take),
          updated_at = now()
      WHERE id = v_inv.id;
      v_remaining := v_remaining - v_take;
    END LOOP;

    IF v_remaining > 0 THEN
      RAISE EXCEPTION 'insufficient available inventory for sku %', v_item.sku_id;
    END IF;

    PERFORM public.sync_product_sku_inventory_summary(v_item.sku_id);
  END LOOP;

  UPDATE public.orders SET inventory_applied_at = now() WHERE id = p_order_id;
  RETURN TRUE;
END;
$$;


ALTER FUNCTION "public"."f_apply_order_inventory"("p_order_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."f_apply_order_inventory"("p_order_id" "uuid") IS 'Idempotent stock deduction triggered after payment success. Returns TRUE on first call, FALSE on subsequent calls.';



CREATE OR REPLACE FUNCTION "public"."f_cancel_customer_rental_booking_refund_request"("p_booking_id" "uuid", "p_user_id" "uuid", "p_cancelled_at" timestamp with time zone, "p_cancellation_reason_code" "text", "p_cancellation_reason_note" "text", "p_pickup_local_date" "date", "p_cancellation_local_date" "date", "p_refund_cutoff_date" "date", "p_refund_policy_version" "text", "p_refund_timezone" "text", "p_refund_amount" numeric, "p_original_payment_source_type" "text", "p_original_rental_booking_payment_attempt_id" "uuid", "p_original_mixed_payment_allocation_id" "uuid", "p_gateway" "public"."payment_gateway", "p_gateway_charge_id" "text", "p_gateway_payment_reference" "text", "p_currency_code" "text", "p_refund_bank_name" "text", "p_refund_bank_account_number" "text", "p_refund_bank_account_name" "text", "p_refund_contact_phone" "text", "p_refund_customer_note" "text", "p_restriction_window_started_at" timestamp with time zone) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_booking public.rental_bookings%ROWTYPE;
  v_updated_booking public.rental_bookings%ROWTYPE;
  v_event public.rental_booking_cancellation_events%ROWTYPE;
  v_refund public.payment_refunds%ROWTYPE;
  v_existing_event public.rental_booking_cancellation_events%ROWTYPE;
  v_existing_refund public.payment_refunds%ROWTYPE;
  v_count INTEGER := 0;
  v_restriction_status TEXT := 'none';
BEGIN
  SELECT * INTO v_booking
  FROM public.rental_bookings
  WHERE id = p_booking_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'BOOKING_NOT_FOUND';
  END IF;
  IF v_booking.user_id IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'BOOKING_ACCESS_DENIED';
  END IF;

  IF v_booking.status = 'cancelled' THEN
    SELECT * INTO v_existing_event
    FROM public.rental_booking_cancellation_events
    WHERE booking_id = p_booking_id
      AND cancellation_initiator = 'customer'
      AND cancellation_source = 'customer_web'
    ORDER BY cancelled_at DESC
    LIMIT 1;

    IF v_existing_event.id IS NOT NULL THEN
      SELECT * INTO v_existing_refund
      FROM public.payment_refunds
      WHERE cancellation_event_id = v_existing_event.id
      LIMIT 1;
    END IF;

    RETURN jsonb_build_object(
      'ok', true,
      'alreadyCancelled', true,
      'bookingId', p_booking_id,
      'cancellationEventId', v_existing_event.id,
      'refundRequest', to_jsonb(v_existing_refund)
    );
  END IF;

  IF v_booking.status = 'draft' THEN
    RAISE EXCEPTION 'BOOKING_NOT_CONFIRMED';
  END IF;
  IF v_booking.status IN ('picked_up', 'returned') THEN
    RAISE EXCEPTION 'BOOKING_ALREADY_FULFILLED';
  END IF;
  IF v_booking.status <> 'confirmed' THEN
    RAISE EXCEPTION 'BOOKING_NOT_CANCELLABLE';
  END IF;
  IF v_booking.booking_deposit_payment_status <> 'paid' THEN
    RAISE EXCEPTION 'BOOKING_DEPOSIT_NOT_PAID';
  END IF;
  IF p_refund_amount <= 0 THEN
    RAISE EXCEPTION 'BOOKING_DEPOSIT_REFUND_AMOUNT_NOT_RESOLVED';
  END IF;
  IF p_cancellation_local_date > p_refund_cutoff_date THEN
    RAISE EXCEPTION 'CANCELLATION_REFUND_CUTOFF_PASSED';
  END IF;
  IF p_original_payment_source_type = 'rental_booking_payment_attempt'
     AND p_original_rental_booking_payment_attempt_id IS NULL THEN
    RAISE EXCEPTION 'ORIGINAL_PAYMENT_SOURCE_NOT_RESOLVED';
  END IF;
  IF p_original_payment_source_type = 'mixed_payment_allocation'
     AND p_original_mixed_payment_allocation_id IS NULL THEN
    RAISE EXCEPTION 'ORIGINAL_PAYMENT_SOURCE_NOT_RESOLVED';
  END IF;

  -- Serialize cancellation restriction counting per customer. Without this lock,
  -- concurrent cancellations of different bookings by the same user can both count
  -- the same prior total and miss applying the >5 restriction.
  PERFORM 1
  FROM public.users
  WHERE id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'BOOKING_ACCESS_DENIED';
  END IF;

  INSERT INTO public.rental_booking_cancellation_events (
    booking_id, user_id, actor_user_id, actor_type, cancelled_at,
    cancellation_initiator, cancellation_source, cancellation_reason_code,
    cancellation_reason_note, previous_status,
    previous_booking_deposit_payment_status, pickup_date_snapshot,
    cancellation_local_date_snapshot, refund_cutoff_date_snapshot,
    refund_policy_version, refund_timezone, refund_eligible, refund_amount_due,
    qualifies_for_restriction, metadata
  ) VALUES (
    p_booking_id, p_user_id, p_user_id, 'customer', p_cancelled_at,
    'customer', 'customer_web', NULLIF(trim(coalesce(p_cancellation_reason_code, '')), ''),
    NULLIF(trim(coalesce(p_cancellation_reason_note, '')), ''), v_booking.status,
    v_booking.booking_deposit_payment_status, p_pickup_local_date,
    p_cancellation_local_date, p_refund_cutoff_date,
    p_refund_policy_version, p_refund_timezone, true, p_refund_amount,
    true, jsonb_build_object('originalPaymentSourceType', p_original_payment_source_type)
  ) RETURNING * INTO v_event;

  UPDATE public.rental_bookings
  SET status = 'cancelled',
      cancelled_at = p_cancelled_at,
      cancelled_by_user_id = p_user_id,
      cancellation_initiator = 'customer',
      cancellation_source = 'customer_web',
      cancellation_reason = COALESCE(
        NULLIF(trim(coalesce(p_cancellation_reason_note, '')), ''),
        NULLIF(trim(coalesce(p_cancellation_reason_code, '')), '')
      ),
      cancellation_source_event_id = v_event.id,
      cancellation_refund_eligible = true,
      cancellation_refund_amount_due = p_refund_amount,
      cancellation_refund_cutoff_date = p_refund_cutoff_date
  WHERE id = p_booking_id
    AND status = 'confirmed'
  RETURNING * INTO v_updated_booking;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'BOOKING_CANCELLATION_CONFLICT';
  END IF;

  INSERT INTO public.payment_refunds (
    refund_type, booking_id, user_id, cancellation_event_id,
    original_payment_source_type, original_rental_booking_payment_attempt_id,
    original_mixed_payment_allocation_id, gateway, gateway_charge_id,
    gateway_payment_reference, refund_amount, currency_code,
    refund_bank_name, refund_bank_account_number, refund_bank_account_name,
    refund_contact_phone, customer_note, customer_confirmed_destination_at,
    status, requested_at, metadata
  ) VALUES (
    'rental_booking_deposit', p_booking_id, p_user_id, v_event.id,
    p_original_payment_source_type, p_original_rental_booking_payment_attempt_id,
    p_original_mixed_payment_allocation_id, p_gateway, p_gateway_charge_id,
    p_gateway_payment_reference, p_refund_amount, upper(p_currency_code),
    p_refund_bank_name, p_refund_bank_account_number, p_refund_bank_account_name,
    p_refund_contact_phone, NULLIF(trim(coalesce(p_refund_customer_note, '')), ''),
    p_cancelled_at, 'pending_admin_review', p_cancelled_at,
    jsonb_build_object('cancellationPolicyVersion', p_refund_policy_version)
  ) RETURNING * INTO v_refund;

  SELECT count(*) INTO v_count
  FROM public.rental_booking_cancellation_events
  WHERE user_id = p_user_id
    AND qualifies_for_restriction = true
    AND cancelled_at >= p_restriction_window_started_at
    AND cancelled_at <= p_cancelled_at;

  UPDATE public.rental_booking_cancellation_events
  SET qualifying_cancellation_count_after = v_count,
      restriction_window_started_at = p_restriction_window_started_at
  WHERE id = v_event.id
  RETURNING * INTO v_event;

  IF v_count > 5 THEN
    v_restriction_status := 'restricted';
    UPDATE public.users
    SET rental_booking_restriction_status = 'restricted',
        rental_booking_restriction_applied_at = p_cancelled_at,
        rental_booking_restriction_reason = 'excessive_customer_rental_cancellations',
        rental_booking_restriction_source_event_id = v_event.id,
        rental_booking_restriction_cancellation_count = v_count,
        rental_booking_restriction_window_started_at = p_restriction_window_started_at
    WHERE id = p_user_id;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'alreadyCancelled', false,
    'booking', to_jsonb(v_updated_booking),
    'cancellationEvent', to_jsonb(v_event),
    'refund', to_jsonb(v_refund),
    'restriction', jsonb_build_object(
      'status', v_restriction_status,
      'count', v_count,
      'windowStartedAt', p_restriction_window_started_at
    )
  );
END;
$$;


ALTER FUNCTION "public"."f_cancel_customer_rental_booking_refund_request"("p_booking_id" "uuid", "p_user_id" "uuid", "p_cancelled_at" timestamp with time zone, "p_cancellation_reason_code" "text", "p_cancellation_reason_note" "text", "p_pickup_local_date" "date", "p_cancellation_local_date" "date", "p_refund_cutoff_date" "date", "p_refund_policy_version" "text", "p_refund_timezone" "text", "p_refund_amount" numeric, "p_original_payment_source_type" "text", "p_original_rental_booking_payment_attempt_id" "uuid", "p_original_mixed_payment_allocation_id" "uuid", "p_gateway" "public"."payment_gateway", "p_gateway_charge_id" "text", "p_gateway_payment_reference" "text", "p_currency_code" "text", "p_refund_bank_name" "text", "p_refund_bank_account_number" "text", "p_refund_bank_account_name" "text", "p_refund_contact_phone" "text", "p_refund_customer_note" "text", "p_restriction_window_started_at" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."f_cancel_pos_sale"("p_order_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_order          RECORD;
  v_item           RECORD;
  v_inv            RECORD;
  v_should_reverse BOOLEAN := FALSE;
  v_restocked      BOOLEAN := FALSE;
  v_total_qty      INTEGER := 0;
BEGIN
  SELECT id, status, payment_status, pos_branch_id, inventory_applied_at, inventory_reversed_at
    INTO v_order
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'POS sale % not found', p_order_id;
  END IF;

  IF v_order.pos_branch_id IS NULL THEN
    RAISE EXCEPTION 'Only POS sales can be cancelled here';
  END IF;

  v_should_reverse :=
    v_order.inventory_applied_at IS NOT NULL
    AND v_order.inventory_reversed_at IS NULL;

  IF v_should_reverse THEN
    FOR v_item IN
      SELECT sku_id, SUM(quantity)::INTEGER AS qty
      FROM public.order_items
      WHERE order_id = p_order_id
      GROUP BY sku_id
    LOOP
      SELECT id
        INTO v_inv
      FROM public.sku_branch_inventory
      WHERE sku_id = v_item.sku_id
        AND branch_id = v_order.pos_branch_id
        AND inventory_kind IN ('sale', 'shared')
      ORDER BY created_at ASC, id ASC
      LIMIT 1
      FOR UPDATE;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'inventory row not found for sku % branch %',
          v_item.sku_id,
          v_order.pos_branch_id;
      END IF;

      UPDATE public.sku_branch_inventory
      SET on_hand = on_hand + v_item.qty,
          available = available + v_item.qty,
          updated_at = now()
      WHERE id = v_inv.id;

      PERFORM public.sync_product_sku_inventory_summary(v_item.sku_id);
      v_total_qty := v_total_qty + v_item.qty;
      v_restocked := TRUE;
    END LOOP;
  END IF;

  UPDATE public.orders
  SET status = 'cancelled',
      payment_status = 'cancelled',
      fulfillment_status = 'cancelled',
      inventory_reversed_at = CASE
        WHEN v_should_reverse THEN now()
        ELSE inventory_reversed_at
      END
  WHERE id = p_order_id;

  RETURN jsonb_build_object(
    'ok', TRUE,
    'status', 'cancelled',
    'inventoryWasApplied', v_order.inventory_applied_at IS NOT NULL,
    'inventoryAlreadyReversed', v_order.inventory_reversed_at IS NOT NULL,
    'inventoryRestocked', v_restocked,
    'restockedQuantity', v_total_qty
  );
END;
$$;


ALTER FUNCTION "public"."f_cancel_pos_sale"("p_order_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."f_get_active_agreement_version"("p_agreement_type" "text", "p_as_of" timestamp with time zone DEFAULT "now"()) RETURNS TABLE("id" "uuid", "agreement_type" "text", "version" "text", "title" "text", "content_format" "text", "content_body" "text", "content_hash" "text", "rendered_text_hash" "text", "effective_from" timestamp with time zone)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT
    av.id,
    av.agreement_type,
    av.version,
    av.title,
    av.content_format,
    av.content_body,
    av.content_hash,
    av.rendered_text_hash,
    av.effective_from
  FROM public.agreement_versions av
  WHERE av.agreement_type = p_agreement_type
    AND av.status = 'published'
    AND av.effective_from <= p_as_of
    AND (av.effective_until IS NULL OR av.effective_until > p_as_of)
  ORDER BY av.effective_from DESC
  LIMIT 1;
$$;


ALTER FUNCTION "public"."f_get_active_agreement_version"("p_agreement_type" "text", "p_as_of" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."f_next_document_number"("p_document_type" "text", "p_branch_id" "text", "p_period" "text", "p_prefix" "text") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
DECLARE
  v_sequence_key TEXT := 'global';
  v_next_number INTEGER;
BEGIN
  IF p_document_type IS NULL OR char_length(trim(p_document_type)) = 0 THEN
    RAISE EXCEPTION 'document_type is required';
  END IF;

  IF p_period IS NULL OR p_period !~ '^[0-9]{6}$' THEN
    RAISE EXCEPTION 'period must be in YYYYMM format';
  END IF;

  IF p_prefix IS NULL OR char_length(trim(p_prefix)) = 0 THEN
    RAISE EXCEPTION 'prefix is required';
  END IF;

  INSERT INTO public.document_sequences (
    document_type,
    sequence_key,
    branch_id,
    period,
    prefix,
    last_number
  ) VALUES (
    p_document_type,
    v_sequence_key,
    p_branch_id,
    p_period,
    p_prefix,
    1
  )
  ON CONFLICT (document_type, sequence_key, period)
  DO UPDATE SET
    last_number = public.document_sequences.last_number + 1,
    prefix = EXCLUDED.prefix,
    updated_at = now()
  RETURNING last_number INTO v_next_number;

  RETURN p_prefix || '-' || p_period || '-' || lpad(v_next_number::TEXT, 4, '0');
END;
$_$;


ALTER FUNCTION "public"."f_next_document_number"("p_document_type" "text", "p_branch_id" "text", "p_period" "text", "p_prefix" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."filter_groups_cascade_resync_trg"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.filter_resync_main_category(NEW.main_category_key);
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.main_category_key IS DISTINCT FROM NEW.main_category_key THEN
      PERFORM public.filter_resync_main_category(OLD.main_category_key);
    END IF;
    PERFORM public.filter_resync_main_category(NEW.main_category_key);
  END IF;
  RETURN NULL;
END;
$$;


ALTER FUNCTION "public"."filter_groups_cascade_resync_trg"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."filter_groups_resync_on_key_change"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  affected RECORD;
BEGIN
  IF OLD.key IS DISTINCT FROM NEW.key THEN
    FOR affected IN
      SELECT DISTINCT pfo.product_id
        FROM public.product_filter_options pfo
        JOIN public.filter_options fo ON fo.id = pfo.filter_option_id
       WHERE fo.group_id = NEW.id
    LOOP
      PERFORM public.products_sync_filter_keys(affected.product_id);
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."filter_groups_resync_on_key_change"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."filter_groups_resync_on_key_change"() IS 'Re-derives products.filter_keys for products affected by a filter_groups.key rename.';



CREATE OR REPLACE FUNCTION "public"."filter_options_cascade_resync_trg"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_main_category_old TEXT;
  v_main_category_new TEXT;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT main_category_key INTO v_main_category_new
      FROM public.filter_groups WHERE id = NEW.group_id;
    PERFORM public.filter_resync_main_category(v_main_category_new);
  ELSIF TG_OP = 'UPDATE' THEN
    SELECT main_category_key INTO v_main_category_new
      FROM public.filter_groups WHERE id = NEW.group_id;
    IF OLD.group_id IS DISTINCT FROM NEW.group_id THEN
      SELECT main_category_key INTO v_main_category_old
        FROM public.filter_groups WHERE id = OLD.group_id;
      PERFORM public.filter_resync_main_category(v_main_category_old);
    END IF;
    PERFORM public.filter_resync_main_category(v_main_category_new);
  ELSIF TG_OP = 'DELETE' THEN
    -- ON DELETE CASCADE on the junction handles removals; nothing to do.
    NULL;
  END IF;
  RETURN NULL;
END;
$$;


ALTER FUNCTION "public"."filter_options_cascade_resync_trg"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."filter_options_resync_on_key_change"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  affected RECORD;
BEGIN
  IF OLD.key IS DISTINCT FROM NEW.key THEN
    FOR affected IN
      SELECT DISTINCT product_id
        FROM public.product_filter_options
       WHERE filter_option_id = NEW.id
    LOOP
      PERFORM public.products_sync_filter_keys(affected.product_id);
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."filter_options_resync_on_key_change"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."filter_options_resync_on_key_change"() IS 'Re-derives products.filter_keys for products affected by a filter_options.key rename.';



CREATE OR REPLACE FUNCTION "public"."filter_resync_main_category"("p_main_category" "text") RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  r RECORD;
BEGIN
  IF p_main_category IS NULL THEN
    RETURN;
  END IF;

  FOR r IN SELECT id FROM public.products WHERE main_category_key = p_main_category LOOP
    PERFORM public.products_resync_filter_options_from_tags(r.id);
  END LOOP;

  FOR r IN SELECT id FROM public.assets WHERE main_category_key = p_main_category LOOP
    PERFORM public.assets_resync_filter_options_from_tags(r.id);
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."filter_resync_main_category"("p_main_category" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."filter_resync_main_category"("p_main_category" "text") IS 'Re-runs the tag-based auto-sync for every product and asset under the given main_category_key.';



CREATE OR REPLACE FUNCTION "public"."guard_agreement_acceptance_log_updates"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  IF NEW.agreement_version_id IS DISTINCT FROM OLD.agreement_version_id
    OR NEW.agreement_type IS DISTINCT FROM OLD.agreement_type
    OR NEW.agreement_version IS DISTINCT FROM OLD.agreement_version
    OR NEW.agreement_title IS DISTINCT FROM OLD.agreement_title
    OR NEW.content_hash IS DISTINCT FROM OLD.content_hash
    OR NEW.rendered_text_hash IS DISTINCT FROM OLD.rendered_text_hash
    OR NEW.customer_user_id IS DISTINCT FROM OLD.customer_user_id
    OR NEW.walk_in_phone IS DISTINCT FROM OLD.walk_in_phone
    OR NEW.company_id IS DISTINCT FROM OLD.company_id
    OR NEW.booking_id IS DISTINCT FROM OLD.booking_id
    OR NEW.order_id IS DISTINCT FROM OLD.order_id
    OR NEW.official_document_id IS DISTINCT FROM OLD.official_document_id
    OR NEW.source_type IS DISTINCT FROM OLD.source_type
    OR NEW.source_id IS DISTINCT FROM OLD.source_id
    OR NEW.accepted_channel IS DISTINCT FROM OLD.accepted_channel
    OR NEW.consent_action IS DISTINCT FROM OLD.consent_action
    OR NEW.customer_confirmation_method IS DISTINCT FROM OLD.customer_confirmation_method
    OR NEW.staff_remark IS DISTINCT FROM OLD.staff_remark
    OR NEW.accepted_at IS DISTINCT FROM OLD.accepted_at
    OR NEW.ip_address IS DISTINCT FROM OLD.ip_address
    OR NEW.user_agent IS DISTINCT FROM OLD.user_agent
    OR NEW.staff_user_id IS DISTINCT FROM OLD.staff_user_id
    OR NEW.evidence_snapshot IS DISTINCT FROM OLD.evidence_snapshot
    OR NEW.correction_of_acceptance_id IS DISTINCT FROM OLD.correction_of_acceptance_id
    OR NEW.request_id IS DISTINCT FROM OLD.request_id
    OR NEW.session_id IS DISTINCT FROM OLD.session_id
    OR NEW.metadata IS DISTINCT FROM OLD.metadata
    OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'agreement acceptance evidence is immutable; only status fields may change';
  END IF;

  IF OLD.status <> 'accepted' AND NEW.status = 'accepted' THEN
    RAISE EXCEPTION 'revoked, cancelled, or corrected acceptance logs cannot return to accepted';
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."guard_agreement_acceptance_log_updates"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."guard_agreement_version_finalized_delete"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  IF OLD.status <> 'draft' THEN
    RAISE EXCEPTION 'published or retired agreement versions cannot be deleted';
  END IF;

  RETURN OLD;
END;
$$;


ALTER FUNCTION "public"."guard_agreement_version_finalized_delete"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."guard_agreement_version_finalized_updates"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  IF OLD.status <> 'draft' THEN
    IF NEW.agreement_type IS DISTINCT FROM OLD.agreement_type
      OR NEW.version IS DISTINCT FROM OLD.version
      OR NEW.title IS DISTINCT FROM OLD.title
      OR NEW.content_format IS DISTINCT FROM OLD.content_format
      OR NEW.content_body IS DISTINCT FROM OLD.content_body
      OR NEW.content_hash IS DISTINCT FROM OLD.content_hash
      OR NEW.rendered_text_hash IS DISTINCT FROM OLD.rendered_text_hash
      OR NEW.effective_from IS DISTINCT FROM OLD.effective_from
      OR NEW.published_at IS DISTINCT FROM OLD.published_at
      OR NEW.published_by IS DISTINCT FROM OLD.published_by
      OR NEW.replaces_version_id IS DISTINCT FROM OLD.replaces_version_id
      OR NEW.created_by IS DISTINCT FROM OLD.created_by
      OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
      RAISE EXCEPTION 'published agreement version content and identity are immutable';
    END IF;

    IF NEW.status = 'draft' THEN
      RAISE EXCEPTION 'finalized agreement version cannot return to draft';
    END IF;

    IF OLD.status = 'retired' AND NEW.status <> 'retired' THEN
      RAISE EXCEPTION 'retired agreement version cannot be republished';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."guard_agreement_version_finalized_updates"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."guard_official_document_finalized_updates"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  IF OLD.status <> 'draft' THEN
    IF NEW.subtotal IS DISTINCT FROM OLD.subtotal
      OR NEW.vat_amount IS DISTINCT FROM OLD.vat_amount
      OR NEW.total_amount IS DISTINCT FROM OLD.total_amount THEN
      RAISE EXCEPTION 'document totals are immutable after issue';
    END IF;

    IF NEW.tax_profile_id IS DISTINCT FROM OLD.tax_profile_id
      OR NEW.customer_user_id IS DISTINCT FROM OLD.customer_user_id
      OR NEW.walk_in_phone IS DISTINCT FROM OLD.walk_in_phone
      OR NEW.company_id IS DISTINCT FROM OLD.company_id THEN
      RAISE EXCEPTION 'document customer identity is immutable after issue';
    END IF;

    IF NEW.source_type IS DISTINCT FROM OLD.source_type
      OR NEW.source_id IS DISTINCT FROM OLD.source_id THEN
      RAISE EXCEPTION 'document source is immutable after issue';
    END IF;

    IF NEW.template_key IS DISTINCT FROM OLD.template_key
      OR NEW.template_version IS DISTINCT FROM OLD.template_version THEN
      RAISE EXCEPTION 'document template is immutable after issue';
    END IF;

    IF NEW.snapshot IS DISTINCT FROM OLD.snapshot THEN
      RAISE EXCEPTION 'snapshot is immutable after issue';
    END IF;

    IF NEW.document_no IS DISTINCT FROM OLD.document_no THEN
      RAISE EXCEPTION 'document number is immutable after issue';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."guard_official_document_finalized_updates"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  INSERT INTO public.users (id, full_name, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', NEW.raw_user_meta_data ->> 'name'),
    NEW.raw_user_meta_data ->> 'avatar_url'
  );
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."increment_product_wishlist_count"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  INSERT INTO public.product_metrics (product_id, wishlist_count)
  VALUES (NEW.product_id, 1)
  ON CONFLICT (product_id) DO UPDATE
  SET wishlist_count = public.product_metrics.wishlist_count + 1,
      updated_at = now();

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."increment_product_wishlist_count"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."inventories_protect_default"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.is_default THEN
      RAISE EXCEPTION 'Default inventory (id=%) cannot be deleted', OLD.id
        USING ERRCODE = 'check_violation';
    END IF;
    IF OLD.is_default_rental THEN
      RAISE EXCEPTION 'Default rental inventory (id=%) cannot be deleted', OLD.id
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.is_default THEN
    IF NEW.is_default IS DISTINCT FROM OLD.is_default
       OR NEW.name IS DISTINCT FROM OLD.name
       OR NEW.branch_id IS DISTINCT FROM OLD.branch_id THEN
      RAISE EXCEPTION 'Default inventory (id=%) cannot have name, is_default, or branch_id changed', OLD.id
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.is_default_rental THEN
    IF NEW.is_default_rental IS DISTINCT FROM OLD.is_default_rental
       OR NEW.name IS DISTINCT FROM OLD.name
       OR NEW.branch_id IS DISTINCT FROM OLD.branch_id THEN
      RAISE EXCEPTION 'Default rental inventory (id=%) cannot have name, is_default_rental, or branch_id changed', OLD.id
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."inventories_protect_default"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_company_admin"("target_company_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.company_members cm
    WHERE cm.company_id = target_company_id
      AND cm.user_id = auth.uid()
      AND cm.role = 'b2b_admin'
  );
$$;


ALTER FUNCTION "public"."is_company_admin"("target_company_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_company_member"("target_company_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.company_members cm
    WHERE cm.company_id = target_company_id
      AND cm.user_id = auth.uid()
  );
$$;


ALTER FUNCTION "public"."is_company_member"("target_company_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."normalize_catalog_search_keyword_term"("raw_value" "text") RETURNS "text"
    LANGUAGE "sql" IMMUTABLE
    AS $$
  SELECT lower(trim(regexp_replace(coalesce(raw_value, ''), '\s+', ' ', 'g')));
$$;


ALTER FUNCTION "public"."normalize_catalog_search_keyword_term"("raw_value" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."normalize_catalog_tag_term"("raw_value" "text") RETURNS "text"
    LANGUAGE "sql" IMMUTABLE
    AS $$
  SELECT trim(BOTH '_' FROM regexp_replace(
    regexp_replace(
      regexp_replace(lower(coalesce(raw_value, '')), '[-\s]+', '_', 'g'),
      '[^a-z0-9_-]+',
      '',
      'g'
    ),
    '_{2,}',
    '_',
    'g'
  ));
$$;


ALTER FUNCTION "public"."normalize_catalog_tag_term"("raw_value" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."orders_stamp_shipped_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  IF NEW.fulfillment_status = 'shipped'
     AND (OLD.fulfillment_status IS DISTINCT FROM 'shipped')
     AND NEW.shipped_at IS NULL THEN
    NEW.shipped_at := now();
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."orders_stamp_shipped_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."prevent_agreement_acceptance_log_delete"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  RAISE EXCEPTION 'agreement acceptance logs cannot be deleted';
END;
$$;


ALTER FUNCTION "public"."prevent_agreement_acceptance_log_delete"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."prevent_agreement_evidence_file_update_delete"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  RAISE EXCEPTION 'agreement evidence files are append-only and cannot be updated or deleted';
END;
$$;


ALTER FUNCTION "public"."prevent_agreement_evidence_file_update_delete"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."prevent_public_users_hard_delete"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  -- Allow trusted maintenance roles to repair/account-sync records. Customer
  -- lifecycle flows must still prefer soft-delete/anonymization updates.
  IF current_user IN ('service_role', 'postgres', 'supabase_admin') THEN
    RETURN OLD;
  END IF;

  RAISE EXCEPTION
    'Hard deleting public.users is disabled; use account_status/deleted_at/anonymized_at lifecycle fields instead';
END;
$$;


ALTER FUNCTION "public"."prevent_public_users_hard_delete"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."prevent_public_users_hard_delete"() IS 'Prevents client-side public.users hard deletes while allowing trusted service-role/postgres maintenance bypass.';



CREATE OR REPLACE FUNCTION "public"."product_filter_options_sync_trg"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.products_sync_filter_keys(NEW.product_id);
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM public.products_sync_filter_keys(OLD.product_id);
  END IF;
  RETURN NULL;
END;
$$;


ALTER FUNCTION "public"."product_filter_options_sync_trg"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."products_clear_filter_options_on_category_change"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  IF OLD.main_category_key IS DISTINCT FROM NEW.main_category_key THEN
    DELETE FROM public.product_filter_options
     WHERE product_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."products_clear_filter_options_on_category_change"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."products_resync_filter_options_from_tags"("p_product_id" "text") RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  r_main_category TEXT;
  r_tag_keys      TEXT[];
BEGIN
  SELECT main_category_key, COALESCE(tag_keys, ARRAY[]::TEXT[])
    INTO r_main_category, r_tag_keys
    FROM public.products
   WHERE id = p_product_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  DELETE FROM public.product_filter_options pfo
   WHERE pfo.product_id = p_product_id
     AND NOT EXISTS (
       SELECT 1
         FROM public.filter_options fo
         JOIN public.filter_groups  fg ON fg.id = fo.group_id
        WHERE fo.id = pfo.filter_option_id
          AND fg.main_category_key = r_main_category
          AND fg.is_active = TRUE
          AND fg.filter_type IN ('checkbox','dropdown')
          AND fo.is_active = TRUE
          AND fo.key = ANY(r_tag_keys)
     );

  INSERT INTO public.product_filter_options (product_id, filter_option_id)
  SELECT p_product_id, fo.id
    FROM public.filter_options fo
    JOIN public.filter_groups  fg ON fg.id = fo.group_id
   WHERE fg.main_category_key = r_main_category
     AND fg.is_active = TRUE
     AND fg.filter_type IN ('checkbox','dropdown')
     AND fo.is_active = TRUE
     AND fo.key = ANY(r_tag_keys)
  ON CONFLICT DO NOTHING;
END;
$$;


ALTER FUNCTION "public"."products_resync_filter_options_from_tags"("p_product_id" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."products_resync_filter_options_from_tags"("p_product_id" "text") IS 'Recomputes product_filter_options for one product from products.tag_keys (case-sensitive match against filter_options.key).';



CREATE OR REPLACE FUNCTION "public"."products_resync_filter_options_trg"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  PERFORM public.products_resync_filter_options_from_tags(NEW.id);
  RETURN NULL;
END;
$$;


ALTER FUNCTION "public"."products_resync_filter_options_trg"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."products_search_vector_update"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('simple',
      coalesce(NEW.name_th, '') || ' ' ||
      coalesce(NEW.name_en, '') || ' ' ||
      coalesce(NEW.name_cn, '') || ' ' ||
      coalesce(NEW.name_jp, '')
    ), 'A') ||
    setweight(to_tsvector('simple',
      coalesce(NEW.brand, '') || ' ' ||
      coalesce(NEW.main_category_key, '') || ' ' ||
      coalesce(array_to_string(NEW.tag_keys, ' '), '') || ' ' ||
      coalesce(array_to_string(NEW.category_keys, ' '), '')
    ), 'B') ||
    setweight(to_tsvector('simple',
      coalesce(NEW.description_th, '') || ' ' ||
      coalesce(NEW.description_en, '') || ' ' ||
      coalesce(NEW.description_cn, '') || ' ' ||
      coalesce(NEW.description_jp, '') || ' ' ||
      coalesce(NEW.detail_blocks::text, '')
    ), 'C') ||
    setweight(to_tsvector('simple',
      coalesce(NEW.spec::text, '') || ' ' ||
      coalesce(array_to_string(NEW.search_keywords, ' '), '')
    ), 'D');

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."products_search_vector_update"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."products_sync_category_keys"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  IF NEW.main_category_key IS NULL OR char_length(trim(NEW.main_category_key)) = 0 THEN
    SELECT mc.key
    INTO NEW.main_category_key
    FROM unnest(COALESCE(NEW.category_keys, ARRAY[]::TEXT[])) AS raw_key(key)
    JOIN public.main_categories mc ON mc.key = raw_key.key
    LIMIT 1;
  END IF;

  IF NEW.main_category_key IS NULL OR char_length(trim(NEW.main_category_key)) = 0 THEN
    NEW.main_category_key := 'others';
  END IF;

  NEW.tag_keys := COALESCE(NEW.tag_keys, ARRAY[]::TEXT[]);

  IF cardinality(NEW.tag_keys) = 0 AND cardinality(COALESCE(NEW.category_keys, ARRAY[]::TEXT[])) > 0 THEN
    NEW.tag_keys := ARRAY(
      SELECT raw_key.key
      FROM unnest(COALESCE(NEW.category_keys, ARRAY[]::TEXT[])) AS raw_key(key)
      WHERE raw_key.key IS NOT NULL
        AND char_length(trim(raw_key.key)) > 0
        AND raw_key.key <> NEW.main_category_key
    );
  END IF;

  NEW.category_keys := ARRAY(
    SELECT DISTINCT raw_key.key
    FROM unnest(array_prepend(NEW.main_category_key, NEW.tag_keys)) AS raw_key(key)
    WHERE raw_key.key IS NOT NULL
      AND char_length(trim(raw_key.key)) > 0
  );

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."products_sync_category_keys"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."products_sync_filter_keys"("p_product_id" "text") RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  UPDATE public.products
  SET filter_keys = COALESCE(
    (
      SELECT array_agg(DISTINCT fg.key || '__' || fo.key)
      FROM public.product_filter_options pfo
      JOIN public.filter_options fo ON fo.id = pfo.filter_option_id
      JOIN public.filter_groups  fg ON fg.id = fo.group_id
      WHERE pfo.product_id = p_product_id
    ),
    ARRAY[]::TEXT[]
  )
  WHERE id = p_product_id;
END;
$$;


ALTER FUNCTION "public"."products_sync_filter_keys"("p_product_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."protect_companies_finance_columns"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  IF current_user IN ('service_role', 'postgres', 'supabase_admin') THEN
    RETURN NEW;
  END IF;

  NEW.credit_limit          := OLD.credit_limit;
  NEW.credit_used           := OLD.credit_used;
  NEW.credit_term_days      := OLD.credit_term_days;
  NEW.billing_cycle         := OLD.billing_cycle;
  NEW.kyc_status            := OLD.kyc_status;
  NEW.kyc_documents         := OLD.kyc_documents;
  NEW.kyc_rejection_reason  := OLD.kyc_rejection_reason;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."protect_companies_finance_columns"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."protect_users_sensitive_columns"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  IF current_user IN ('service_role', 'postgres', 'supabase_admin') THEN
    RETURN NEW;
  END IF;

  NEW.platform_role := OLD.platform_role;
  NEW.membership_level := OLD.membership_level;
  NEW.kyc_status := OLD.kyc_status;
  NEW.kyc_rejection_reason := OLD.kyc_rejection_reason;
  NEW.account_status := OLD.account_status;
  NEW.deactivation_requested_at := OLD.deactivation_requested_at;
  NEW.deletion_requested_at := OLD.deletion_requested_at;
  NEW.deleted_at := OLD.deleted_at;
  NEW.anonymized_at := OLD.anonymized_at;
  NEW.deletion_reason := OLD.deletion_reason;
  NEW.lifecycle_note := OLD.lifecycle_note;
  NEW.lifecycle_updated_at := OLD.lifecycle_updated_at;
  NEW.lifecycle_updated_by := OLD.lifecycle_updated_by;
  NEW.rental_booking_restriction_status := OLD.rental_booking_restriction_status;
  NEW.rental_booking_restriction_applied_at := OLD.rental_booking_restriction_applied_at;
  NEW.rental_booking_restriction_reason := OLD.rental_booking_restriction_reason;
  NEW.rental_booking_restriction_source_event_id := OLD.rental_booking_restriction_source_event_id;
  NEW.rental_booking_restriction_cancellation_count := OLD.rental_booking_restriction_cancellation_count;
  NEW.rental_booking_restriction_window_started_at := OLD.rental_booking_restriction_window_started_at;
  NEW.rental_booking_restriction_overridden_at := OLD.rental_booking_restriction_overridden_at;
  NEW.rental_booking_restriction_overridden_by := OLD.rental_booking_restriction_overridden_by;
  NEW.rental_booking_restriction_override_reason := OLD.rental_booking_restriction_override_reason;
  NEW.rental_booking_restriction_unrestricted_at := OLD.rental_booking_restriction_unrestricted_at;
  NEW.rental_booking_restriction_unrestricted_by := OLD.rental_booking_restriction_unrestricted_by;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."protect_users_sensitive_columns"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rental_bookings_prevent_blocking_overlap"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  IF NEW.status NOT IN ('confirmed', 'picked_up') THEN
    RETURN NEW;
  END IF;

  IF NEW.end_date <= NEW.start_date THEN
    RAISE EXCEPTION 'rental booking end_date must be after start_date'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.asset_id IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(
      hashtextextended('rental_booking_asset:' || NEW.asset_id::TEXT, 0)
    );

    IF EXISTS (
      SELECT 1
      FROM public.rental_bookings rb
      WHERE rb.id <> NEW.id
        AND rb.asset_id = NEW.asset_id
        AND rb.status IN ('confirmed', 'picked_up')
        AND rb.start_date < NEW.end_date
        AND rb.end_date > NEW.start_date
      LIMIT 1
    ) THEN
      RAISE EXCEPTION 'RENTAL_BOOKING_CONFLICT'
        USING ERRCODE = '23P01',
              DETAIL = 'Selected rental period is no longer available.';
    END IF;
  ELSIF NEW.sku_id IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(
      hashtextextended('rental_booking_sku:' || NEW.sku_id, 0)
    );

    IF EXISTS (
      SELECT 1
      FROM public.rental_bookings rb
      WHERE rb.id <> NEW.id
        AND rb.asset_id IS NULL
        AND rb.sku_id = NEW.sku_id
        AND rb.status IN ('confirmed', 'picked_up')
        AND rb.start_date < NEW.end_date
        AND rb.end_date > NEW.start_date
      LIMIT 1
    ) THEN
      RAISE EXCEPTION 'RENTAL_BOOKING_CONFLICT'
        USING ERRCODE = '23P01',
              DETAIL = 'Selected rental period is no longer available.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."rental_bookings_prevent_blocking_overlap"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."rental_bookings_prevent_blocking_overlap"() IS 'Atomic double-booking guard for blocking rental statuses. Uses transaction-scoped advisory locks per asset/SKU, then rejects overlapping confirmed/picked_up bookings.';



CREATE OR REPLACE FUNCTION "public"."search_products"("q" "text" DEFAULT ''::"text", "p_categories" "text"[] DEFAULT NULL::"text"[], "p_type" "text" DEFAULT NULL::"text", "p_brands" "text"[] DEFAULT NULL::"text"[], "p_min_price" numeric DEFAULT NULL::numeric, "p_max_price" numeric DEFAULT NULL::numeric, "p_in_stock" boolean DEFAULT false, "p_limit" integer DEFAULT 24, "p_offset" integer DEFAULT 0, "p_dynamic_filters" "jsonb" DEFAULT NULL::"jsonb") RETURNS TABLE("id" "text", "slug" "text", "type" "public"."catalog_product_type", "name_th" "text", "name_en" "text", "name_cn" "text", "name_jp" "text", "description_th" "text", "description_en" "text", "description_cn" "text", "description_jp" "text", "category_keys" "text"[], "brand" "text", "media_gallery" "jsonb", "spec" "jsonb", "min_price" numeric, "max_price" numeric, "total_stock" integer, "total_rental" integer, "trending_score" numeric, "rank" real, "total_count" bigint)
    LANGUAGE "sql" STABLE
    AS $$
  WITH
    query AS (
      SELECT
        nullif(trim(q), '') AS raw,
        CASE
          WHEN nullif(trim(q), '') IS NOT NULL
          THEN plainto_tsquery('simple', q)
        END AS tsq
    ),
    sku_agg AS (
      SELECT
        product_id,
        MIN(NULLIF(price, 0)) AS min_price,
        MAX(price) AS max_price,
        COALESCE(SUM(stock), 0)::INTEGER AS total_stock
      FROM public.product_skus
      GROUP BY product_id
    ),
    base AS (
      SELECT
        p.*,
        COALESCE(pm.trending_score, 0) AS trending_score,
        COALESCE(pm.order_count, 0) AS order_count,
        sk.min_price,
        sk.max_price,
        COALESCE(sk.total_stock, 0) AS total_stock,
        0::INTEGER AS total_rental,
        CASE
          WHEN (SELECT tsq FROM query) IS NOT NULL
          THEN ts_rank(p.search_vector, (SELECT tsq FROM query))
          ELSE 0
        END AS rank_score
      FROM public.products p
      LEFT JOIN public.product_metrics pm ON pm.product_id = p.id
      LEFT JOIN sku_agg sk ON sk.product_id = p.id
      WHERE
        p.is_hidden = FALSE
        AND (
          (SELECT tsq FROM query) IS NULL
          OR p.search_vector @@ (SELECT tsq FROM query)
          OR (coalesce(p.name_th, '') || ' ' || coalesce(p.name_en, '')) ILIKE '%' || (SELECT raw FROM query) || '%'
        )
        AND (p_categories IS NULL OR p.category_keys && p_categories)
        AND (
          p_type IS NULL
          OR (p_type = 'sale'   AND p.type::text IN ('sale',   'hybrid'))
          OR (p_type = 'rental' AND p.type::text IN ('rental', 'hybrid'))
          OR (p_type = 'hybrid' AND p.type::text = 'hybrid')
        )
        AND (p_brands IS NULL OR p.brand = ANY(p_brands))
        AND (p_min_price IS NULL OR sk.min_price >= p_min_price)
        AND (p_max_price IS NULL OR sk.min_price <= p_max_price)
        AND (NOT p_in_stock OR COALESCE(sk.total_stock, 0) > 0)
        AND (
          p_dynamic_filters IS NULL
          OR p_dynamic_filters = '{}'::jsonb
          OR NOT EXISTS (
            SELECT 1
            FROM jsonb_each(p_dynamic_filters) AS sel(group_id, value)
            JOIN public.filter_groups fg
              ON fg.id::text = sel.group_id
             AND fg.is_active = TRUE
            LEFT JOIN LATERAL (
              SELECT array_agg(fg.key || '__' || fo.key) AS expected_keys
              FROM jsonb_array_elements_text(
                CASE
                  WHEN jsonb_typeof(sel.value) = 'array' THEN sel.value
                  ELSE '[]'::jsonb
                END
              ) AS selected(option_id)
              JOIN public.filter_options fo
                ON fo.id::text = selected.option_id
               AND fo.group_id = fg.id
               AND fo.is_active = TRUE
            ) option_match ON TRUE
            LEFT JOIN LATERAL (
              SELECT substring(
                coalesce(p.spec->>fg.spec_key, '')
                from '-?[0-9]+(\.[0-9]+)?'
              )::numeric AS spec_number
            ) spec_match ON fg.filter_type = 'number_range'
            WHERE
              (
                fg.filter_type = 'number_range'
                AND jsonb_typeof(sel.value) = 'object'
                AND (
                  jsonb_typeof(sel.value->'min') = 'number'
                  OR jsonb_typeof(sel.value->'max') = 'number'
                )
                AND NOT (
                  spec_match.spec_number IS NOT NULL
                  AND (
                    jsonb_typeof(sel.value->'min') IS DISTINCT FROM 'number'
                    OR spec_match.spec_number >= (sel.value->>'min')::numeric
                  )
                  AND (
                    jsonb_typeof(sel.value->'max') IS DISTINCT FROM 'number'
                    OR spec_match.spec_number <= (sel.value->>'max')::numeric
                  )
                )
              )
              OR (
                fg.filter_type IN ('checkbox', 'dropdown')
                AND jsonb_typeof(sel.value) = 'array'
                AND jsonb_array_length(sel.value) > 0
                AND NOT (
                  COALESCE(array_length(option_match.expected_keys, 1), 0) > 0
                  AND CASE
                    WHEN fg.match_logic = 'and'
                    THEN p.filter_keys @> option_match.expected_keys
                    ELSE p.filter_keys && option_match.expected_keys
                  END
                )
              )
          )
        )
    )
  SELECT
    b.id, b.slug, b.type,
    b.name_th, b.name_en, b.name_cn, b.name_jp,
    b.description_th, b.description_en, b.description_cn, b.description_jp,
    b.category_keys, b.brand, COALESCE(b.media_gallery, '[]'::JSONB), b.spec,
    b.min_price, b.max_price, b.total_stock, b.total_rental,
    b.trending_score, b.rank_score::REAL AS rank,
    COUNT(*) OVER ()::BIGINT AS total_count
  FROM base b
  ORDER BY
    b.rank_score DESC NULLS LAST,
    b.trending_score DESC NULLS LAST,
    b.order_count DESC NULLS LAST
  LIMIT p_limit
  OFFSET p_offset;
$$;


ALTER FUNCTION "public"."search_products"("q" "text", "p_categories" "text"[], "p_type" "text", "p_brands" "text"[], "p_min_price" numeric, "p_max_price" numeric, "p_in_stock" boolean, "p_limit" integer, "p_offset" integer, "p_dynamic_filters" "jsonb") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."search_products"("q" "text", "p_categories" "text"[], "p_type" "text", "p_brands" "text"[], "p_min_price" numeric, "p_max_price" numeric, "p_in_stock" boolean, "p_limit" integer, "p_offset" integer, "p_dynamic_filters" "jsonb") IS 'Full-text + facet search over public products, including dynamic filter selections from filter_groups/filter_options.';



CREATE OR REPLACE FUNCTION "public"."sku_branch_inventory_after_write_sync_summary"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  PERFORM public.sync_product_sku_inventory_summary(COALESCE(NEW.sku_id, OLD.sku_id));

  IF TG_OP = 'UPDATE' AND OLD.sku_id IS DISTINCT FROM NEW.sku_id THEN
    PERFORM public.sync_product_sku_inventory_summary(OLD.sku_id);
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;


ALTER FUNCTION "public"."sku_branch_inventory_after_write_sync_summary"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sku_branch_inventory_sync_branch_id"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  inv_branch TEXT;
BEGIN
  SELECT branch_id INTO inv_branch
  FROM public.inventories
  WHERE id = NEW.inventory_id;

  IF inv_branch IS NULL THEN
    RAISE EXCEPTION 'inventory_id % does not exist', NEW.inventory_id;
  END IF;

  NEW.branch_id := inv_branch;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."sku_branch_inventory_sync_branch_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sku_branch_inventory_sync_product_id"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  resolved_product_id TEXT;
BEGIN
  SELECT product_id INTO resolved_product_id
  FROM public.product_skus
  WHERE id = NEW.sku_id;

  IF resolved_product_id IS NULL THEN
    RAISE EXCEPTION 'sku_id % does not exist', NEW.sku_id;
  END IF;

  NEW.product_id := resolved_product_id;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."sku_branch_inventory_sync_product_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."store_branches_after_insert_seed_inventories"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  INSERT INTO public.inventories (branch_id, name, is_default, sort_order)
  VALUES (NEW.id, 'Default', TRUE, 0)
  ON CONFLICT (branch_id, name) DO NOTHING;

  INSERT INTO public.inventories (branch_id, name, is_default_rental, sort_order)
  VALUES (NEW.id, 'Rental', TRUE, 10)
  ON CONFLICT (branch_id, name) DO UPDATE
    SET is_default_rental = TRUE
    WHERE inventories.is_default = FALSE;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."store_branches_after_insert_seed_inventories"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_all_product_sku_inventory_summaries"("p_product_id" "text") RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  sku_row RECORD;
BEGIN
  FOR sku_row IN
    SELECT id
    FROM public.product_skus
    WHERE product_id = p_product_id
  LOOP
    PERFORM public.sync_product_sku_inventory_summary(sku_row.id);
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."sync_all_product_sku_inventory_summaries"("p_product_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_catalog_terms_from_asset"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  raw_value TEXT;
BEGIN
  FOREACH raw_value IN ARRAY COALESCE(NEW.tag_keys, ARRAY[]::TEXT[])
  LOOP
    PERFORM public.upsert_catalog_term('tag', raw_value);
  END LOOP;

  FOREACH raw_value IN ARRAY COALESCE(NEW.search_keywords, ARRAY[]::TEXT[])
  LOOP
    PERFORM public.upsert_catalog_term('search_keyword', raw_value);
  END LOOP;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."sync_catalog_terms_from_asset"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."sync_catalog_terms_from_asset"() IS 'Mirrors product tag sync: feeds asset tag_keys into public.catalog_terms.';



CREATE OR REPLACE FUNCTION "public"."sync_catalog_terms_from_product"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  raw_value TEXT;
BEGIN
  FOREACH raw_value IN ARRAY COALESCE(NEW.tag_keys, ARRAY[]::TEXT[])
  LOOP
    PERFORM public.upsert_catalog_term('tag', raw_value);
  END LOOP;

  FOREACH raw_value IN ARRAY COALESCE(NEW.search_keywords, ARRAY[]::TEXT[])
  LOOP
    PERFORM public.upsert_catalog_term('search_keyword', raw_value);
  END LOOP;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."sync_catalog_terms_from_product"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_product_sku_inventory_summary"("p_sku_id" "text") RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  available_total INTEGER := 0;
BEGIN
  SELECT COALESCE(SUM(available), 0)::INTEGER
  INTO available_total
  FROM public.sku_branch_inventory
  WHERE sku_id = p_sku_id;

  UPDATE public.product_skus
  SET stock = available_total,
      updated_at = now()
  WHERE id = p_sku_id;
END;
$$;


ALTER FUNCTION "public"."sync_product_sku_inventory_summary"("p_sku_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."upsert_catalog_term"("term_kind" "text", "raw_value" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  normalized TEXT;
  display TEXT;
BEGIN
  IF term_kind = 'tag' THEN
    normalized := public.normalize_catalog_tag_term(raw_value);
    display := normalized;
  ELSIF term_kind = 'search_keyword' THEN
    normalized := public.normalize_catalog_search_keyword_term(raw_value);
    display := trim(regexp_replace(coalesce(raw_value, ''), '\s+', ' ', 'g'));
  ELSE
    RAISE EXCEPTION 'Unsupported catalog term kind: %', term_kind;
  END IF;

  IF normalized IS NULL OR char_length(normalized) = 0 THEN
    RETURN;
  END IF;

  IF display IS NULL OR char_length(display) = 0 THEN
    RETURN;
  END IF;

  INSERT INTO public.catalog_terms (kind, normalized_value, display_value)
  VALUES (term_kind, normalized, display)
  ON CONFLICT (kind, normalized_value) DO UPDATE
  SET
    is_active = TRUE,
    updated_at = timezone('utc', now()),
    display_value = CASE
      WHEN public.catalog_terms.kind = 'search_keyword'
        AND EXCLUDED.display_value <> ''
      THEN EXCLUDED.display_value
      ELSE public.catalog_terms.display_value
    END;
END;
$$;


ALTER FUNCTION "public"."upsert_catalog_term"("term_kind" "text", "raw_value" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."upsert_catalog_term"("term_kind" "text", "raw_value" "text") IS 'Upserts a normalized tag/search keyword into the central catalog_terms dictionary.';



CREATE OR REPLACE FUNCTION "public"."validate_agreement_acceptance_version_snapshot"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_version public.agreement_versions%ROWTYPE;
BEGIN
  SELECT * INTO v_version
  FROM public.agreement_versions
  WHERE id = NEW.agreement_version_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'agreement version % not found', NEW.agreement_version_id;
  END IF;

  IF v_version.status NOT IN ('published', 'retired') THEN
    RAISE EXCEPTION 'agreement acceptance cannot reference draft agreement version %', NEW.agreement_version_id;
  END IF;

  IF NEW.agreement_type IS DISTINCT FROM v_version.agreement_type
    OR NEW.agreement_version IS DISTINCT FROM v_version.version
    OR NEW.agreement_title IS DISTINCT FROM v_version.title
    OR NEW.content_hash IS DISTINCT FROM v_version.content_hash
    OR NEW.rendered_text_hash IS DISTINCT FROM v_version.rendered_text_hash THEN
    RAISE EXCEPTION 'agreement acceptance snapshot does not match referenced agreement version';
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."validate_agreement_acceptance_version_snapshot"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."validate_agreement_version_state"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_has_overlap BOOLEAN;
BEGIN
  IF NEW.status = 'published' THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.agreement_versions av
      WHERE av.id <> NEW.id
        AND av.agreement_type = NEW.agreement_type
        AND av.status = 'published'
        AND tstzrange(av.effective_from, COALESCE(av.effective_until, 'infinity'::timestamptz), '[)')
          && tstzrange(NEW.effective_from, COALESCE(NEW.effective_until, 'infinity'::timestamptz), '[)')
    ) INTO v_has_overlap;

    IF v_has_overlap THEN
      RAISE EXCEPTION 'published agreement version window overlaps for type %', NEW.agreement_type;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."validate_agreement_version_state"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "storage"."can_insert_object"("bucketid" "text", "name" "text", "owner" "uuid", "metadata" "jsonb") RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  INSERT INTO "storage"."objects" ("bucket_id", "name", "owner", "metadata") VALUES (bucketid, name, owner, metadata);
  -- hack to rollback the successful insert
  RAISE sqlstate 'PT200' using
  message = 'ROLLBACK',
  detail = 'rollback successful insert';
END
$$;


ALTER FUNCTION "storage"."can_insert_object"("bucketid" "text", "name" "text", "owner" "uuid", "metadata" "jsonb") OWNER TO "supabase_storage_admin";


CREATE OR REPLACE FUNCTION "storage"."enforce_bucket_name_length"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
    if length(new.name) > 100 then
        raise exception 'bucket name "%" is too long (% characters). Max is 100.', new.name, length(new.name);
    end if;
    return new;
end;
$$;


ALTER FUNCTION "storage"."enforce_bucket_name_length"() OWNER TO "supabase_storage_admin";


CREATE OR REPLACE FUNCTION "storage"."extension"("name" "text") RETURNS "text"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
_parts text[];
_filename text;
BEGIN
	select string_to_array(name, '/') into _parts;
	select _parts[array_length(_parts,1)] into _filename;
	-- @todo return the last part instead of 2
	return reverse(split_part(reverse(_filename), '.', 1));
END
$$;


ALTER FUNCTION "storage"."extension"("name" "text") OWNER TO "supabase_storage_admin";


CREATE OR REPLACE FUNCTION "storage"."filename"("name" "text") RETURNS "text"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
_parts text[];
BEGIN
	select string_to_array(name, '/') into _parts;
	return _parts[array_length(_parts,1)];
END
$$;


ALTER FUNCTION "storage"."filename"("name" "text") OWNER TO "supabase_storage_admin";


CREATE OR REPLACE FUNCTION "storage"."foldername"("name" "text") RETURNS "text"[]
    LANGUAGE "plpgsql"
    AS $$
DECLARE
_parts text[];
BEGIN
	select string_to_array(name, '/') into _parts;
	return _parts[1:array_length(_parts,1)-1];
END
$$;


ALTER FUNCTION "storage"."foldername"("name" "text") OWNER TO "supabase_storage_admin";


CREATE OR REPLACE FUNCTION "storage"."get_common_prefix"("p_key" "text", "p_prefix" "text", "p_delimiter" "text") RETURNS "text"
    LANGUAGE "sql" IMMUTABLE
    AS $$
SELECT CASE
    WHEN position(p_delimiter IN substring(p_key FROM length(p_prefix) + 1)) > 0
    THEN left(p_key, length(p_prefix) + position(p_delimiter IN substring(p_key FROM length(p_prefix) + 1)))
    ELSE NULL
END;
$$;


ALTER FUNCTION "storage"."get_common_prefix"("p_key" "text", "p_prefix" "text", "p_delimiter" "text") OWNER TO "supabase_storage_admin";


CREATE OR REPLACE FUNCTION "storage"."get_size_by_bucket"() RETURNS TABLE("size" bigint, "bucket_id" "text")
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    return query
        select sum((metadata->>'size')::int) as size, obj.bucket_id
        from "storage".objects as obj
        group by obj.bucket_id;
END
$$;


ALTER FUNCTION "storage"."get_size_by_bucket"() OWNER TO "supabase_storage_admin";


CREATE OR REPLACE FUNCTION "storage"."list_multipart_uploads_with_delimiter"("bucket_id" "text", "prefix_param" "text", "delimiter_param" "text", "max_keys" integer DEFAULT 100, "next_key_token" "text" DEFAULT ''::"text", "next_upload_token" "text" DEFAULT ''::"text") RETURNS TABLE("key" "text", "id" "text", "created_at" timestamp with time zone)
    LANGUAGE "plpgsql"
    AS $_$
BEGIN
    RETURN QUERY EXECUTE
        'SELECT DISTINCT ON(key COLLATE "C") * from (
            SELECT
                CASE
                    WHEN position($2 IN substring(key from length($1) + 1)) > 0 THEN
                        substring(key from 1 for length($1) + position($2 IN substring(key from length($1) + 1)))
                    ELSE
                        key
                END AS key, id, created_at
            FROM
                storage.s3_multipart_uploads
            WHERE
                bucket_id = $5 AND
                key ILIKE $1 || ''%'' AND
                CASE
                    WHEN $4 != '''' AND $6 = '''' THEN
                        CASE
                            WHEN position($2 IN substring(key from length($1) + 1)) > 0 THEN
                                substring(key from 1 for length($1) + position($2 IN substring(key from length($1) + 1))) COLLATE "C" > $4
                            ELSE
                                key COLLATE "C" > $4
                            END
                    ELSE
                        true
                END AND
                CASE
                    WHEN $6 != '''' THEN
                        id COLLATE "C" > $6
                    ELSE
                        true
                    END
            ORDER BY
                key COLLATE "C" ASC, created_at ASC) as e order by key COLLATE "C" LIMIT $3'
        USING prefix_param, delimiter_param, max_keys, next_key_token, bucket_id, next_upload_token;
END;
$_$;


ALTER FUNCTION "storage"."list_multipart_uploads_with_delimiter"("bucket_id" "text", "prefix_param" "text", "delimiter_param" "text", "max_keys" integer, "next_key_token" "text", "next_upload_token" "text") OWNER TO "supabase_storage_admin";


CREATE OR REPLACE FUNCTION "storage"."list_objects_with_delimiter"("_bucket_id" "text", "prefix_param" "text", "delimiter_param" "text", "max_keys" integer DEFAULT 100, "start_after" "text" DEFAULT ''::"text", "next_token" "text" DEFAULT ''::"text", "sort_order" "text" DEFAULT 'asc'::"text") RETURNS TABLE("name" "text", "id" "uuid", "metadata" "jsonb", "updated_at" timestamp with time zone, "created_at" timestamp with time zone, "last_accessed_at" timestamp with time zone)
    LANGUAGE "plpgsql" STABLE
    AS $_$
DECLARE
    v_peek_name TEXT;
    v_current RECORD;
    v_common_prefix TEXT;

    -- Configuration
    v_is_asc BOOLEAN;
    v_prefix TEXT;
    v_start TEXT;
    v_upper_bound TEXT;
    v_file_batch_size INT;

    -- Seek state
    v_next_seek TEXT;
    v_count INT := 0;

    -- Dynamic SQL for batch query only
    v_batch_query TEXT;

BEGIN
    -- ========================================================================
    -- INITIALIZATION
    -- ========================================================================
    v_is_asc := lower(coalesce(sort_order, 'asc')) = 'asc';
    v_prefix := coalesce(prefix_param, '');
    v_start := CASE WHEN coalesce(next_token, '') <> '' THEN next_token ELSE coalesce(start_after, '') END;
    v_file_batch_size := LEAST(GREATEST(max_keys * 2, 100), 1000);

    -- Calculate upper bound for prefix filtering (bytewise, using COLLATE "C")
    IF v_prefix = '' THEN
        v_upper_bound := NULL;
    ELSIF right(v_prefix, 1) = delimiter_param THEN
        v_upper_bound := left(v_prefix, -1) || chr(ascii(delimiter_param) + 1);
    ELSE
        v_upper_bound := left(v_prefix, -1) || chr(ascii(right(v_prefix, 1)) + 1);
    END IF;

    -- Build batch query (dynamic SQL - called infrequently, amortized over many rows)
    IF v_is_asc THEN
        IF v_upper_bound IS NOT NULL THEN
            v_batch_query := 'SELECT o.name, o.id, o.updated_at, o.created_at, o.last_accessed_at, o.metadata ' ||
                'FROM storage.objects o WHERE o.bucket_id = $1 AND o.name COLLATE "C" >= $2 ' ||
                'AND o.name COLLATE "C" < $3 ORDER BY o.name COLLATE "C" ASC LIMIT $4';
        ELSE
            v_batch_query := 'SELECT o.name, o.id, o.updated_at, o.created_at, o.last_accessed_at, o.metadata ' ||
                'FROM storage.objects o WHERE o.bucket_id = $1 AND o.name COLLATE "C" >= $2 ' ||
                'ORDER BY o.name COLLATE "C" ASC LIMIT $4';
        END IF;
    ELSE
        IF v_upper_bound IS NOT NULL THEN
            v_batch_query := 'SELECT o.name, o.id, o.updated_at, o.created_at, o.last_accessed_at, o.metadata ' ||
                'FROM storage.objects o WHERE o.bucket_id = $1 AND o.name COLLATE "C" < $2 ' ||
                'AND o.name COLLATE "C" >= $3 ORDER BY o.name COLLATE "C" DESC LIMIT $4';
        ELSE
            v_batch_query := 'SELECT o.name, o.id, o.updated_at, o.created_at, o.last_accessed_at, o.metadata ' ||
                'FROM storage.objects o WHERE o.bucket_id = $1 AND o.name COLLATE "C" < $2 ' ||
                'ORDER BY o.name COLLATE "C" DESC LIMIT $4';
        END IF;
    END IF;

    -- ========================================================================
    -- SEEK INITIALIZATION: Determine starting position
    -- ========================================================================
    IF v_start = '' THEN
        IF v_is_asc THEN
            v_next_seek := v_prefix;
        ELSE
            -- DESC without cursor: find the last item in range
            IF v_upper_bound IS NOT NULL THEN
                SELECT o.name INTO v_next_seek FROM storage.objects o
                WHERE o.bucket_id = _bucket_id AND o.name COLLATE "C" >= v_prefix AND o.name COLLATE "C" < v_upper_bound
                ORDER BY o.name COLLATE "C" DESC LIMIT 1;
            ELSIF v_prefix <> '' THEN
                SELECT o.name INTO v_next_seek FROM storage.objects o
                WHERE o.bucket_id = _bucket_id AND o.name COLLATE "C" >= v_prefix
                ORDER BY o.name COLLATE "C" DESC LIMIT 1;
            ELSE
                SELECT o.name INTO v_next_seek FROM storage.objects o
                WHERE o.bucket_id = _bucket_id
                ORDER BY o.name COLLATE "C" DESC LIMIT 1;
            END IF;

            IF v_next_seek IS NOT NULL THEN
                v_next_seek := v_next_seek || delimiter_param;
            ELSE
                RETURN;
            END IF;
        END IF;
    ELSE
        -- Cursor provided: determine if it refers to a folder or leaf
        IF EXISTS (
            SELECT 1 FROM storage.objects o
            WHERE o.bucket_id = _bucket_id
              AND o.name COLLATE "C" LIKE v_start || delimiter_param || '%'
            LIMIT 1
        ) THEN
            -- Cursor refers to a folder
            IF v_is_asc THEN
                v_next_seek := v_start || chr(ascii(delimiter_param) + 1);
            ELSE
                v_next_seek := v_start || delimiter_param;
            END IF;
        ELSE
            -- Cursor refers to a leaf object
            IF v_is_asc THEN
                v_next_seek := v_start || delimiter_param;
            ELSE
                v_next_seek := v_start;
            END IF;
        END IF;
    END IF;

    -- ========================================================================
    -- MAIN LOOP: Hybrid peek-then-batch algorithm
    -- Uses STATIC SQL for peek (hot path) and DYNAMIC SQL for batch
    -- ========================================================================
    LOOP
        EXIT WHEN v_count >= max_keys;

        -- STEP 1: PEEK using STATIC SQL (plan cached, very fast)
        IF v_is_asc THEN
            IF v_upper_bound IS NOT NULL THEN
                SELECT o.name INTO v_peek_name FROM storage.objects o
                WHERE o.bucket_id = _bucket_id AND o.name COLLATE "C" >= v_next_seek AND o.name COLLATE "C" < v_upper_bound
                ORDER BY o.name COLLATE "C" ASC LIMIT 1;
            ELSE
                SELECT o.name INTO v_peek_name FROM storage.objects o
                WHERE o.bucket_id = _bucket_id AND o.name COLLATE "C" >= v_next_seek
                ORDER BY o.name COLLATE "C" ASC LIMIT 1;
            END IF;
        ELSE
            IF v_upper_bound IS NOT NULL THEN
                SELECT o.name INTO v_peek_name FROM storage.objects o
                WHERE o.bucket_id = _bucket_id AND o.name COLLATE "C" < v_next_seek AND o.name COLLATE "C" >= v_prefix
                ORDER BY o.name COLLATE "C" DESC LIMIT 1;
            ELSIF v_prefix <> '' THEN
                SELECT o.name INTO v_peek_name FROM storage.objects o
                WHERE o.bucket_id = _bucket_id AND o.name COLLATE "C" < v_next_seek AND o.name COLLATE "C" >= v_prefix
                ORDER BY o.name COLLATE "C" DESC LIMIT 1;
            ELSE
                SELECT o.name INTO v_peek_name FROM storage.objects o
                WHERE o.bucket_id = _bucket_id AND o.name COLLATE "C" < v_next_seek
                ORDER BY o.name COLLATE "C" DESC LIMIT 1;
            END IF;
        END IF;

        EXIT WHEN v_peek_name IS NULL;

        -- STEP 2: Check if this is a FOLDER or FILE
        v_common_prefix := storage.get_common_prefix(v_peek_name, v_prefix, delimiter_param);

        IF v_common_prefix IS NOT NULL THEN
            -- FOLDER: Emit and skip to next folder (no heap access needed)
            name := rtrim(v_common_prefix, delimiter_param);
            id := NULL;
            updated_at := NULL;
            created_at := NULL;
            last_accessed_at := NULL;
            metadata := NULL;
            RETURN NEXT;
            v_count := v_count + 1;

            -- Advance seek past the folder range
            IF v_is_asc THEN
                v_next_seek := left(v_common_prefix, -1) || chr(ascii(delimiter_param) + 1);
            ELSE
                v_next_seek := v_common_prefix;
            END IF;
        ELSE
            -- FILE: Batch fetch using DYNAMIC SQL (overhead amortized over many rows)
            -- For ASC: upper_bound is the exclusive upper limit (< condition)
            -- For DESC: prefix is the inclusive lower limit (>= condition)
            FOR v_current IN EXECUTE v_batch_query USING _bucket_id, v_next_seek,
                CASE WHEN v_is_asc THEN COALESCE(v_upper_bound, v_prefix) ELSE v_prefix END, v_file_batch_size
            LOOP
                v_common_prefix := storage.get_common_prefix(v_current.name, v_prefix, delimiter_param);

                IF v_common_prefix IS NOT NULL THEN
                    -- Hit a folder: exit batch, let peek handle it
                    v_next_seek := v_current.name;
                    EXIT;
                END IF;

                -- Emit file
                name := v_current.name;
                id := v_current.id;
                updated_at := v_current.updated_at;
                created_at := v_current.created_at;
                last_accessed_at := v_current.last_accessed_at;
                metadata := v_current.metadata;
                RETURN NEXT;
                v_count := v_count + 1;

                -- Advance seek past this file
                IF v_is_asc THEN
                    v_next_seek := v_current.name || delimiter_param;
                ELSE
                    v_next_seek := v_current.name;
                END IF;

                EXIT WHEN v_count >= max_keys;
            END LOOP;
        END IF;
    END LOOP;
END;
$_$;


ALTER FUNCTION "storage"."list_objects_with_delimiter"("_bucket_id" "text", "prefix_param" "text", "delimiter_param" "text", "max_keys" integer, "start_after" "text", "next_token" "text", "sort_order" "text") OWNER TO "supabase_storage_admin";


CREATE OR REPLACE FUNCTION "storage"."operation"() RETURNS "text"
    LANGUAGE "plpgsql" STABLE
    AS $$
BEGIN
    RETURN current_setting('storage.operation', true);
END;
$$;


ALTER FUNCTION "storage"."operation"() OWNER TO "supabase_storage_admin";


CREATE OR REPLACE FUNCTION "storage"."protect_delete"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    -- Check if storage.allow_delete_query is set to 'true'
    IF COALESCE(current_setting('storage.allow_delete_query', true), 'false') != 'true' THEN
        RAISE EXCEPTION 'Direct deletion from storage tables is not allowed. Use the Storage API instead.'
            USING HINT = 'This prevents accidental data loss from orphaned objects.',
                  ERRCODE = '42501';
    END IF;
    RETURN NULL;
END;
$$;


ALTER FUNCTION "storage"."protect_delete"() OWNER TO "supabase_storage_admin";


CREATE OR REPLACE FUNCTION "storage"."search"("prefix" "text", "bucketname" "text", "limits" integer DEFAULT 100, "levels" integer DEFAULT 1, "offsets" integer DEFAULT 0, "search" "text" DEFAULT ''::"text", "sortcolumn" "text" DEFAULT 'name'::"text", "sortorder" "text" DEFAULT 'asc'::"text") RETURNS TABLE("name" "text", "id" "uuid", "updated_at" timestamp with time zone, "created_at" timestamp with time zone, "last_accessed_at" timestamp with time zone, "metadata" "jsonb")
    LANGUAGE "plpgsql" STABLE
    AS $_$
DECLARE
    v_peek_name TEXT;
    v_current RECORD;
    v_common_prefix TEXT;
    v_delimiter CONSTANT TEXT := '/';

    -- Configuration
    v_limit INT;
    v_prefix TEXT;
    v_prefix_lower TEXT;
    v_is_asc BOOLEAN;
    v_order_by TEXT;
    v_sort_order TEXT;
    v_upper_bound TEXT;
    v_file_batch_size INT;

    -- Dynamic SQL for batch query only
    v_batch_query TEXT;

    -- Seek state
    v_next_seek TEXT;
    v_count INT := 0;
    v_skipped INT := 0;
BEGIN
    -- ========================================================================
    -- INITIALIZATION
    -- ========================================================================
    v_limit := LEAST(coalesce(limits, 100), 1500);
    v_prefix := coalesce(prefix, '') || coalesce(search, '');
    v_prefix_lower := lower(v_prefix);
    v_is_asc := lower(coalesce(sortorder, 'asc')) = 'asc';
    v_file_batch_size := LEAST(GREATEST(v_limit * 2, 100), 1000);

    -- Validate sort column
    CASE lower(coalesce(sortcolumn, 'name'))
        WHEN 'name' THEN v_order_by := 'name';
        WHEN 'updated_at' THEN v_order_by := 'updated_at';
        WHEN 'created_at' THEN v_order_by := 'created_at';
        WHEN 'last_accessed_at' THEN v_order_by := 'last_accessed_at';
        ELSE v_order_by := 'name';
    END CASE;

    v_sort_order := CASE WHEN v_is_asc THEN 'asc' ELSE 'desc' END;

    -- ========================================================================
    -- NON-NAME SORTING: Use path_tokens approach (unchanged)
    -- ========================================================================
    IF v_order_by != 'name' THEN
        RETURN QUERY EXECUTE format(
            $sql$
            WITH folders AS (
                SELECT path_tokens[$1] AS folder
                FROM storage.objects
                WHERE objects.name ILIKE $2 || '%%'
                  AND bucket_id = $3
                  AND array_length(objects.path_tokens, 1) <> $1
                GROUP BY folder
                ORDER BY folder %s
            )
            (SELECT folder AS "name",
                   NULL::uuid AS id,
                   NULL::timestamptz AS updated_at,
                   NULL::timestamptz AS created_at,
                   NULL::timestamptz AS last_accessed_at,
                   NULL::jsonb AS metadata FROM folders)
            UNION ALL
            (SELECT path_tokens[$1] AS "name",
                   id, updated_at, created_at, last_accessed_at, metadata
             FROM storage.objects
             WHERE objects.name ILIKE $2 || '%%'
               AND bucket_id = $3
               AND array_length(objects.path_tokens, 1) = $1
             ORDER BY %I %s)
            LIMIT $4 OFFSET $5
            $sql$, v_sort_order, v_order_by, v_sort_order
        ) USING levels, v_prefix, bucketname, v_limit, offsets;
        RETURN;
    END IF;

    -- ========================================================================
    -- NAME SORTING: Hybrid skip-scan with batch optimization
    -- ========================================================================

    -- Calculate upper bound for prefix filtering
    IF v_prefix_lower = '' THEN
        v_upper_bound := NULL;
    ELSIF right(v_prefix_lower, 1) = v_delimiter THEN
        v_upper_bound := left(v_prefix_lower, -1) || chr(ascii(v_delimiter) + 1);
    ELSE
        v_upper_bound := left(v_prefix_lower, -1) || chr(ascii(right(v_prefix_lower, 1)) + 1);
    END IF;

    -- Build batch query (dynamic SQL - called infrequently, amortized over many rows)
    IF v_is_asc THEN
        IF v_upper_bound IS NOT NULL THEN
            v_batch_query := 'SELECT o.name, o.id, o.updated_at, o.created_at, o.last_accessed_at, o.metadata ' ||
                'FROM storage.objects o WHERE o.bucket_id = $1 AND lower(o.name) COLLATE "C" >= $2 ' ||
                'AND lower(o.name) COLLATE "C" < $3 ORDER BY lower(o.name) COLLATE "C" ASC LIMIT $4';
        ELSE
            v_batch_query := 'SELECT o.name, o.id, o.updated_at, o.created_at, o.last_accessed_at, o.metadata ' ||
                'FROM storage.objects o WHERE o.bucket_id = $1 AND lower(o.name) COLLATE "C" >= $2 ' ||
                'ORDER BY lower(o.name) COLLATE "C" ASC LIMIT $4';
        END IF;
    ELSE
        IF v_upper_bound IS NOT NULL THEN
            v_batch_query := 'SELECT o.name, o.id, o.updated_at, o.created_at, o.last_accessed_at, o.metadata ' ||
                'FROM storage.objects o WHERE o.bucket_id = $1 AND lower(o.name) COLLATE "C" < $2 ' ||
                'AND lower(o.name) COLLATE "C" >= $3 ORDER BY lower(o.name) COLLATE "C" DESC LIMIT $4';
        ELSE
            v_batch_query := 'SELECT o.name, o.id, o.updated_at, o.created_at, o.last_accessed_at, o.metadata ' ||
                'FROM storage.objects o WHERE o.bucket_id = $1 AND lower(o.name) COLLATE "C" < $2 ' ||
                'ORDER BY lower(o.name) COLLATE "C" DESC LIMIT $4';
        END IF;
    END IF;

    -- Initialize seek position
    IF v_is_asc THEN
        v_next_seek := v_prefix_lower;
    ELSE
        -- DESC: find the last item in range first (static SQL)
        IF v_upper_bound IS NOT NULL THEN
            SELECT o.name INTO v_peek_name FROM storage.objects o
            WHERE o.bucket_id = bucketname AND lower(o.name) COLLATE "C" >= v_prefix_lower AND lower(o.name) COLLATE "C" < v_upper_bound
            ORDER BY lower(o.name) COLLATE "C" DESC LIMIT 1;
        ELSIF v_prefix_lower <> '' THEN
            SELECT o.name INTO v_peek_name FROM storage.objects o
            WHERE o.bucket_id = bucketname AND lower(o.name) COLLATE "C" >= v_prefix_lower
            ORDER BY lower(o.name) COLLATE "C" DESC LIMIT 1;
        ELSE
            SELECT o.name INTO v_peek_name FROM storage.objects o
            WHERE o.bucket_id = bucketname
            ORDER BY lower(o.name) COLLATE "C" DESC LIMIT 1;
        END IF;

        IF v_peek_name IS NOT NULL THEN
            v_next_seek := lower(v_peek_name) || v_delimiter;
        ELSE
            RETURN;
        END IF;
    END IF;

    -- ========================================================================
    -- MAIN LOOP: Hybrid peek-then-batch algorithm
    -- Uses STATIC SQL for peek (hot path) and DYNAMIC SQL for batch
    -- ========================================================================
    LOOP
        EXIT WHEN v_count >= v_limit;

        -- STEP 1: PEEK using STATIC SQL (plan cached, very fast)
        IF v_is_asc THEN
            IF v_upper_bound IS NOT NULL THEN
                SELECT o.name INTO v_peek_name FROM storage.objects o
                WHERE o.bucket_id = bucketname AND lower(o.name) COLLATE "C" >= v_next_seek AND lower(o.name) COLLATE "C" < v_upper_bound
                ORDER BY lower(o.name) COLLATE "C" ASC LIMIT 1;
            ELSE
                SELECT o.name INTO v_peek_name FROM storage.objects o
                WHERE o.bucket_id = bucketname AND lower(o.name) COLLATE "C" >= v_next_seek
                ORDER BY lower(o.name) COLLATE "C" ASC LIMIT 1;
            END IF;
        ELSE
            IF v_upper_bound IS NOT NULL THEN
                SELECT o.name INTO v_peek_name FROM storage.objects o
                WHERE o.bucket_id = bucketname AND lower(o.name) COLLATE "C" < v_next_seek AND lower(o.name) COLLATE "C" >= v_prefix_lower
                ORDER BY lower(o.name) COLLATE "C" DESC LIMIT 1;
            ELSIF v_prefix_lower <> '' THEN
                SELECT o.name INTO v_peek_name FROM storage.objects o
                WHERE o.bucket_id = bucketname AND lower(o.name) COLLATE "C" < v_next_seek AND lower(o.name) COLLATE "C" >= v_prefix_lower
                ORDER BY lower(o.name) COLLATE "C" DESC LIMIT 1;
            ELSE
                SELECT o.name INTO v_peek_name FROM storage.objects o
                WHERE o.bucket_id = bucketname AND lower(o.name) COLLATE "C" < v_next_seek
                ORDER BY lower(o.name) COLLATE "C" DESC LIMIT 1;
            END IF;
        END IF;

        EXIT WHEN v_peek_name IS NULL;

        -- STEP 2: Check if this is a FOLDER or FILE
        v_common_prefix := storage.get_common_prefix(lower(v_peek_name), v_prefix_lower, v_delimiter);

        IF v_common_prefix IS NOT NULL THEN
            -- FOLDER: Handle offset, emit if needed, skip to next folder
            IF v_skipped < offsets THEN
                v_skipped := v_skipped + 1;
            ELSE
                name := split_part(rtrim(storage.get_common_prefix(v_peek_name, v_prefix, v_delimiter), v_delimiter), v_delimiter, levels);
                id := NULL;
                updated_at := NULL;
                created_at := NULL;
                last_accessed_at := NULL;
                metadata := NULL;
                RETURN NEXT;
                v_count := v_count + 1;
            END IF;

            -- Advance seek past the folder range
            IF v_is_asc THEN
                v_next_seek := lower(left(v_common_prefix, -1)) || chr(ascii(v_delimiter) + 1);
            ELSE
                v_next_seek := lower(v_common_prefix);
            END IF;
        ELSE
            -- FILE: Batch fetch using DYNAMIC SQL (overhead amortized over many rows)
            -- For ASC: upper_bound is the exclusive upper limit (< condition)
            -- For DESC: prefix_lower is the inclusive lower limit (>= condition)
            FOR v_current IN EXECUTE v_batch_query
                USING bucketname, v_next_seek,
                    CASE WHEN v_is_asc THEN COALESCE(v_upper_bound, v_prefix_lower) ELSE v_prefix_lower END, v_file_batch_size
            LOOP
                v_common_prefix := storage.get_common_prefix(lower(v_current.name), v_prefix_lower, v_delimiter);

                IF v_common_prefix IS NOT NULL THEN
                    -- Hit a folder: exit batch, let peek handle it
                    v_next_seek := lower(v_current.name);
                    EXIT;
                END IF;

                -- Handle offset skipping
                IF v_skipped < offsets THEN
                    v_skipped := v_skipped + 1;
                ELSE
                    -- Emit file
                    name := split_part(v_current.name, v_delimiter, levels);
                    id := v_current.id;
                    updated_at := v_current.updated_at;
                    created_at := v_current.created_at;
                    last_accessed_at := v_current.last_accessed_at;
                    metadata := v_current.metadata;
                    RETURN NEXT;
                    v_count := v_count + 1;
                END IF;

                -- Advance seek past this file
                IF v_is_asc THEN
                    v_next_seek := lower(v_current.name) || v_delimiter;
                ELSE
                    v_next_seek := lower(v_current.name);
                END IF;

                EXIT WHEN v_count >= v_limit;
            END LOOP;
        END IF;
    END LOOP;
END;
$_$;


ALTER FUNCTION "storage"."search"("prefix" "text", "bucketname" "text", "limits" integer, "levels" integer, "offsets" integer, "search" "text", "sortcolumn" "text", "sortorder" "text") OWNER TO "supabase_storage_admin";


CREATE OR REPLACE FUNCTION "storage"."search_by_timestamp"("p_prefix" "text", "p_bucket_id" "text", "p_limit" integer, "p_level" integer, "p_start_after" "text", "p_sort_order" "text", "p_sort_column" "text", "p_sort_column_after" "text") RETURNS TABLE("key" "text", "name" "text", "id" "uuid", "updated_at" timestamp with time zone, "created_at" timestamp with time zone, "last_accessed_at" timestamp with time zone, "metadata" "jsonb")
    LANGUAGE "plpgsql" STABLE
    AS $_$
DECLARE
    v_cursor_op text;
    v_query text;
    v_prefix text;
BEGIN
    v_prefix := coalesce(p_prefix, '');

    IF p_sort_order = 'asc' THEN
        v_cursor_op := '>';
    ELSE
        v_cursor_op := '<';
    END IF;

    v_query := format($sql$
        WITH raw_objects AS (
            SELECT
                o.name AS obj_name,
                o.id AS obj_id,
                o.updated_at AS obj_updated_at,
                o.created_at AS obj_created_at,
                o.last_accessed_at AS obj_last_accessed_at,
                o.metadata AS obj_metadata,
                storage.get_common_prefix(o.name, $1, '/') AS common_prefix
            FROM storage.objects o
            WHERE o.bucket_id = $2
              AND o.name COLLATE "C" LIKE $1 || '%%'
        ),
        -- Aggregate common prefixes (folders)
        -- Both created_at and updated_at use MIN(obj_created_at) to match the old prefixes table behavior
        aggregated_prefixes AS (
            SELECT
                rtrim(common_prefix, '/') AS name,
                NULL::uuid AS id,
                MIN(obj_created_at) AS updated_at,
                MIN(obj_created_at) AS created_at,
                NULL::timestamptz AS last_accessed_at,
                NULL::jsonb AS metadata,
                TRUE AS is_prefix
            FROM raw_objects
            WHERE common_prefix IS NOT NULL
            GROUP BY common_prefix
        ),
        leaf_objects AS (
            SELECT
                obj_name AS name,
                obj_id AS id,
                obj_updated_at AS updated_at,
                obj_created_at AS created_at,
                obj_last_accessed_at AS last_accessed_at,
                obj_metadata AS metadata,
                FALSE AS is_prefix
            FROM raw_objects
            WHERE common_prefix IS NULL
        ),
        combined AS (
            SELECT * FROM aggregated_prefixes
            UNION ALL
            SELECT * FROM leaf_objects
        ),
        filtered AS (
            SELECT *
            FROM combined
            WHERE (
                $5 = ''
                OR ROW(
                    date_trunc('milliseconds', %I),
                    name COLLATE "C"
                ) %s ROW(
                    COALESCE(NULLIF($6, '')::timestamptz, 'epoch'::timestamptz),
                    $5
                )
            )
        )
        SELECT
            split_part(name, '/', $3) AS key,
            name,
            id,
            updated_at,
            created_at,
            last_accessed_at,
            metadata
        FROM filtered
        ORDER BY
            COALESCE(date_trunc('milliseconds', %I), 'epoch'::timestamptz) %s,
            name COLLATE "C" %s
        LIMIT $4
    $sql$,
        p_sort_column,
        v_cursor_op,
        p_sort_column,
        p_sort_order,
        p_sort_order
    );

    RETURN QUERY EXECUTE v_query
    USING v_prefix, p_bucket_id, p_level, p_limit, p_start_after, p_sort_column_after;
END;
$_$;


ALTER FUNCTION "storage"."search_by_timestamp"("p_prefix" "text", "p_bucket_id" "text", "p_limit" integer, "p_level" integer, "p_start_after" "text", "p_sort_order" "text", "p_sort_column" "text", "p_sort_column_after" "text") OWNER TO "supabase_storage_admin";


CREATE OR REPLACE FUNCTION "storage"."search_v2"("prefix" "text", "bucket_name" "text", "limits" integer DEFAULT 100, "levels" integer DEFAULT 1, "start_after" "text" DEFAULT ''::"text", "sort_order" "text" DEFAULT 'asc'::"text", "sort_column" "text" DEFAULT 'name'::"text", "sort_column_after" "text" DEFAULT ''::"text") RETURNS TABLE("key" "text", "name" "text", "id" "uuid", "updated_at" timestamp with time zone, "created_at" timestamp with time zone, "last_accessed_at" timestamp with time zone, "metadata" "jsonb")
    LANGUAGE "plpgsql" STABLE
    AS $$
DECLARE
    v_sort_col text;
    v_sort_ord text;
    v_limit int;
BEGIN
    -- Cap limit to maximum of 1500 records
    v_limit := LEAST(coalesce(limits, 100), 1500);

    -- Validate and normalize sort_order
    v_sort_ord := lower(coalesce(sort_order, 'asc'));
    IF v_sort_ord NOT IN ('asc', 'desc') THEN
        v_sort_ord := 'asc';
    END IF;

    -- Validate and normalize sort_column
    v_sort_col := lower(coalesce(sort_column, 'name'));
    IF v_sort_col NOT IN ('name', 'updated_at', 'created_at') THEN
        v_sort_col := 'name';
    END IF;

    -- Route to appropriate implementation
    IF v_sort_col = 'name' THEN
        -- Use list_objects_with_delimiter for name sorting (most efficient: O(k * log n))
        RETURN QUERY
        SELECT
            split_part(l.name, '/', levels) AS key,
            l.name AS name,
            l.id,
            l.updated_at,
            l.created_at,
            l.last_accessed_at,
            l.metadata
        FROM storage.list_objects_with_delimiter(
            bucket_name,
            coalesce(prefix, ''),
            '/',
            v_limit,
            start_after,
            '',
            v_sort_ord
        ) l;
    ELSE
        -- Use aggregation approach for timestamp sorting
        -- Not efficient for large datasets but supports correct pagination
        RETURN QUERY SELECT * FROM storage.search_by_timestamp(
            prefix, bucket_name, v_limit, levels, start_after,
            v_sort_ord, v_sort_col, sort_column_after
        );
    END IF;
END;
$$;


ALTER FUNCTION "storage"."search_v2"("prefix" "text", "bucket_name" "text", "limits" integer, "levels" integer, "start_after" "text", "sort_order" "text", "sort_column" "text", "sort_column_after" "text") OWNER TO "supabase_storage_admin";


CREATE OR REPLACE FUNCTION "storage"."update_updated_at_column"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;


ALTER FUNCTION "storage"."update_updated_at_column"() OWNER TO "supabase_storage_admin";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."addresses" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "company_id" "uuid",
    "title" "text" NOT NULL,
    "contact_name" "text",
    "contact_phone" "text",
    "is_default" boolean DEFAULT false NOT NULL,
    "full_address" "text" NOT NULL,
    "sub_district" "text",
    "district" "text",
    "province" "text",
    "postal_code" "text",
    "latitude" numeric(10,8),
    "longitude" numeric(11,8),
    "note" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "address_has_owner" CHECK ((("user_id" IS NOT NULL) OR ("company_id" IS NOT NULL)))
);


ALTER TABLE "public"."addresses" OWNER TO "postgres";


COMMENT ON TABLE "public"."addresses" IS 'Delivery addresses — polymorphic owner (user OR company)';



COMMENT ON COLUMN "public"."addresses"."title" IS 'Label: สำนักงานใหญ่, หน้างานระยอง, บ้านพัก';



CREATE TABLE IF NOT EXISTS "public"."admin_user_branch_access" (
    "user_id" "uuid" NOT NULL,
    "branch_id" "text" NOT NULL,
    "can_pos" boolean DEFAULT true NOT NULL,
    "created_by_user_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."admin_user_branch_access" OWNER TO "postgres";


COMMENT ON TABLE "public"."admin_user_branch_access" IS 'Super Admin managed branch access for staff POS sessions.';



CREATE TABLE IF NOT EXISTS "public"."agreement_acceptance_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "agreement_version_id" "uuid" NOT NULL,
    "agreement_type" "text" NOT NULL,
    "agreement_version" "text" NOT NULL,
    "agreement_title" "text" NOT NULL,
    "content_hash" "text" NOT NULL,
    "rendered_text_hash" "text" NOT NULL,
    "customer_user_id" "uuid",
    "walk_in_phone" "text",
    "company_id" "uuid",
    "booking_id" "uuid",
    "order_id" "uuid",
    "official_document_id" "uuid",
    "source_type" "text" NOT NULL,
    "source_id" "text",
    "accepted_channel" "text" NOT NULL,
    "consent_action" "text" NOT NULL,
    "customer_confirmation_method" "text" DEFAULT 'web_checkbox'::"text" NOT NULL,
    "staff_remark" "text" DEFAULT ''::"text" NOT NULL,
    "accepted_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "ip_address" "inet",
    "user_agent" "text",
    "staff_user_id" "uuid",
    "evidence_snapshot" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "status" "text" DEFAULT 'accepted'::"text" NOT NULL,
    "status_reason" "text" DEFAULT ''::"text" NOT NULL,
    "status_changed_at" timestamp with time zone,
    "status_changed_by" "uuid",
    "correction_of_acceptance_id" "uuid",
    "request_id" "text",
    "session_id" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "agreement_acceptance_logs_accepted_channel_check" CHECK (("accepted_channel" = ANY (ARRAY['web'::"text", 'admin_pos'::"text", 'staff_assisted'::"text", 'line'::"text", 'email'::"text", 'paper'::"text", 'phone'::"text", 'imported'::"text"]))),
    CONSTRAINT "agreement_acceptance_logs_agreement_title_check" CHECK (("char_length"(TRIM(BOTH FROM "agreement_title")) > 0)),
    CONSTRAINT "agreement_acceptance_logs_agreement_type_check" CHECK (("agreement_type" = ANY (ARRAY['terms_of_service'::"text", 'privacy_policy'::"text", 'rental_agreement'::"text", 'damage_loss_policy'::"text", 'damage_protection_terms'::"text", 'kyc_consent'::"text"]))),
    CONSTRAINT "agreement_acceptance_logs_agreement_version_check" CHECK (("char_length"(TRIM(BOTH FROM "agreement_version")) > 0)),
    CONSTRAINT "agreement_acceptance_logs_check" CHECK ((("customer_user_id" IS NOT NULL) OR ("walk_in_phone" IS NOT NULL) OR ("company_id" IS NOT NULL))),
    CONSTRAINT "agreement_acceptance_logs_check1" CHECK ((("accepted_channel" <> 'web'::"text") OR (("ip_address" IS NOT NULL) AND ("char_length"(TRIM(BOTH FROM COALESCE("user_agent", ''::"text"))) > 0)))),
    CONSTRAINT "agreement_acceptance_logs_check2" CHECK ((("accepted_channel" <> ALL (ARRAY['admin_pos'::"text", 'staff_assisted'::"text"])) OR (("staff_user_id" IS NOT NULL) AND ("char_length"(TRIM(BOTH FROM "staff_remark")) > 0) AND ("customer_confirmation_method" = ANY (ARRAY['walk_in_verbal'::"text", 'signed_paper'::"text", 'line'::"text", 'email'::"text", 'phone'::"text", 'staff_attestation'::"text", 'other'::"text"]))))),
    CONSTRAINT "agreement_acceptance_logs_check3" CHECK ((("status" = 'accepted'::"text") OR (("status_changed_at" IS NOT NULL) AND ("status_changed_by" IS NOT NULL) AND ("char_length"(TRIM(BOTH FROM "status_reason")) > 0)))),
    CONSTRAINT "agreement_acceptance_logs_consent_action_check" CHECK (("consent_action" = ANY (ARRAY['checkbox'::"text", 'button_click'::"text", 'signature'::"text", 'staff_attestation'::"text", 'imported'::"text"]))),
    CONSTRAINT "agreement_acceptance_logs_content_hash_check" CHECK (("char_length"(TRIM(BOTH FROM "content_hash")) > 0)),
    CONSTRAINT "agreement_acceptance_logs_customer_confirmation_method_check" CHECK (("customer_confirmation_method" = ANY (ARRAY['web_checkbox'::"text", 'walk_in_verbal'::"text", 'signed_paper'::"text", 'line'::"text", 'email'::"text", 'phone'::"text", 'staff_attestation'::"text", 'imported'::"text", 'other'::"text"]))),
    CONSTRAINT "agreement_acceptance_logs_evidence_snapshot_check" CHECK (("jsonb_typeof"("evidence_snapshot") = 'object'::"text")),
    CONSTRAINT "agreement_acceptance_logs_metadata_check" CHECK (("jsonb_typeof"("metadata") = 'object'::"text")),
    CONSTRAINT "agreement_acceptance_logs_rendered_text_hash_check" CHECK (("char_length"(TRIM(BOTH FROM "rendered_text_hash")) > 0)),
    CONSTRAINT "agreement_acceptance_logs_source_type_check" CHECK (("char_length"(TRIM(BOTH FROM "source_type")) > 0)),
    CONSTRAINT "agreement_acceptance_logs_status_check" CHECK (("status" = ANY (ARRAY['accepted'::"text", 'revoked'::"text", 'cancelled'::"text", 'corrected'::"text"])))
);


ALTER TABLE "public"."agreement_acceptance_logs" OWNER TO "postgres";


COMMENT ON TABLE "public"."agreement_acceptance_logs" IS 'Non-deletable proof that a customer or walk-in customer accepted a specific legal agreement version in a specific context.';



CREATE TABLE IF NOT EXISTS "public"."agreement_evidence_files" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "acceptance_id" "uuid" NOT NULL,
    "file_type" "text" NOT NULL,
    "storage_bucket" "text" NOT NULL,
    "storage_path" "text" NOT NULL,
    "file_hash" "text" DEFAULT ''::"text" NOT NULL,
    "uploaded_by" "uuid",
    "uploaded_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    CONSTRAINT "agreement_evidence_files_file_type_check" CHECK (("file_type" = ANY (ARRAY['signed_form'::"text", 'line_screenshot'::"text", 'email_pdf'::"text", 'signature_image'::"text", 'other'::"text"]))),
    CONSTRAINT "agreement_evidence_files_metadata_check" CHECK (("jsonb_typeof"("metadata") = 'object'::"text")),
    CONSTRAINT "agreement_evidence_files_storage_bucket_check" CHECK (("char_length"(TRIM(BOTH FROM "storage_bucket")) > 0)),
    CONSTRAINT "agreement_evidence_files_storage_path_check" CHECK (("char_length"(TRIM(BOTH FROM "storage_path")) > 0))
);


ALTER TABLE "public"."agreement_evidence_files" OWNER TO "postgres";


COMMENT ON TABLE "public"."agreement_evidence_files" IS 'Private evidence files attached to agreement acceptance logs for Admin/POS and staff-assisted consent.';



CREATE TABLE IF NOT EXISTS "public"."agreement_versions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "agreement_type" "text" NOT NULL,
    "version" "text" NOT NULL,
    "title" "text" NOT NULL,
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "content_format" "text" DEFAULT 'markdown'::"text" NOT NULL,
    "content_body" "text" NOT NULL,
    "content_hash" "text" DEFAULT ''::"text" NOT NULL,
    "rendered_text_hash" "text" DEFAULT ''::"text" NOT NULL,
    "effective_from" timestamp with time zone,
    "effective_until" timestamp with time zone,
    "published_at" timestamp with time zone,
    "published_by" "uuid",
    "retired_at" timestamp with time zone,
    "retired_by" "uuid",
    "replaces_version_id" "uuid",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_by" "uuid",
    "updated_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "agreement_versions_agreement_type_check" CHECK (("agreement_type" = ANY (ARRAY['terms_of_service'::"text", 'privacy_policy'::"text", 'rental_agreement'::"text", 'damage_loss_policy'::"text", 'damage_protection_terms'::"text", 'kyc_consent'::"text"]))),
    CONSTRAINT "agreement_versions_check" CHECK ((("effective_until" IS NULL) OR ("effective_from" IS NULL) OR ("effective_until" > "effective_from"))),
    CONSTRAINT "agreement_versions_check1" CHECK ((("status" = 'draft'::"text") OR (("effective_from" IS NOT NULL) AND ("published_at" IS NOT NULL) AND ("published_by" IS NOT NULL) AND ("char_length"(TRIM(BOTH FROM "content_hash")) > 0) AND ("char_length"(TRIM(BOTH FROM "rendered_text_hash")) > 0)))),
    CONSTRAINT "agreement_versions_check2" CHECK ((("status" <> 'retired'::"text") OR (("effective_until" IS NOT NULL) AND ("retired_at" IS NOT NULL) AND ("retired_by" IS NOT NULL)))),
    CONSTRAINT "agreement_versions_content_body_check" CHECK (("char_length"(TRIM(BOTH FROM "content_body")) > 0)),
    CONSTRAINT "agreement_versions_content_format_check" CHECK (("content_format" = ANY (ARRAY['markdown'::"text", 'html'::"text"]))),
    CONSTRAINT "agreement_versions_metadata_check" CHECK (("jsonb_typeof"("metadata") = 'object'::"text")),
    CONSTRAINT "agreement_versions_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'published'::"text", 'retired'::"text"]))),
    CONSTRAINT "agreement_versions_title_check" CHECK (("char_length"(TRIM(BOTH FROM "title")) > 0)),
    CONSTRAINT "agreement_versions_version_check" CHECK (("char_length"(TRIM(BOTH FROM "version")) > 0))
);


ALTER TABLE "public"."agreement_versions" OWNER TO "postgres";


COMMENT ON TABLE "public"."agreement_versions" IS 'Versioned legal agreements. Published/retired content is immutable; create a new version for wording changes.';



CREATE TABLE IF NOT EXISTS "public"."asset_branch_inventory" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "asset_id" "uuid" NOT NULL,
    "inventory_id" "uuid" NOT NULL,
    "branch_id" "text" NOT NULL,
    "branch_code" "text",
    "branch_name" "text" NOT NULL,
    "on_hand" integer DEFAULT 0 NOT NULL,
    "available" integer DEFAULT 0 NOT NULL,
    "reserved" integer DEFAULT 0 NOT NULL,
    "incoming" integer DEFAULT 0 NOT NULL,
    "safety_stock" integer DEFAULT 0 NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "asset_branch_inventory_available_check" CHECK (("available" >= 0)),
    CONSTRAINT "asset_branch_inventory_branch_id_check" CHECK (("char_length"(TRIM(BOTH FROM "branch_id")) > 0)),
    CONSTRAINT "asset_branch_inventory_branch_name_check" CHECK (("char_length"(TRIM(BOTH FROM "branch_name")) > 0)),
    CONSTRAINT "asset_branch_inventory_check" CHECK (("available" <= "on_hand")),
    CONSTRAINT "asset_branch_inventory_check1" CHECK (("reserved" <= "on_hand")),
    CONSTRAINT "asset_branch_inventory_check2" CHECK ((("available" + "reserved") <= "on_hand")),
    CONSTRAINT "asset_branch_inventory_incoming_check" CHECK (("incoming" >= 0)),
    CONSTRAINT "asset_branch_inventory_on_hand_check" CHECK (("on_hand" >= 0)),
    CONSTRAINT "asset_branch_inventory_reserved_check" CHECK (("reserved" >= 0)),
    CONSTRAINT "asset_branch_inventory_safety_stock_check" CHECK (("safety_stock" >= 0))
);


ALTER TABLE "public"."asset_branch_inventory" OWNER TO "postgres";


COMMENT ON TABLE "public"."asset_branch_inventory" IS 'Per-inventory rental stock owned by an asset. Not connected to SKUs.';



COMMENT ON COLUMN "public"."asset_branch_inventory"."branch_id" IS 'Denormalised branch id, kept in sync from inventories.branch_id.';



COMMENT ON COLUMN "public"."asset_branch_inventory"."branch_code" IS 'Optional short display code snapshot of the branch.';



COMMENT ON COLUMN "public"."asset_branch_inventory"."branch_name" IS 'Display name snapshot of the branch at the time the row was edited.';



CREATE TABLE IF NOT EXISTS "public"."asset_checklist_template_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "template_id" "uuid" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "label" "text" NOT NULL,
    "instruction" "text",
    "response_type" "public"."rental_checklist_item_response_type" DEFAULT 'check'::"public"."rental_checklist_item_response_type" NOT NULL,
    "is_required" boolean DEFAULT true NOT NULL,
    "photo_required" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."asset_checklist_template_items" OWNER TO "postgres";


COMMENT ON TABLE "public"."asset_checklist_template_items" IS 'Checklist item definitions under each asset checklist template.';



CREATE TABLE IF NOT EXISTS "public"."asset_checklist_templates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "asset_id" "uuid" NOT NULL,
    "kind" "public"."rental_checklist_kind" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "version" integer DEFAULT 1 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "asset_checklist_templates_version_check" CHECK (("version" >= 1))
);


ALTER TABLE "public"."asset_checklist_templates" OWNER TO "postgres";


COMMENT ON TABLE "public"."asset_checklist_templates" IS 'Reusable admin-created checklist templates for pickup, return, inspection, and service workflows.';



CREATE TABLE IF NOT EXISTS "public"."asset_documents" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "asset_id" "uuid" NOT NULL,
    "service_event_id" "uuid",
    "document_kind" "public"."asset_document_kind" DEFAULT 'other'::"public"."asset_document_kind" NOT NULL,
    "visibility" "public"."asset_document_visibility" DEFAULT 'internal'::"public"."asset_document_visibility" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "file_url" "text" NOT NULL,
    "file_name" "text",
    "mime_type" "text",
    "file_size_bytes" bigint,
    "storage_bucket" "text",
    "storage_path" "text",
    "is_downloadable" boolean DEFAULT true NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "issued_at" "date",
    "expires_at" "date",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "asset_documents_check" CHECK ((("expires_at" IS NULL) OR ("issued_at" IS NULL) OR ("expires_at" >= "issued_at"))),
    CONSTRAINT "asset_documents_file_size_bytes_check" CHECK ((("file_size_bytes" IS NULL) OR ("file_size_bytes" >= 0)))
);


ALTER TABLE "public"."asset_documents" OWNER TO "postgres";


COMMENT ON TABLE "public"."asset_documents" IS 'Asset-level document registry for public docs, customer-after-booking docs, and internal files.';



COMMENT ON COLUMN "public"."asset_documents"."visibility" IS 'public = visible to everyone, customer_after_booking = visible to customers with a booking, internal = backoffice only.';



CREATE TABLE IF NOT EXISTS "public"."asset_filter_options" (
    "asset_id" "uuid" NOT NULL,
    "filter_option_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."asset_filter_options" OWNER TO "postgres";


COMMENT ON TABLE "public"."asset_filter_options" IS 'Many-to-many assignment of assets to filter_options. Auto-maintained by triggers from assets.tag_keys.';



CREATE TABLE IF NOT EXISTS "public"."asset_matches" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "asset_id" "uuid" NOT NULL,
    "product_id" "text" NOT NULL,
    "match_type" "text" DEFAULT 'compatible'::"text" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "note" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."asset_matches" OWNER TO "postgres";


COMMENT ON TABLE "public"."asset_matches" IS 'Admin-managed product-level matching from assets to products.';



COMMENT ON COLUMN "public"."asset_matches"."match_type" IS 'Free-form admin label for placement meaning (for example compatible, primary, replacement).';



CREATE TABLE IF NOT EXISTS "public"."asset_service_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "asset_id" "uuid" NOT NULL,
    "event_type" "public"."rental_service_event_type" NOT NULL,
    "service_date" "date" NOT NULL,
    "title" "text" NOT NULL,
    "details" "text",
    "vendor_name" "text",
    "performed_by_user_id" "uuid",
    "cost_amount" numeric(12,2) DEFAULT 0 NOT NULL,
    "currency_code" "text" DEFAULT 'THB'::"text" NOT NULL,
    "next_due_at" "date",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "asset_service_events_cost_amount_check" CHECK (("cost_amount" >= (0)::numeric)),
    CONSTRAINT "asset_service_events_currency_code_check" CHECK (("char_length"("currency_code") = 3))
);


ALTER TABLE "public"."asset_service_events" OWNER TO "postgres";


COMMENT ON TABLE "public"."asset_service_events" IS 'Service date list + detailed maintenance/repair history for each asset.';



CREATE TABLE IF NOT EXISTS "public"."assets" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "code" "text" NOT NULL,
    "slug" "text" NOT NULL,
    "status" "public"."asset_status" DEFAULT 'draft'::"public"."asset_status" NOT NULL,
    "name_th" "text" NOT NULL,
    "name_en" "text" NOT NULL,
    "name_cn" "text",
    "name_jp" "text",
    "description_th" "text" NOT NULL,
    "description_en" "text" NOT NULL,
    "description_cn" "text",
    "description_jp" "text",
    "category_keys" "text"[] DEFAULT ARRAY[]::"text"[] NOT NULL,
    "brand" "text",
    "thumbnail_url" "text",
    "image_urls" "text"[] DEFAULT ARRAY[]::"text"[] NOT NULL,
    "spec_summary" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "pricing_model" "public"."rental_pricing_model" DEFAULT 'daily'::"public"."rental_pricing_model" NOT NULL,
    "currency_code" "text" DEFAULT 'THB'::"text" NOT NULL,
    "daily_rate" numeric(12,2) DEFAULT 0 NOT NULL,
    "weekly_rate" numeric(12,2) DEFAULT 0 NOT NULL,
    "monthly_rate" numeric(12,2) DEFAULT 0 NOT NULL,
    "deposit_amount" numeric(12,2) DEFAULT 0 NOT NULL,
    "min_rental_days" integer DEFAULT 1 NOT NULL,
    "max_rental_days" integer DEFAULT 0 NOT NULL,
    "buffer_days" integer DEFAULT 0 NOT NULL,
    "storage_location_code" "text",
    "storage_location_note" "text",
    "service_cycle_value" integer DEFAULT 0 NOT NULL,
    "service_cycle_unit" "public"."rental_service_cycle_unit",
    "last_serviced_at" "date",
    "next_service_due_at" "date",
    "view_count" integer DEFAULT 0 NOT NULL,
    "rental_count" integer DEFAULT 0 NOT NULL,
    "last_rented_at" timestamp with time zone,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "is_hidden" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "daily_enabled" boolean DEFAULT true NOT NULL,
    "weekly_enabled" boolean DEFAULT true NOT NULL,
    "monthly_enabled" boolean DEFAULT true NOT NULL,
    "storage_branch_id" "text",
    "storage_inventory_id" "uuid",
    "main_category_key" "text" DEFAULT 'others'::"text" NOT NULL,
    "tag_keys" "text"[] DEFAULT ARRAY[]::"text"[] NOT NULL,
    "detail_blocks" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "filter_keys" "text"[] DEFAULT ARRAY[]::"text"[] NOT NULL,
    "search_keywords" "text"[] DEFAULT ARRAY[]::"text"[] NOT NULL,
    "search_vector" "tsvector",
    CONSTRAINT "assets_buffer_days_check" CHECK (("buffer_days" >= 0)),
    CONSTRAINT "assets_check" CHECK ((("max_rental_days" = 0) OR ("max_rental_days" >= "min_rental_days"))),
    CONSTRAINT "assets_check1" CHECK (((("service_cycle_value" = 0) AND ("service_cycle_unit" IS NULL)) OR (("service_cycle_value" > 0) AND ("service_cycle_unit" IS NOT NULL)))),
    CONSTRAINT "assets_code_check" CHECK (("char_length"("code") > 0)),
    CONSTRAINT "assets_currency_code_check" CHECK (("char_length"("currency_code") = 3)),
    CONSTRAINT "assets_daily_rate_check" CHECK (("daily_rate" >= (0)::numeric)),
    CONSTRAINT "assets_deposit_amount_check" CHECK (("deposit_amount" >= (0)::numeric)),
    CONSTRAINT "assets_max_rental_days_check" CHECK (("max_rental_days" >= 0)),
    CONSTRAINT "assets_min_rental_days_check" CHECK (("min_rental_days" > 0)),
    CONSTRAINT "assets_monthly_rate_check" CHECK (("monthly_rate" >= (0)::numeric)),
    CONSTRAINT "assets_rental_count_check" CHECK (("rental_count" >= 0)),
    CONSTRAINT "assets_service_cycle_value_check" CHECK (("service_cycle_value" >= 0)),
    CONSTRAINT "assets_slug_check" CHECK (("char_length"("slug") > 0)),
    CONSTRAINT "assets_spec_summary_check" CHECK (("jsonb_typeof"("spec_summary") = 'object'::"text")),
    CONSTRAINT "assets_view_count_check" CHECK (("view_count" >= 0)),
    CONSTRAINT "assets_weekly_rate_check" CHECK (("weekly_rate" >= (0)::numeric))
);


ALTER TABLE "public"."assets" OWNER TO "postgres";


COMMENT ON TABLE "public"."assets" IS 'Public/commercial asset catalog root separated from sale products.';



COMMENT ON COLUMN "public"."assets"."code" IS 'Super Admin managed asset code; can be printed as QR/barcode payload for POS scanning.';



COMMENT ON COLUMN "public"."assets"."status" IS 'Backoffice lifecycle. Only active + not hidden rows are publicly browsable.';



COMMENT ON COLUMN "public"."assets"."spec_summary" IS 'Public-facing summary/spec payload shown on asset cards/detail surfaces.';



COMMENT ON COLUMN "public"."assets"."storage_location_code" IS 'Simple storage/yard/location code for MVP backoffice operations.';



COMMENT ON COLUMN "public"."assets"."daily_enabled" IS 'Whether the daily rate option is offered to customers.';



COMMENT ON COLUMN "public"."assets"."weekly_enabled" IS 'Whether the weekly rate option is offered to customers.';



COMMENT ON COLUMN "public"."assets"."monthly_enabled" IS 'Whether the monthly rate option is offered to customers.';



COMMENT ON COLUMN "public"."assets"."storage_branch_id" IS 'Primary storage branch for this asset. Optional pointer to store_branches.';



COMMENT ON COLUMN "public"."assets"."storage_inventory_id" IS 'Primary storage inventory pool (must belong to storage_branch_id). Optional pointer to inventories.';



COMMENT ON COLUMN "public"."assets"."main_category_key" IS 'Primary category selected from public.main_categories.';



COMMENT ON COLUMN "public"."assets"."tag_keys" IS 'Flexible secondary tags/facets used for filtering. Stored separately from primary category.';



COMMENT ON COLUMN "public"."assets"."detail_blocks" IS 'Ordered array of essay-style content blocks. Each block has key, optional localized title/body, items, images and documents.';



COMMENT ON COLUMN "public"."assets"."filter_keys" IS 'Denormalized "<group_key>__<option_key>" tokens synced from asset_filter_options. Maintained by trigger — do not edit directly.';



COMMENT ON COLUMN "public"."assets"."search_keywords" IS 'Admin/AI curated asset aliases and natural-language search phrases. Do not duplicate code, slug, brand, main_category_key, or tag_keys.';



COMMENT ON COLUMN "public"."assets"."search_vector" IS 'Weighted tsvector for asset search. A=code/slug/names, B=brand/categories/tags/admin keywords, C=descriptions, D=spec/detail blocks.';



CREATE TABLE IF NOT EXISTS "public"."branch_document_settings" (
    "branch_id" "text" NOT NULL,
    "logo_path" "text",
    "stamp_path" "text",
    "company_name_th" "text" DEFAULT ''::"text" NOT NULL,
    "company_name_en" "text" DEFAULT ''::"text" NOT NULL,
    "tax_id" "text" DEFAULT ''::"text" NOT NULL,
    "branch_tax_code" "text" DEFAULT '00000'::"text" NOT NULL,
    "address_th" "text" DEFAULT ''::"text" NOT NULL,
    "address_en" "text" DEFAULT ''::"text" NOT NULL,
    "phone" "text" DEFAULT ''::"text" NOT NULL,
    "email" "text" DEFAULT ''::"text" NOT NULL,
    "footer_note" "text" DEFAULT ''::"text" NOT NULL,
    "print_config" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "updated_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "branch_document_settings_print_config_check" CHECK (("jsonb_typeof"("print_config") = 'object'::"text"))
);


ALTER TABLE "public"."branch_document_settings" OWNER TO "postgres";


COMMENT ON TABLE "public"."branch_document_settings" IS 'Branch-level document header overrides for official print output.';



CREATE TABLE IF NOT EXISTS "public"."cart_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "cart_id" "uuid" NOT NULL,
    "product_id" "text" NOT NULL,
    "sku_id" "text" NOT NULL,
    "name" "text" NOT NULL,
    "thumbnail" "text",
    "unit_price" numeric(12,2) NOT NULL,
    "quantity" integer DEFAULT 1 NOT NULL,
    "added_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "original_unit_price" numeric(12,2) NOT NULL,
    "discount_percent" integer DEFAULT 0 NOT NULL,
    CONSTRAINT "cart_items_discount_percent_check" CHECK ((("discount_percent" >= 0) AND ("discount_percent" <= 100))),
    CONSTRAINT "cart_items_quantity_check" CHECK (("quantity" > 0))
);


ALTER TABLE "public"."cart_items" OWNER TO "postgres";


COMMENT ON TABLE "public"."cart_items" IS 'Line items inside a user cart.';



COMMENT ON COLUMN "public"."cart_items"."product_id" IS 'References product catalog (mock/future DB).';



COMMENT ON COLUMN "public"."cart_items"."sku_id" IS 'Selected variant within the product.';



COMMENT ON COLUMN "public"."cart_items"."name" IS 'Snapshot of product name at time of add.';



COMMENT ON COLUMN "public"."cart_items"."unit_price" IS 'Snapshot of price at time of add.';



COMMENT ON COLUMN "public"."cart_items"."original_unit_price" IS 'Snapshot of pre-discount unit price at time of add. Falls back to unit_price for legacy inserts.';



COMMENT ON COLUMN "public"."cart_items"."discount_percent" IS 'Snapshot of percentage discount applied at time of add.';



CREATE TABLE IF NOT EXISTS "public"."carts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."carts" OWNER TO "postgres";


COMMENT ON TABLE "public"."carts" IS 'One cart per logged-in user.';



COMMENT ON COLUMN "public"."carts"."user_id" IS 'Owner — 1:1 with auth user.';



CREATE TABLE IF NOT EXISTS "public"."catalog_terms" (
    "id" bigint NOT NULL,
    "kind" "text" NOT NULL,
    "normalized_value" "text" NOT NULL,
    "display_value" "text" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    CONSTRAINT "catalog_terms_display_value_chk" CHECK (("char_length"(TRIM(BOTH FROM "display_value")) > 0)),
    CONSTRAINT "catalog_terms_kind_check" CHECK (("kind" = ANY (ARRAY['tag'::"text", 'search_keyword'::"text"]))),
    CONSTRAINT "catalog_terms_normalized_value_chk" CHECK (("char_length"(TRIM(BOTH FROM "normalized_value")) > 0))
);


ALTER TABLE "public"."catalog_terms" OWNER TO "postgres";


COMMENT ON TABLE "public"."catalog_terms" IS 'Central autocomplete dictionary for admin-authored product tags and search keywords.';



COMMENT ON COLUMN "public"."catalog_terms"."kind" IS 'Dictionary namespace: tag or search_keyword.';



COMMENT ON COLUMN "public"."catalog_terms"."normalized_value" IS 'Normalized unique key used for dedupe and lookup.';



COMMENT ON COLUMN "public"."catalog_terms"."display_value" IS 'Human-facing label shown in admin autocomplete UIs.';



COMMENT ON COLUMN "public"."catalog_terms"."is_active" IS 'If false, keep historical term but hide it from autocomplete suggestions.';



ALTER TABLE "public"."catalog_terms" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."catalog_terms_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."chat_attachments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "message_id" "uuid" NOT NULL,
    "storage_bucket" "text" DEFAULT 'chat-attachments'::"text" NOT NULL,
    "storage_path" "text" NOT NULL,
    "file_name" "text",
    "mime_type" "text" NOT NULL,
    "file_size" bigint NOT NULL,
    "kind" "public"."chat_attachment_kind" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deleted_at" timestamp with time zone,
    CONSTRAINT "chat_attachment_allowed_mime" CHECK (("mime_type" = ANY (ARRAY['image/jpeg'::"text", 'image/png'::"text", 'image/webp'::"text", 'application/pdf'::"text"]))),
    CONSTRAINT "chat_attachment_size_limit" CHECK ((("file_size" > 0) AND ((("kind" = 'image'::"public"."chat_attachment_kind") AND ("mime_type" = ANY (ARRAY['image/jpeg'::"text", 'image/png'::"text", 'image/webp'::"text"])) AND ("file_size" <= 5242880)) OR (("kind" = 'document'::"public"."chat_attachment_kind") AND ("mime_type" = 'application/pdf'::"text") AND ("file_size" <= 10485760))))),
    CONSTRAINT "chat_attachment_storage_path_external" CHECK ((("storage_path" !~* '^data:'::"text") AND ("storage_path" !~* 'base64,'::"text") AND (("char_length"("storage_path") >= 1) AND ("char_length"("storage_path") <= 1024))))
);


ALTER TABLE "public"."chat_attachments" OWNER TO "postgres";


COMMENT ON TABLE "public"."chat_attachments" IS 'Attachment metadata only. Binary files live in Supabase Storage, never base64 in the database.';



CREATE TABLE IF NOT EXISTS "public"."chat_conversations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "subject_type" "public"."chat_subject_type" DEFAULT 'general'::"public"."chat_subject_type" NOT NULL,
    "subject_id" "text",
    "customer_id" "uuid",
    "status" "public"."chat_conversation_status" DEFAULT 'open'::"public"."chat_conversation_status" NOT NULL,
    "last_message_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "closed_at" timestamp with time zone,
    "archived_at" timestamp with time zone,
    CONSTRAINT "chat_archive_timestamp_required" CHECK ((("status" <> 'archived'::"public"."chat_conversation_status") OR ("archived_at" IS NOT NULL))),
    CONSTRAINT "chat_subject_id_required" CHECK ((("subject_type" = 'general'::"public"."chat_subject_type") OR (NULLIF(TRIM(BOTH FROM "subject_id"), ''::"text") IS NOT NULL)))
);


ALTER TABLE "public"."chat_conversations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."chat_messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "conversation_id" "uuid" NOT NULL,
    "sender_id" "uuid" NOT NULL,
    "message_type" "public"."chat_message_type" DEFAULT 'text'::"public"."chat_message_type" NOT NULL,
    "body" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "edited_at" timestamp with time zone,
    "deleted_at" timestamp with time zone,
    "deleted_by" "uuid",
    CONSTRAINT "chat_message_body_limit" CHECK (((("deleted_at" IS NULL) AND ("message_type" = 'text'::"public"."chat_message_type") AND (NULLIF(TRIM(BOTH FROM "body"), ''::"text") IS NOT NULL) AND ("char_length"("body") <= 4000)) OR (("deleted_at" IS NULL) AND ("message_type" = ANY (ARRAY['attachment'::"public"."chat_message_type", 'system'::"public"."chat_message_type"])) AND (("body" IS NULL) OR ("char_length"("body") <= 4000))) OR (("deleted_at" IS NOT NULL) AND (("body" IS NULL) OR ("char_length"("body") <= 4000)))))
);


ALTER TABLE "public"."chat_messages" OWNER TO "postgres";


COMMENT ON TABLE "public"."chat_messages" IS 'Minimal chat message rows. No profile/order/product snapshots; resolve related data with joins.';



COMMENT ON COLUMN "public"."chat_messages"."body" IS 'Message text, capped at 4,000 chars. Longer content must be sent as an attachment.';



CREATE TABLE IF NOT EXISTS "public"."chat_participants" (
    "conversation_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "participant_role" "public"."chat_participant_role" DEFAULT 'customer'::"public"."chat_participant_role" NOT NULL,
    "last_read_at" timestamp with time zone,
    "joined_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "left_at" timestamp with time zone
);


ALTER TABLE "public"."chat_participants" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."companies" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "tax_id" "text",
    "credit_limit" numeric(12,2) DEFAULT 0 NOT NULL,
    "credit_used" numeric(12,2) DEFAULT 0 NOT NULL,
    "credit_term_days" integer DEFAULT 0 NOT NULL,
    "billing_cycle" "text" DEFAULT 'cash'::"text" NOT NULL,
    "kyc_status" "public"."kyc_status" DEFAULT 'pending'::"public"."kyc_status" NOT NULL,
    "kyc_documents" "jsonb",
    "billing_address" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "kyc_rejection_reason" "text"
);


ALTER TABLE "public"."companies" OWNER TO "postgres";


COMMENT ON TABLE "public"."companies" IS 'Legal entity — credit limits, KYC, billing info.';



COMMENT ON COLUMN "public"."companies"."credit_term_days" IS 'Payment term in days: 0 = cash, 30, 45, 60';



COMMENT ON COLUMN "public"."companies"."billing_cycle" IS 'Billing cycle: cash, EOM, 15th, 25th, upon_delivery';



COMMENT ON COLUMN "public"."companies"."kyc_documents" IS 'KYC documents: [{name, url, uploadedAt}] — ภพ.20, หนังสือรับรองบริษัท';



COMMENT ON COLUMN "public"."companies"."kyc_rejection_reason" IS 'Reason for company KYC rejection (set by admin only)';



CREATE TABLE IF NOT EXISTS "public"."company_members" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "company_id" "uuid" NOT NULL,
    "role" "public"."company_role" DEFAULT 'b2b_user'::"public"."company_role" NOT NULL,
    "invited_by" "uuid",
    "joined_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."company_members" OWNER TO "postgres";


COMMENT ON TABLE "public"."company_members" IS 'Junction: user ↔ company with role assignment.';



CREATE TABLE IF NOT EXISTS "public"."content_page_assets" (
    "content_page_id" "uuid" NOT NULL,
    "asset_id" "uuid" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."content_page_assets" OWNER TO "postgres";


COMMENT ON TABLE "public"."content_page_assets" IS 'Many-to-many link from a content_pages row (typically content_type=review) to one or more assets.';



CREATE TABLE IF NOT EXISTS "public"."content_page_products" (
    "content_page_id" "uuid" NOT NULL,
    "product_id" "text" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."content_page_products" OWNER TO "postgres";


COMMENT ON TABLE "public"."content_page_products" IS 'Many-to-many link from a content_pages row (typically content_type=review) to one or more products.';



CREATE TABLE IF NOT EXISTS "public"."content_pages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "content_type" "text" NOT NULL,
    "slug" "text" NOT NULL,
    "title_th" "text" NOT NULL,
    "title_en" "text" NOT NULL,
    "title_cn" "text",
    "title_jp" "text",
    "excerpt_th" "text" NOT NULL,
    "excerpt_en" "text" NOT NULL,
    "excerpt_cn" "text",
    "excerpt_jp" "text",
    "cover_image_url" "text",
    "blocks" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "published_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "service_areas" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "main_category_key" "text",
    "provider_id" "text",
    CONSTRAINT "content_pages_blocks_check" CHECK (("jsonb_typeof"("blocks") = ANY (ARRAY['object'::"text", 'array'::"text"]))),
    CONSTRAINT "content_pages_content_type_check" CHECK (("content_type" = ANY (ARRAY['blog'::"text", 'service'::"text", 'promotion'::"text", 'review'::"text"]))),
    CONSTRAINT "content_pages_excerpt_en_check" CHECK (("char_length"("excerpt_en") > 0)),
    CONSTRAINT "content_pages_excerpt_th_check" CHECK (("char_length"("excerpt_th") > 0)),
    CONSTRAINT "content_pages_provider_service_only" CHECK ((("content_type" = 'service'::"text") OR ("provider_id" IS NULL))),
    CONSTRAINT "content_pages_slug_check" CHECK (("slug" ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'::"text")),
    CONSTRAINT "content_pages_title_en_check" CHECK (("char_length"("title_en") > 0)),
    CONSTRAINT "content_pages_title_th_check" CHECK (("char_length"("title_th") > 0))
);


ALTER TABLE "public"."content_pages" OWNER TO "postgres";


COMMENT ON TABLE "public"."content_pages" IS 'Super-admin managed public content pages for blog, services, and promotions.';



COMMENT ON COLUMN "public"."content_pages"."service_areas" IS 'Optional list of service-area slugs (Thai provinces, regions, special) used when content_type=service. Empty array for blog/promotion. Vocabulary is enforced in the app layer.';



COMMENT ON COLUMN "public"."content_pages"."main_category_key" IS 'Optional category key from main_categories. Valid entity_types are enforced by the admin/API layer per content_type.';



CREATE TABLE IF NOT EXISTS "public"."customer_tax_profiles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "customer_user_id" "uuid",
    "walk_in_phone" "text",
    "company_id" "uuid",
    "customer_kind" "text" DEFAULT 'person'::"text" NOT NULL,
    "legal_name" "text" NOT NULL,
    "tax_id" "text" NOT NULL,
    "tax_id_normalized" "text" NOT NULL,
    "branch_type" "text" DEFAULT 'none'::"text" NOT NULL,
    "branch_code" "text" DEFAULT ''::"text" NOT NULL,
    "billing_address" "text" NOT NULL,
    "phone" "text" DEFAULT ''::"text" NOT NULL,
    "email" "text" DEFAULT ''::"text" NOT NULL,
    "review_status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "reviewed_by" "uuid",
    "reviewed_at" timestamp with time zone,
    "rejection_reason" "text" DEFAULT ''::"text" NOT NULL,
    "is_default" boolean DEFAULT false NOT NULL,
    "created_by" "uuid",
    "updated_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "customer_tax_profiles_billing_address_check" CHECK (("char_length"(TRIM(BOTH FROM "billing_address")) > 0)),
    CONSTRAINT "customer_tax_profiles_branch_type_check" CHECK (("branch_type" = ANY (ARRAY['none'::"text", 'head_office'::"text", 'branch'::"text"]))),
    CONSTRAINT "customer_tax_profiles_check" CHECK ((("customer_user_id" IS NOT NULL) OR ("walk_in_phone" IS NOT NULL) OR ("company_id" IS NOT NULL))),
    CONSTRAINT "customer_tax_profiles_check1" CHECK ((("branch_type" <> 'branch'::"text") OR ("char_length"(TRIM(BOTH FROM "branch_code")) > 0))),
    CONSTRAINT "customer_tax_profiles_check2" CHECK ((("customer_kind" <> 'person'::"text") OR ("branch_type" = 'none'::"text"))),
    CONSTRAINT "customer_tax_profiles_customer_kind_check" CHECK (("customer_kind" = ANY (ARRAY['person'::"text", 'company'::"text"]))),
    CONSTRAINT "customer_tax_profiles_legal_name_check" CHECK (("char_length"(TRIM(BOTH FROM "legal_name")) > 0)),
    CONSTRAINT "customer_tax_profiles_review_status_check" CHECK (("review_status" = ANY (ARRAY['draft'::"text", 'pending_review'::"text", 'approved'::"text", 'rejected'::"text"]))),
    CONSTRAINT "customer_tax_profiles_tax_id_check" CHECK (("char_length"(TRIM(BOTH FROM "tax_id")) > 0)),
    CONSTRAINT "customer_tax_profiles_tax_id_normalized_check" CHECK (("char_length"(TRIM(BOTH FROM "tax_id_normalized")) > 0))
);


ALTER TABLE "public"."customer_tax_profiles" OWNER TO "postgres";


COMMENT ON TABLE "public"."customer_tax_profiles" IS 'Reusable tax invoice identity for full tax invoice, credit note, debit note, and advance tax invoice.';



CREATE TABLE IF NOT EXISTS "public"."document_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "document_id" "uuid" NOT NULL,
    "event_type" "text" NOT NULL,
    "staff_user_id" "uuid",
    "reason" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "document_events_check" CHECK ((("event_type" <> 'reprinted'::"text") OR ("char_length"(TRIM(BOTH FROM COALESCE("reason", ''::"text"))) > 0))),
    CONSTRAINT "document_events_event_type_check" CHECK (("event_type" = ANY (ARRAY['draft_created'::"text", 'issued'::"text", 'printed'::"text", 'reprinted'::"text", 'voided'::"text", 'replaced'::"text", 'previewed'::"text"]))),
    CONSTRAINT "document_events_metadata_check" CHECK (("jsonb_typeof"("metadata") = 'object'::"text"))
);


ALTER TABLE "public"."document_events" OWNER TO "postgres";


COMMENT ON TABLE "public"."document_events" IS 'Audit log for document lifecycle events including print and reprint.';



CREATE TABLE IF NOT EXISTS "public"."document_sequences" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "document_type" "text" NOT NULL,
    "sequence_key" "text" DEFAULT 'global'::"text" NOT NULL,
    "branch_id" "text",
    "period" "text" NOT NULL,
    "prefix" "text" NOT NULL,
    "last_number" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "document_sequences_document_type_check" CHECK (("char_length"(TRIM(BOTH FROM "document_type")) > 0)),
    CONSTRAINT "document_sequences_last_number_check" CHECK (("last_number" >= 0)),
    CONSTRAINT "document_sequences_period_check" CHECK (("period" ~ '^[0-9]{6}$'::"text")),
    CONSTRAINT "document_sequences_prefix_check" CHECK (("char_length"(TRIM(BOTH FROM "prefix")) > 0)),
    CONSTRAINT "document_sequences_sequence_key_check" CHECK (("char_length"(TRIM(BOTH FROM "sequence_key")) > 0))
);


ALTER TABLE "public"."document_sequences" OWNER TO "postgres";


COMMENT ON TABLE "public"."document_sequences" IS 'Sequence allocator table for official document numbers. Initial implementation uses global numbering.';



CREATE TABLE IF NOT EXISTS "public"."filter_groups" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "main_category_key" "text" NOT NULL,
    "key" "text" NOT NULL,
    "label_th" "text" NOT NULL,
    "label_en" "text" NOT NULL,
    "filter_type" "text" NOT NULL,
    "match_logic" "text" DEFAULT 'or'::"text" NOT NULL,
    "spec_key" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "filter_groups_filter_type_check" CHECK (("filter_type" = ANY (ARRAY['checkbox'::"text", 'dropdown'::"text", 'number_range'::"text"]))),
    CONSTRAINT "filter_groups_key_chk" CHECK (("char_length"(TRIM(BOTH FROM "key")) > 0)),
    CONSTRAINT "filter_groups_match_logic_check" CHECK (("match_logic" = ANY (ARRAY['or'::"text", 'and'::"text"]))),
    CONSTRAINT "filter_groups_spec_key_required" CHECK (((("filter_type" = 'number_range'::"text") AND ("spec_key" IS NOT NULL) AND ("char_length"(TRIM(BOTH FROM "spec_key")) > 0)) OR ("filter_type" = ANY (ARRAY['checkbox'::"text", 'dropdown'::"text"]))))
);


ALTER TABLE "public"."filter_groups" OWNER TO "postgres";


COMMENT ON TABLE "public"."filter_groups" IS 'Super-admin managed dynamic filter groups bound to a main_category. Used by /product-all SearchFilters.';



COMMENT ON COLUMN "public"."filter_groups"."spec_key" IS 'For filter_type=number_range only — the products.spec key whose numeric value is range-filtered.';



CREATE TABLE IF NOT EXISTS "public"."filter_options" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "group_id" "uuid" NOT NULL,
    "key" "text" NOT NULL,
    "label_th" "text" NOT NULL,
    "label_en" "text" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "filter_options_key_chk" CHECK (("char_length"(TRIM(BOTH FROM "key")) > 0))
);


ALTER TABLE "public"."filter_options" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."home_banners" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "title_th" "text" NOT NULL,
    "title_en" "text" NOT NULL,
    "title_cn" "text",
    "title_jp" "text",
    "subtitle_th" "text" NOT NULL,
    "subtitle_en" "text" NOT NULL,
    "subtitle_cn" "text",
    "subtitle_jp" "text",
    "cta_label_th" "text" NOT NULL,
    "cta_label_en" "text" NOT NULL,
    "cta_label_cn" "text",
    "cta_label_jp" "text",
    "image_url" "text" NOT NULL,
    "mobile_image_url" "text",
    "link_url" "text" NOT NULL,
    "link_target" "text" DEFAULT '_self'::"text" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "home_banners_cta_label_en_check" CHECK (("char_length"("cta_label_en") > 0)),
    CONSTRAINT "home_banners_cta_label_th_check" CHECK (("char_length"("cta_label_th") > 0)),
    CONSTRAINT "home_banners_image_url_check" CHECK (("char_length"("image_url") > 0)),
    CONSTRAINT "home_banners_link_target_check" CHECK (("link_target" = ANY (ARRAY['_self'::"text", '_blank'::"text"]))),
    CONSTRAINT "home_banners_link_url_check" CHECK (("char_length"("link_url") > 0)),
    CONSTRAINT "home_banners_subtitle_en_check" CHECK (("char_length"("subtitle_en") > 0)),
    CONSTRAINT "home_banners_subtitle_th_check" CHECK (("char_length"("subtitle_th") > 0)),
    CONSTRAINT "home_banners_title_en_check" CHECK (("char_length"("title_en") > 0)),
    CONSTRAINT "home_banners_title_th_check" CHECK (("char_length"("title_th") > 0))
);


ALTER TABLE "public"."home_banners" OWNER TO "postgres";


COMMENT ON TABLE "public"."home_banners" IS 'Super-admin managed homepage hero banner slides.';



CREATE TABLE IF NOT EXISTS "public"."home_category_groups" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "main_category_key" "text" NOT NULL,
    "label_th" "text" NOT NULL,
    "label_en" "text" NOT NULL,
    "label_cn" "text",
    "label_jp" "text",
    "icon" "text",
    "sort_order" integer DEFAULT 0 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "home_category_groups_label_en_check" CHECK (("char_length"("label_en") > 0)),
    CONSTRAINT "home_category_groups_label_th_check" CHECK (("char_length"("label_th") > 0)),
    CONSTRAINT "home_category_groups_main_category_key_check" CHECK (("char_length"("main_category_key") > 0))
);


ALTER TABLE "public"."home_category_groups" OWNER TO "postgres";


COMMENT ON TABLE "public"."home_category_groups" IS 'Super-admin managed groups for the Home category card. Seeded from the previous mock main categories.';



CREATE TABLE IF NOT EXISTS "public"."home_category_options" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "group_id" "uuid" NOT NULL,
    "option_key" "text" NOT NULL,
    "label_th" "text" NOT NULL,
    "label_en" "text" NOT NULL,
    "label_cn" "text",
    "label_jp" "text",
    "search_query_th" "text",
    "search_query_en" "text",
    "search_query_cn" "text",
    "search_query_jp" "text",
    "sort_order" integer DEFAULT 0 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "home_category_options_label_en_check" CHECK (("char_length"("label_en") > 0)),
    CONSTRAINT "home_category_options_label_th_check" CHECK (("char_length"("label_th") > 0)),
    CONSTRAINT "home_category_options_option_key_check" CHECK (("char_length"("option_key") > 0))
);


ALTER TABLE "public"."home_category_options" OWNER TO "postgres";


COMMENT ON TABLE "public"."home_category_options" IS 'Super-admin managed dropdown options for each Home category-card group. option_key is sent as /search category query.';



CREATE TABLE IF NOT EXISTS "public"."home_featured_assets" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "asset_id" "uuid" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."home_featured_assets" OWNER TO "postgres";


COMMENT ON TABLE "public"."home_featured_assets" IS 'Super-admin curated asset list for homepage rails.';



CREATE TABLE IF NOT EXISTS "public"."home_featured_products" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "product_id" "text" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."home_featured_products" OWNER TO "postgres";


COMMENT ON TABLE "public"."home_featured_products" IS 'Super-admin curated product list for homepage recommendation rails.';



CREATE TABLE IF NOT EXISTS "public"."home_link_cards" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "section_key" "text" NOT NULL,
    "title_th" "text",
    "title_en" "text",
    "title_cn" "text",
    "title_jp" "text",
    "description_th" "text",
    "description_en" "text",
    "description_cn" "text",
    "description_jp" "text",
    "image_url" "text",
    "link_url" "text",
    "link_target" "text" DEFAULT '_self'::"text" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "content_page_id" "uuid",
    CONSTRAINT "home_link_cards_link_target_check" CHECK (("link_target" = ANY (ARRAY['_self'::"text", '_blank'::"text"]))),
    CONSTRAINT "home_link_cards_section_key_check" CHECK (("section_key" = ANY (ARRAY['promotion'::"text", 'service'::"text"]))),
    CONSTRAINT "home_link_cards_source_present" CHECK ((("content_page_id" IS NOT NULL) OR (("title_th" IS NOT NULL) AND ("char_length"("title_th") > 0) AND ("title_en" IS NOT NULL) AND ("char_length"("title_en") > 0) AND ("description_th" IS NOT NULL) AND ("char_length"("description_th") > 0) AND ("description_en" IS NOT NULL) AND ("char_length"("description_en") > 0) AND ("image_url" IS NOT NULL) AND ("char_length"("image_url") > 0) AND ("link_url" IS NOT NULL) AND ("char_length"("link_url") > 0))))
);


ALTER TABLE "public"."home_link_cards" OWNER TO "postgres";


COMMENT ON TABLE "public"."home_link_cards" IS 'Homepage horizontal-card content for promotion and service sections.';



COMMENT ON COLUMN "public"."home_link_cards"."content_page_id" IS 'Optional reference to content_pages. When set, the homepage card pulls title/excerpt/cover/slug live from the linked page.';



CREATE TABLE IF NOT EXISTS "public"."home_partner_logos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "image_url" "text" NOT NULL,
    "link_url" "text" NOT NULL,
    "link_target" "text" DEFAULT '_self'::"text" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "home_partner_logos_image_url_check" CHECK (("char_length"("image_url") > 0)),
    CONSTRAINT "home_partner_logos_link_target_check" CHECK (("link_target" = ANY (ARRAY['_self'::"text", '_blank'::"text"]))),
    CONSTRAINT "home_partner_logos_link_url_check" CHECK (("char_length"("link_url") > 0)),
    CONSTRAINT "home_partner_logos_name_check" CHECK (("char_length"("name") > 0))
);


ALTER TABLE "public"."home_partner_logos" OWNER TO "postgres";


COMMENT ON TABLE "public"."home_partner_logos" IS 'Super-admin managed partner/brand logos shown in the homepage marquee.';



CREATE TABLE IF NOT EXISTS "public"."inventories" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "branch_id" "text" NOT NULL,
    "name" "text" NOT NULL,
    "is_default" boolean DEFAULT false NOT NULL,
    "notes" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "is_default_rental" boolean DEFAULT false NOT NULL,
    CONSTRAINT "inventories_name_check" CHECK (("char_length"(TRIM(BOTH FROM "name")) > 0)),
    CONSTRAINT "inventories_notes_check" CHECK (("jsonb_typeof"("notes") = 'object'::"text"))
);


ALTER TABLE "public"."inventories" OWNER TO "postgres";


COMMENT ON TABLE "public"."inventories" IS 'Logical inventory pools owned by a branch. Each branch must have exactly one default inventory.';



COMMENT ON COLUMN "public"."inventories"."is_default" IS 'Default inventory for the branch. Cannot be renamed, deleted, or unflagged.';



COMMENT ON COLUMN "public"."inventories"."notes" IS 'Free-form metadata as JSONB (location, kind, contact, etc.).';



COMMENT ON COLUMN "public"."inventories"."is_default_rental" IS 'Default rental inventory for the branch. Cannot be renamed, deleted, or unflagged. Independent from is_default.';



CREATE TABLE IF NOT EXISTS "public"."inventory_change_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "inventory_id" "uuid" NOT NULL,
    "sku_id" "text" NOT NULL,
    "branch_id" "text" NOT NULL,
    "action" "text" NOT NULL,
    "changed_by" "uuid" NOT NULL,
    "old_values" "jsonb",
    "new_values" "jsonb",
    "note" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "inventory_change_log_action_check" CHECK (("action" = ANY (ARRAY['create'::"text", 'update'::"text", 'delete'::"text"])))
);


ALTER TABLE "public"."inventory_change_log" OWNER TO "postgres";


COMMENT ON TABLE "public"."inventory_change_log" IS 'Audit trail for every inventory change. Records who made the change and before/after values.';



CREATE TABLE IF NOT EXISTS "public"."main_categories" (
    "key" "text" NOT NULL,
    "label_th" "text" NOT NULL,
    "label_en" "text" NOT NULL,
    "icon" "text",
    "description_th" "text",
    "description_en" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "entity_types" "text"[] DEFAULT ARRAY['product'::"text"] NOT NULL,
    CONSTRAINT "main_categories_entity_types_chk" CHECK ((("cardinality"("entity_types") > 0) AND ("entity_types" <@ ARRAY['product'::"text", 'asset'::"text", 'service'::"text", 'promotion'::"text", 'blog'::"text", 'review'::"text"]))),
    CONSTRAINT "main_categories_key_check" CHECK (("char_length"("key") > 0)),
    CONSTRAINT "main_categories_label_en_check" CHECK (("char_length"("label_en") > 0)),
    CONSTRAINT "main_categories_label_th_check" CHECK (("char_length"("label_th") > 0))
);


ALTER TABLE "public"."main_categories" OWNER TO "postgres";


COMMENT ON TABLE "public"."main_categories" IS 'Super-admin managed primary product categories used by admin create/edit flows.';



COMMENT ON COLUMN "public"."main_categories"."key" IS 'Stable category key used for product.main_category_key and search/filter facets.';



COMMENT ON COLUMN "public"."main_categories"."entity_types" IS 'Entity/content types that can use this main category: product, asset, service, promotion, blog, review.';



CREATE TABLE IF NOT EXISTS "public"."mixed_checkout_sessions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "cart_id" "uuid",
    "sale_order_id" "uuid",
    "status" "text" DEFAULT 'validated'::"text" NOT NULL,
    "checkout_kind" "text" NOT NULL,
    "currency_code" "text" DEFAULT 'THB'::"text" NOT NULL,
    "amount_total" numeric(12,2) NOT NULL,
    "sale_subtotal_amount" numeric(12,2) DEFAULT 0 NOT NULL,
    "shipping_amount" numeric(12,2) DEFAULT 0 NOT NULL,
    "booking_deposit_total_amount" numeric(12,2) DEFAULT 0 NOT NULL,
    "idempotency_key" "text" NOT NULL,
    "validation_snapshot" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "allocation_plan_snapshot" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "mixed_checkout_sessions_allocation_plan_snapshot_check" CHECK (("jsonb_typeof"("allocation_plan_snapshot") = 'object'::"text")),
    CONSTRAINT "mixed_checkout_sessions_amount_total_check" CHECK (("amount_total" >= (0)::numeric)),
    CONSTRAINT "mixed_checkout_sessions_booking_deposit_total_amount_check" CHECK (("booking_deposit_total_amount" >= (0)::numeric)),
    CONSTRAINT "mixed_checkout_sessions_checkout_kind_check" CHECK (("checkout_kind" = ANY (ARRAY['sale_only'::"text", 'rental_deposit_only'::"text", 'mixed'::"text"]))),
    CONSTRAINT "mixed_checkout_sessions_currency_code_check" CHECK (("char_length"("currency_code") = 3)),
    CONSTRAINT "mixed_checkout_sessions_sale_subtotal_amount_check" CHECK (("sale_subtotal_amount" >= (0)::numeric)),
    CONSTRAINT "mixed_checkout_sessions_shipping_amount_check" CHECK (("shipping_amount" >= (0)::numeric)),
    CONSTRAINT "mixed_checkout_sessions_status_check" CHECK (("status" = ANY (ARRAY['validated'::"text", 'payment_created'::"text", 'paid'::"text", 'finalizing'::"text", 'finalized'::"text", 'partial_finalized'::"text", 'finalization_failed'::"text", 'failed'::"text", 'expired'::"text", 'cancelled'::"text"]))),
    CONSTRAINT "mixed_checkout_sessions_validation_snapshot_check" CHECK (("jsonb_typeof"("validation_snapshot") = 'object'::"text"))
);


ALTER TABLE "public"."mixed_checkout_sessions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."mixed_payment_allocations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "mixed_checkout_session_id" "uuid" NOT NULL,
    "mixed_payment_attempt_id" "uuid",
    "user_id" "uuid" NOT NULL,
    "allocation_type" "text" NOT NULL,
    "target_type" "text" NOT NULL,
    "target_id" "text",
    "order_id" "uuid",
    "order_line_id" "uuid",
    "rental_booking_id" "uuid",
    "amount" numeric(12,2) NOT NULL,
    "currency_code" "text" DEFAULT 'THB'::"text" NOT NULL,
    "tax_category" "text" NOT NULL,
    "wht_rate" numeric(6,5) DEFAULT 0 NOT NULL,
    "wht_amount" numeric(12,2) DEFAULT 0 NOT NULL,
    "status" "text" DEFAULT 'planned'::"text" NOT NULL,
    "paid_at" timestamp with time zone,
    "finalized_at" timestamp with time zone,
    "failure_code" "text",
    "failure_message" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "mixed_payment_allocations_allocation_type_check" CHECK (("allocation_type" = ANY (ARRAY['sale_product'::"text", 'shipping'::"text", 'booking_deposit'::"text"]))),
    CONSTRAINT "mixed_payment_allocations_amount_check" CHECK (("amount" >= (0)::numeric)),
    CONSTRAINT "mixed_payment_allocations_check" CHECK ((("allocation_type" <> 'booking_deposit'::"text") OR (("target_type" = 'rental_booking'::"text") AND ("rental_booking_id" IS NOT NULL) AND ("tax_category" = 'partial_refundable_security_deposit'::"text") AND ("wht_rate" = (0)::numeric) AND ("wht_amount" = (0)::numeric)))),
    CONSTRAINT "mixed_payment_allocations_currency_code_check" CHECK (("char_length"("currency_code") = 3)),
    CONSTRAINT "mixed_payment_allocations_metadata_check" CHECK (("jsonb_typeof"("metadata") = 'object'::"text")),
    CONSTRAINT "mixed_payment_allocations_status_check" CHECK (("status" = ANY (ARRAY['planned'::"text", 'payment_pending'::"text", 'paid'::"text", 'finalized'::"text", 'paid_confirm_failed'::"text", 'admin_review_required'::"text", 'voided'::"text", 'refunded'::"text", 'partial_refunded'::"text"]))),
    CONSTRAINT "mixed_payment_allocations_target_type_check" CHECK (("target_type" = ANY (ARRAY['order'::"text", 'order_line'::"text", 'shipping'::"text", 'rental_booking'::"text"]))),
    CONSTRAINT "mixed_payment_allocations_wht_amount_check" CHECK (("wht_amount" >= (0)::numeric)),
    CONSTRAINT "mixed_payment_allocations_wht_rate_check" CHECK (("wht_rate" >= (0)::numeric))
);


ALTER TABLE "public"."mixed_payment_allocations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."mixed_payment_attempts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "mixed_checkout_session_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "gateway" "public"."payment_gateway" DEFAULT 'omise'::"public"."payment_gateway" NOT NULL,
    "method" "public"."payment_attempt_method" NOT NULL,
    "status" "public"."payment_attempt_status" DEFAULT 'created'::"public"."payment_attempt_status" NOT NULL,
    "amount" numeric(12,2) NOT NULL,
    "currency_code" "text" DEFAULT 'THB'::"text" NOT NULL,
    "idempotency_key" "text" NOT NULL,
    "gateway_charge_id" "text",
    "gateway_source_id" "text",
    "gateway_authorize_uri" "text",
    "qr_image_url" "text",
    "expires_at" timestamp with time zone,
    "failure_code" "text",
    "failure_message" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "raw_gateway_response" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "mixed_payment_attempts_amount_check" CHECK (("amount" >= (0)::numeric)),
    CONSTRAINT "mixed_payment_attempts_currency_code_check" CHECK (("char_length"("currency_code") = 3)),
    CONSTRAINT "mixed_payment_attempts_metadata_check" CHECK (("jsonb_typeof"("metadata") = 'object'::"text")),
    CONSTRAINT "mixed_payment_attempts_raw_gateway_response_check" CHECK (("jsonb_typeof"("raw_gateway_response") = 'object'::"text"))
);


ALTER TABLE "public"."mixed_payment_attempts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."official_documents" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "document_type" "text" NOT NULL,
    "document_no" "text",
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "branch_id" "text",
    "source_type" "text" NOT NULL,
    "source_id" "text" NOT NULL,
    "original_document_id" "uuid",
    "tax_profile_id" "uuid",
    "customer_user_id" "uuid",
    "walk_in_phone" "text",
    "company_id" "uuid",
    "issued_at" timestamp with time zone,
    "issued_by" "uuid",
    "voided_at" timestamp with time zone,
    "voided_by" "uuid",
    "void_reason" "text",
    "subtotal" numeric(12,2) DEFAULT 0 NOT NULL,
    "vat_amount" numeric(12,2) DEFAULT 0 NOT NULL,
    "total_amount" numeric(12,2) DEFAULT 0 NOT NULL,
    "currency_code" "text" DEFAULT 'THB'::"text" NOT NULL,
    "template_key" "text" NOT NULL,
    "template_version" integer DEFAULT 1 NOT NULL,
    "snapshot" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "idempotency_key" "text",
    "print_count" integer DEFAULT 0 NOT NULL,
    "last_printed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "official_documents_check" CHECK ((("status" = 'draft'::"text") OR (NULLIF(TRIM(BOTH FROM "document_no"), ''::"text") IS NOT NULL))),
    CONSTRAINT "official_documents_check1" CHECK ((("status" = 'draft'::"text") OR ("issued_at" IS NOT NULL))),
    CONSTRAINT "official_documents_check2" CHECK ((("status" <> 'voided'::"text") OR ("voided_at" IS NOT NULL))),
    CONSTRAINT "official_documents_currency_code_check" CHECK (("char_length"("currency_code") = 3)),
    CONSTRAINT "official_documents_document_type_check" CHECK (("char_length"(TRIM(BOTH FROM "document_type")) > 0)),
    CONSTRAINT "official_documents_print_count_check" CHECK (("print_count" >= 0)),
    CONSTRAINT "official_documents_snapshot_check" CHECK (("jsonb_typeof"("snapshot") = 'object'::"text")),
    CONSTRAINT "official_documents_source_id_check" CHECK (("char_length"(TRIM(BOTH FROM "source_id")) > 0)),
    CONSTRAINT "official_documents_source_type_check" CHECK (("char_length"(TRIM(BOTH FROM "source_type")) > 0)),
    CONSTRAINT "official_documents_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'issued'::"text", 'printed'::"text", 'voided'::"text", 'replaced'::"text"]))),
    CONSTRAINT "official_documents_subtotal_check" CHECK (("subtotal" >= (0)::numeric)),
    CONSTRAINT "official_documents_template_key_check" CHECK (("char_length"(TRIM(BOTH FROM "template_key")) > 0)),
    CONSTRAINT "official_documents_template_version_check" CHECK (("template_version" > 0)),
    CONSTRAINT "official_documents_total_amount_check" CHECK (("total_amount" >= (0)::numeric)),
    CONSTRAINT "official_documents_vat_amount_check" CHECK (("vat_amount" >= (0)::numeric))
);


ALTER TABLE "public"."official_documents" OWNER TO "postgres";


COMMENT ON TABLE "public"."official_documents" IS 'Issued official document registry and immutable snapshot store.';



CREATE TABLE IF NOT EXISTS "public"."order_idempotency_keys" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "idempotency_key" "text" NOT NULL,
    "order_id" "uuid" NOT NULL,
    "request_hash" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."order_idempotency_keys" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."order_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "order_id" "uuid" NOT NULL,
    "product_id" "text" NOT NULL,
    "sku_id" "text" NOT NULL,
    "name" "text" NOT NULL,
    "thumbnail" "text",
    "unit_price" numeric(12,2) NOT NULL,
    "original_unit_price" numeric(12,2),
    "discount_percent" integer DEFAULT 0 NOT NULL,
    "quantity" integer NOT NULL,
    "line_total" numeric(12,2) NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "order_items_check" CHECK ((("original_unit_price" IS NULL) OR ("original_unit_price" >= "unit_price"))),
    CONSTRAINT "order_items_discount_percent_check" CHECK ((("discount_percent" >= 0) AND ("discount_percent" <= 100))),
    CONSTRAINT "order_items_line_total_check" CHECK (("line_total" >= (0)::numeric)),
    CONSTRAINT "order_items_quantity_check" CHECK (("quantity" > 0)),
    CONSTRAINT "order_items_unit_price_check" CHECK (("unit_price" >= (0)::numeric))
);


ALTER TABLE "public"."order_items" OWNER TO "postgres";


COMMENT ON TABLE "public"."order_items" IS 'Snapshot sale line items belonging to an order.';



CREATE TABLE IF NOT EXISTS "public"."orders" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "order_number" "text" DEFAULT ((('ORD-'::"text" || "to_char"("now"(), 'YYYYMMDDHH24MISS'::"text")) || '-'::"text") || "upper"("substr"("replace"(("gen_random_uuid"())::"text", '-'::"text", ''::"text"), 1, 6))) NOT NULL,
    "user_id" "uuid",
    "company_id" "uuid",
    "cart_id" "uuid",
    "checkout_mode" "public"."order_checkout_mode" NOT NULL,
    "payment_method" "public"."order_payment_method",
    "status" "public"."order_status" DEFAULT 'submitted'::"public"."order_status" NOT NULL,
    "address_id" "uuid",
    "address_snapshot" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "subtotal" numeric(12,2) NOT NULL,
    "discount_total" numeric(12,2) DEFAULT 0 NOT NULL,
    "grand_total" numeric(12,2) NOT NULL,
    "currency_code" "text" DEFAULT 'THB'::"text" NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "payment_status" "public"."order_payment_status" NOT NULL,
    "fulfillment_status" "public"."order_fulfillment_status" NOT NULL,
    "shipping_cost" numeric(12,2) DEFAULT 0 NOT NULL,
    "shipping_breakdown" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "tracking_carrier" "text",
    "tracking_number" "text",
    "tracking_note" "text",
    "shipped_at" timestamp with time zone,
    "inventory_applied_at" timestamp with time zone,
    "walk_in_phone" "text",
    "pos_branch_id" "text",
    "pos_branch_code" "text",
    "pos_branch_name" "text",
    "pos_paid_amount" numeric(12,2) DEFAULT 0 NOT NULL,
    "pos_payment_method" "text",
    "pos_staff_user_id" "uuid",
    "inventory_reversed_at" timestamp with time zone,
    "mixed_checkout_session_id" "uuid",
    "mixed_payment_attempt_id" "uuid",
    "shipping_mode" "public"."order_shipping_mode",
    "pickup_branch_id" "text",
    CONSTRAINT "orders_check" CHECK (((("checkout_mode" = 'quotation'::"public"."order_checkout_mode") AND ("payment_method" IS NULL)) OR (("checkout_mode" = 'payment'::"public"."order_checkout_mode") AND ("payment_method" IS NOT NULL)))),
    CONSTRAINT "orders_currency_code_check" CHECK (("char_length"("currency_code") = 3)),
    CONSTRAINT "orders_customer_ref_chk" CHECK ((("user_id" IS NOT NULL) OR ("walk_in_phone" IS NOT NULL) OR (("pos_branch_id" IS NOT NULL) AND ("pos_staff_user_id" IS NOT NULL)))),
    CONSTRAINT "orders_discount_total_check" CHECK (("discount_total" >= (0)::numeric)),
    CONSTRAINT "orders_grand_total_check" CHECK (("grand_total" >= (0)::numeric)),
    CONSTRAINT "orders_pickup_branch_requires_pickup_chk" CHECK ((("pickup_branch_id" IS NULL) OR ("shipping_mode" = 'pickup'::"public"."order_shipping_mode"))),
    CONSTRAINT "orders_pos_paid_amount_check" CHECK (("pos_paid_amount" >= (0)::numeric)),
    CONSTRAINT "orders_pos_payment_method_check" CHECK (("pos_payment_method" = ANY (ARRAY['cash'::"text", 'qr_transfer'::"text", 'bank_transfer'::"text", 'card'::"text", 'other'::"text", 'credit_card'::"text", 'promptpay'::"text", 'company_credit'::"text"]))),
    CONSTRAINT "orders_shipping_cost_check" CHECK (("shipping_cost" >= (0)::numeric)),
    CONSTRAINT "orders_subtotal_check" CHECK (("subtotal" >= (0)::numeric))
);


ALTER TABLE "public"."orders" OWNER TO "postgres";


COMMENT ON TABLE "public"."orders" IS 'Submitted storefront sale orders and quotation requests.';



COMMENT ON COLUMN "public"."orders"."status" IS 'High-level lifecycle status for the order record.';



COMMENT ON COLUMN "public"."orders"."address_snapshot" IS 'Frozen delivery/billing address payload captured at submit time.';



COMMENT ON COLUMN "public"."orders"."payment_status" IS 'Commercial/payment collection status for the order.';



COMMENT ON COLUMN "public"."orders"."fulfillment_status" IS 'Physical fulfillment and delivery status for the order.';



COMMENT ON COLUMN "public"."orders"."shipping_cost" IS 'Shipping fee captured at order submit time. 0 when picking up at branch.';



COMMENT ON COLUMN "public"."orders"."shipping_breakdown" IS 'Bin-pack breakdown: { xl, l, m, s, free, totalFreeUnits }. Empty object when no shipping was charged.';



COMMENT ON COLUMN "public"."orders"."tracking_carrier" IS 'Carrier name entered by admin when shipping (e.g. Kerry, Flash, Thailand Post).';



COMMENT ON COLUMN "public"."orders"."tracking_number" IS 'Carrier tracking number entered by admin; visible to the customer.';



COMMENT ON COLUMN "public"."orders"."tracking_note" IS 'Free-form note from admin to the customer about the shipment.';



COMMENT ON COLUMN "public"."orders"."shipped_at" IS 'First time fulfillment_status transitioned to shipped; set by trigger.';



COMMENT ON COLUMN "public"."orders"."inventory_applied_at" IS 'Timestamp when stock was deducted following payment success. NULL until applied. Used by f_apply_order_inventory for idempotency.';



COMMENT ON COLUMN "public"."orders"."inventory_reversed_at" IS 'Timestamp when POS sale stock deduction was reversed after void/cancel. NULL until reversed.';



COMMENT ON COLUMN "public"."orders"."shipping_mode" IS 'Authoritative sale-order fulfillment method for admin operations queues. NULL means legacy/unknown.';



COMMENT ON COLUMN "public"."orders"."pickup_branch_id" IS 'Branch selected for customer pickup sale orders when the checkout flow provides one.';



COMMENT ON CONSTRAINT "orders_customer_ref_chk" ON "public"."orders" IS 'Requires a customer reference for storefront orders, but permits anonymous branch-scoped staff POS sales.';



CREATE TABLE IF NOT EXISTS "public"."payment_alerts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "order_id" "uuid",
    "payment_attempt_id" "uuid",
    "kind" "text" NOT NULL,
    "audience" "text" NOT NULL,
    "severity" "text" NOT NULL,
    "message" "text" NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "resolved_at" timestamp with time zone,
    "resolved_by" "uuid",
    "booking_id" "uuid",
    "rental_booking_payment_attempt_id" "uuid",
    "mixed_checkout_session_id" "uuid",
    "mixed_payment_attempt_id" "uuid",
    "mixed_payment_allocation_id" "uuid",
    CONSTRAINT "payment_alerts_audience_check" CHECK (("audience" = ANY (ARRAY['admin'::"text", 'user'::"text"]))),
    CONSTRAINT "payment_alerts_severity_check" CHECK (("severity" = ANY (ARRAY['info'::"text", 'warning'::"text", 'error'::"text", 'critical'::"text"])))
);


ALTER TABLE "public"."payment_alerts" OWNER TO "postgres";


COMMENT ON TABLE "public"."payment_alerts" IS 'Operational/user notification queue for payment lifecycle events.';



COMMENT ON COLUMN "public"."payment_alerts"."resolved_at" IS 'When the alert was acknowledged. NULL = open, requires admin attention.';



COMMENT ON COLUMN "public"."payment_alerts"."resolved_by" IS 'Admin user who resolved the alert (manual or auto via tracking save).';



CREATE TABLE IF NOT EXISTS "public"."payment_allocations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "source_type" "text" NOT NULL,
    "source_id" "text" NOT NULL,
    "branch_id" "text",
    "direction" "text" NOT NULL,
    "allocation_type" "text" NOT NULL,
    "status" "text" DEFAULT 'confirmed'::"text" NOT NULL,
    "vat_treatment" "text" DEFAULT 'no_vat'::"text" NOT NULL,
    "net_amount" numeric(12,2) DEFAULT 0 NOT NULL,
    "vat_amount" numeric(12,2) DEFAULT 0 NOT NULL,
    "gross_amount" numeric(12,2) DEFAULT 0 NOT NULL,
    "currency_code" "text" DEFAULT 'THB'::"text" NOT NULL,
    "payment_method" "text",
    "payment_reference" "text" DEFAULT ''::"text" NOT NULL,
    "payment_source_type" "text",
    "payment_source_id" "text",
    "external_reference" "text" DEFAULT ''::"text" NOT NULL,
    "proof_storage_bucket" "text",
    "proof_storage_path" "text",
    "proof_url" "text",
    "payment_attempt_id" "uuid",
    "related_document_id" "uuid",
    "original_allocation_id" "uuid",
    "reversal_of_allocation_id" "uuid",
    "deposit_lifecycle_status" "text",
    "staff_user_id" "uuid",
    "allocated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "idempotency_key" "text",
    "notes" "text" DEFAULT ''::"text" NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "payment_allocations_allocation_type_check" CHECK (("allocation_type" = ANY (ARRAY['security_deposit'::"text", 'rental_advance'::"text", 'sale_payment'::"text", 'remaining_payment'::"text", 'refund'::"text", 'penalty'::"text", 'damage_fee'::"text", 'late_fee'::"text", 'manual_adjustment'::"text"]))),
    CONSTRAINT "payment_allocations_check" CHECK (("abs"(("gross_amount" - ("net_amount" + "vat_amount"))) <= 0.01)),
    CONSTRAINT "payment_allocations_check1" CHECK ((("allocation_type" = 'security_deposit'::"text") OR ("deposit_lifecycle_status" IS NULL))),
    CONSTRAINT "payment_allocations_check2" CHECK ((("allocation_type" <> 'security_deposit'::"text") OR ("deposit_lifecycle_status" IS NOT NULL))),
    CONSTRAINT "payment_allocations_check3" CHECK ((("allocation_type" <> 'refund'::"text") OR (("direction" = 'out'::"text") AND ("original_allocation_id" IS NOT NULL)))),
    CONSTRAINT "payment_allocations_currency_code_check" CHECK (("char_length"("currency_code") = 3)),
    CONSTRAINT "payment_allocations_deposit_lifecycle_status_check" CHECK ((("deposit_lifecycle_status" IS NULL) OR ("deposit_lifecycle_status" = ANY (ARRAY['held'::"text", 'partially_used'::"text", 'refunded'::"text", 'forfeited'::"text", 'cancelled'::"text"])))),
    CONSTRAINT "payment_allocations_direction_check" CHECK (("direction" = ANY (ARRAY['in'::"text", 'out'::"text"]))),
    CONSTRAINT "payment_allocations_gross_amount_check" CHECK (("gross_amount" >= (0)::numeric)),
    CONSTRAINT "payment_allocations_metadata_check" CHECK (("jsonb_typeof"("metadata") = 'object'::"text")),
    CONSTRAINT "payment_allocations_net_amount_check" CHECK (("net_amount" >= (0)::numeric)),
    CONSTRAINT "payment_allocations_source_id_check" CHECK (("char_length"(TRIM(BOTH FROM "source_id")) > 0)),
    CONSTRAINT "payment_allocations_source_type_check" CHECK (("char_length"(TRIM(BOTH FROM "source_type")) > 0)),
    CONSTRAINT "payment_allocations_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'confirmed'::"text", 'cancelled'::"text", 'reversed'::"text"]))),
    CONSTRAINT "payment_allocations_vat_amount_check" CHECK (("vat_amount" >= (0)::numeric)),
    CONSTRAINT "payment_allocations_vat_treatment_check" CHECK (("vat_treatment" = ANY (ARRAY['no_vat'::"text", 'vat_inclusive'::"text", 'vat_exclusive'::"text", 'exempt'::"text", 'out_of_scope'::"text"])))
);


ALTER TABLE "public"."payment_allocations" OWNER TO "postgres";


COMMENT ON TABLE "public"."payment_allocations" IS 'Ledger for payment, deposit, advance, refund, and fee allocations linked to sources and documents.';



CREATE TABLE IF NOT EXISTS "public"."payment_attempts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "order_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "gateway" "public"."payment_gateway" DEFAULT 'omise'::"public"."payment_gateway" NOT NULL,
    "method" "public"."payment_attempt_method" NOT NULL,
    "status" "public"."payment_attempt_status" DEFAULT 'created'::"public"."payment_attempt_status" NOT NULL,
    "amount" numeric(12,2) NOT NULL,
    "currency_code" "text" DEFAULT 'THB'::"text" NOT NULL,
    "idempotency_key" "text" NOT NULL,
    "gateway_charge_id" "text",
    "gateway_source_id" "text",
    "gateway_authorize_uri" "text",
    "qr_image_url" "text",
    "expires_at" timestamp with time zone,
    "failure_code" "text",
    "failure_message" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "raw_gateway_response" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "payment_attempts_amount_check" CHECK (("amount" >= (0)::numeric)),
    CONSTRAINT "payment_attempts_currency_code_check" CHECK (("char_length"("currency_code") = 3))
);


ALTER TABLE "public"."payment_attempts" OWNER TO "postgres";


COMMENT ON TABLE "public"."payment_attempts" IS 'One row per gateway charge attempt; never stores raw card data.';



CREATE TABLE IF NOT EXISTS "public"."payment_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "payment_attempt_id" "uuid",
    "order_id" "uuid",
    "gateway" "public"."payment_gateway" DEFAULT 'omise'::"public"."payment_gateway" NOT NULL,
    "gateway_event_id" "text",
    "event_type" "text" NOT NULL,
    "gateway_charge_id" "text",
    "status" "public"."payment_event_status" DEFAULT 'received'::"public"."payment_event_status" NOT NULL,
    "raw_payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "signature_header" "text",
    "processing_error" "text",
    "received_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "processed_at" timestamp with time zone,
    "booking_id" "uuid",
    "rental_booking_payment_attempt_id" "uuid",
    "mixed_checkout_session_id" "uuid",
    "mixed_payment_attempt_id" "uuid"
);


ALTER TABLE "public"."payment_events" OWNER TO "postgres";


COMMENT ON TABLE "public"."payment_events" IS 'Idempotent raw webhook/event log for gateway callbacks.';



CREATE TABLE IF NOT EXISTS "public"."payment_refunds" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "refund_type" "text" DEFAULT 'rental_booking_deposit'::"text" NOT NULL,
    "booking_id" "uuid" NOT NULL,
    "user_id" "uuid",
    "cancellation_event_id" "uuid",
    "original_payment_source_type" "text" NOT NULL,
    "original_rental_booking_payment_attempt_id" "uuid",
    "original_mixed_payment_allocation_id" "uuid",
    "gateway" "public"."payment_gateway",
    "gateway_charge_id" "text",
    "gateway_payment_reference" "text",
    "refund_amount" numeric(12,2) NOT NULL,
    "currency_code" "text" DEFAULT 'THB'::"text" NOT NULL,
    "refund_bank_name" "text" NOT NULL,
    "refund_bank_account_number" "text" NOT NULL,
    "refund_bank_account_name" "text" NOT NULL,
    "refund_contact_phone" "text" NOT NULL,
    "customer_note" "text",
    "customer_confirmed_destination_at" timestamp with time zone NOT NULL,
    "status" "text" DEFAULT 'pending_admin_review'::"text" NOT NULL,
    "requested_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "processing_at" timestamp with time zone,
    "needs_customer_contact_at" timestamp with time zone,
    "refunded_at" timestamp with time zone,
    "failed_at" timestamp with time zone,
    "processed_by_user_id" "uuid",
    "admin_note" "text",
    "manual_transfer_reference" "text",
    "refund_proof_id" "uuid",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "payment_refunds_check" CHECK ((("status" <> 'processing'::"text") OR ("processing_at" IS NOT NULL))),
    CONSTRAINT "payment_refunds_check1" CHECK ((("status" <> 'needs_customer_contact'::"text") OR ("needs_customer_contact_at" IS NOT NULL))),
    CONSTRAINT "payment_refunds_check2" CHECK ((("status" <> 'refunded'::"text") OR ("refunded_at" IS NOT NULL))),
    CONSTRAINT "payment_refunds_check3" CHECK ((("status" <> 'failed'::"text") OR ("failed_at" IS NOT NULL))),
    CONSTRAINT "payment_refunds_check4" CHECK (((("original_payment_source_type" = 'rental_booking_payment_attempt'::"text") AND ("original_rental_booking_payment_attempt_id" IS NOT NULL)) OR (("original_payment_source_type" = 'mixed_payment_allocation'::"text") AND ("original_mixed_payment_allocation_id" IS NOT NULL)))),
    CONSTRAINT "payment_refunds_currency_code_check" CHECK (("char_length"("currency_code") = 3)),
    CONSTRAINT "payment_refunds_metadata_check" CHECK (("jsonb_typeof"("metadata") = 'object'::"text")),
    CONSTRAINT "payment_refunds_original_payment_source_type_check" CHECK (("original_payment_source_type" = ANY (ARRAY['rental_booking_payment_attempt'::"text", 'mixed_payment_allocation'::"text"]))),
    CONSTRAINT "payment_refunds_refund_amount_check" CHECK (("refund_amount" > (0)::numeric)),
    CONSTRAINT "payment_refunds_refund_bank_account_name_check" CHECK (("char_length"(TRIM(BOTH FROM "refund_bank_account_name")) > 0)),
    CONSTRAINT "payment_refunds_refund_bank_account_number_check" CHECK (("char_length"(TRIM(BOTH FROM "refund_bank_account_number")) > 0)),
    CONSTRAINT "payment_refunds_refund_bank_name_check" CHECK (("char_length"(TRIM(BOTH FROM "refund_bank_name")) > 0)),
    CONSTRAINT "payment_refunds_refund_contact_phone_check" CHECK (("char_length"(TRIM(BOTH FROM "refund_contact_phone")) > 0)),
    CONSTRAINT "payment_refunds_refund_type_check" CHECK (("refund_type" = 'rental_booking_deposit'::"text")),
    CONSTRAINT "payment_refunds_status_check" CHECK (("status" = ANY (ARRAY['pending_admin_review'::"text", 'processing'::"text", 'needs_customer_contact'::"text", 'refunded'::"text", 'failed'::"text"])))
);


ALTER TABLE "public"."payment_refunds" OWNER TO "postgres";


COMMENT ON TABLE "public"."payment_refunds" IS 'Manual refund lifecycle records. Phase C.1A supports Booking Deposit refund obligations only; gateway refunds are intentionally not implemented.';



CREATE TABLE IF NOT EXISTS "public"."product_filter_options" (
    "product_id" "text" NOT NULL,
    "filter_option_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."product_filter_options" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."product_metrics" (
    "product_id" "text" NOT NULL,
    "view_count" integer DEFAULT 0 NOT NULL,
    "add_to_cart_count" integer DEFAULT 0 NOT NULL,
    "order_count" integer DEFAULT 0 NOT NULL,
    "rental_count" integer DEFAULT 0 NOT NULL,
    "wishlist_count" integer DEFAULT 0 NOT NULL,
    "avg_rating" numeric(4,2) DEFAULT 0 NOT NULL,
    "review_count" integer DEFAULT 0 NOT NULL,
    "return_rate" numeric(5,2) DEFAULT 0 NOT NULL,
    "trending_score" numeric(12,2) DEFAULT 0 NOT NULL,
    "last_sold_at" timestamp with time zone,
    "last_rented_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "product_metrics_add_to_cart_count_check" CHECK (("add_to_cart_count" >= 0)),
    CONSTRAINT "product_metrics_avg_rating_check" CHECK ((("avg_rating" >= (0)::numeric) AND ("avg_rating" <= (5)::numeric))),
    CONSTRAINT "product_metrics_order_count_check" CHECK (("order_count" >= 0)),
    CONSTRAINT "product_metrics_rental_count_check" CHECK (("rental_count" >= 0)),
    CONSTRAINT "product_metrics_return_rate_check" CHECK ((("return_rate" >= (0)::numeric) AND ("return_rate" <= (100)::numeric))),
    CONSTRAINT "product_metrics_review_count_check" CHECK (("review_count" >= 0)),
    CONSTRAINT "product_metrics_view_count_check" CHECK (("view_count" >= 0)),
    CONSTRAINT "product_metrics_wishlist_count_check" CHECK (("wishlist_count" >= 0))
);


ALTER TABLE "public"."product_metrics" OWNER TO "postgres";


COMMENT ON TABLE "public"."product_metrics" IS 'Product-level counters and derived merchandising metrics separated from the core products row.';



CREATE TABLE IF NOT EXISTS "public"."product_skus" (
    "id" "text" NOT NULL,
    "product_id" "text" NOT NULL,
    "label_th" "text" NOT NULL,
    "label_en" "text" NOT NULL,
    "label_cn" "text",
    "label_jp" "text",
    "attributes" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "price" numeric(12,2) NOT NULL,
    "original_price" numeric(12,2),
    "discount_percent" integer DEFAULT 0 NOT NULL,
    "stock" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "media_gallery" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "use_product_images" boolean DEFAULT true NOT NULL,
    "sku_code" "text" NOT NULL,
    "currency_code" "text" DEFAULT 'THB'::"text" NOT NULL,
    "promo_start_at" timestamp with time zone,
    "promo_end_at" timestamp with time zone,
    "pricing_tiers" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    CONSTRAINT "product_skus_check" CHECK ((("original_price" IS NULL) OR ("original_price" >= "price"))),
    CONSTRAINT "product_skus_currency_code_check" CHECK (("char_length"("currency_code") = 3)),
    CONSTRAINT "product_skus_discount_percent_check" CHECK ((("discount_percent" >= 0) AND ("discount_percent" <= 100))),
    CONSTRAINT "product_skus_id_check" CHECK (("char_length"("id") > 0)),
    CONSTRAINT "product_skus_price_check" CHECK (("price" >= (0)::numeric)),
    CONSTRAINT "product_skus_pricing_tiers_array_chk" CHECK (("jsonb_typeof"("pricing_tiers") = 'array'::"text")),
    CONSTRAINT "product_skus_promo_window_chk" CHECK ((("promo_end_at" IS NULL) OR ("promo_start_at" IS NULL) OR ("promo_end_at" >= "promo_start_at"))),
    CONSTRAINT "product_skus_stock_check" CHECK (("stock" >= 0))
);


ALTER TABLE "public"."product_skus" OWNER TO "postgres";


COMMENT ON TABLE "public"."product_skus" IS 'Catalog SKU/variant rows. Own pricing, stock, discount, and SKU-specific media.';



COMMENT ON COLUMN "public"."product_skus"."stock" IS 'Compatibility summary derived from pooled sku_branch_inventory available quantity.';



COMMENT ON COLUMN "public"."product_skus"."media_gallery" IS 'Processed SKU-specific image gallery stored as JSONB array.';



COMMENT ON COLUMN "public"."product_skus"."use_product_images" IS 'If true, storefront should ignore SKU gallery and reuse product-level images.';



COMMENT ON COLUMN "public"."product_skus"."sku_code" IS 'Super Admin managed sale SKU/barcode code. Use this field or id as scanner payload.';



COMMENT ON COLUMN "public"."product_skus"."currency_code" IS 'Primary commercial currency for SKU pricing.';



COMMENT ON COLUMN "public"."product_skus"."promo_start_at" IS 'Optional promotion window start for SKU-level offers.';



COMMENT ON COLUMN "public"."product_skus"."promo_end_at" IS 'Optional promotion window end for SKU-level offers.';



COMMENT ON COLUMN "public"."product_skus"."pricing_tiers" IS 'Optional tiered pricing rules stored as JSONB array.';



CREATE TABLE IF NOT EXISTS "public"."products" (
    "id" "text" NOT NULL,
    "slug" "text" NOT NULL,
    "type" "public"."catalog_product_type" NOT NULL,
    "name_th" "text" NOT NULL,
    "name_en" "text" NOT NULL,
    "name_cn" "text",
    "name_jp" "text",
    "description_th" "text" NOT NULL,
    "description_en" "text" NOT NULL,
    "description_cn" "text",
    "description_jp" "text",
    "category_keys" "text"[] DEFAULT ARRAY[]::"text"[] NOT NULL,
    "brand" "text",
    "spec" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "documents" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "supplier_ids" "text"[] DEFAULT ARRAY[]::"text"[] NOT NULL,
    "is_hidden" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "search_vector" "tsvector",
    "main_category_key" "text" DEFAULT 'others'::"text" NOT NULL,
    "tag_keys" "text"[] DEFAULT ARRAY[]::"text"[] NOT NULL,
    "search_keywords" "text"[] DEFAULT ARRAY[]::"text"[] NOT NULL,
    "detail_blocks" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "media_gallery" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "media_links" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "shipping_size" "public"."product_shipping_size" DEFAULT 's'::"public"."product_shipping_size" NOT NULL,
    "filter_keys" "text"[] DEFAULT ARRAY[]::"text"[] NOT NULL,
    CONSTRAINT "products_id_check" CHECK (("char_length"("id") > 0)),
    CONSTRAINT "products_slug_check" CHECK (("char_length"("slug") > 0))
);


ALTER TABLE "public"."products" OWNER TO "postgres";


COMMENT ON TABLE "public"."products" IS 'Catalog product shell with localized content, shared media, and merchandising metadata.';



COMMENT ON COLUMN "public"."products"."type" IS 'Commercial capability: sale, rental, or hybrid.';



COMMENT ON COLUMN "public"."products"."documents" IS 'External document links stored as JSONB array.';



COMMENT ON COLUMN "public"."products"."search_vector" IS 'Weighted tsvector for full-text product search. A=names, B=brand/categories, C=descriptions, D=spec values.';



COMMENT ON COLUMN "public"."products"."main_category_key" IS 'Primary category selected from public.main_categories.';



COMMENT ON COLUMN "public"."products"."tag_keys" IS 'Flexible secondary tags/facets used for future filtering. Stored separately from primary category.';



COMMENT ON COLUMN "public"."products"."search_keywords" IS 'Extra search phrases/aliases curated by admin to improve recall.';



COMMENT ON COLUMN "public"."products"."detail_blocks" IS 'Structured marketing/detail content blocks stored as JSONB for flexible admin authoring.';



COMMENT ON COLUMN "public"."products"."media_gallery" IS 'Processed product image gallery stored as JSONB array with processing status and variant URLs.';



COMMENT ON COLUMN "public"."products"."media_links" IS 'External video/media links (YouTube or similar) stored as JSONB array.';



COMMENT ON COLUMN "public"."products"."shipping_size" IS 'Shipping bucket used to compute the cart shipping fee via free-unit bin-packing.';



COMMENT ON COLUMN "public"."products"."filter_keys" IS 'Denormalized "<group_key>__<option_key>" tokens synced from product_filter_options. Maintained by trigger — do not edit directly.';



CREATE TABLE IF NOT EXISTS "public"."public_contact_settings" (
    "id" boolean DEFAULT true NOT NULL,
    "support_phone" "text" DEFAULT '+66 95-479-2333'::"text" NOT NULL,
    "line_url" "text" DEFAULT 'https://line.me/R/ti/p/@832vmicv?ts=03031436&oat_content=url'::"text" NOT NULL,
    "updated_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "public_contact_settings_id_check" CHECK ("id")
);


ALTER TABLE "public"."public_contact_settings" OWNER TO "postgres";


COMMENT ON TABLE "public"."public_contact_settings" IS 'Single-row public contact settings for ChatFab guest support options.';



COMMENT ON COLUMN "public"."public_contact_settings"."support_phone" IS 'Phone number used by the guest ChatFab call button.';



COMMENT ON COLUMN "public"."public_contact_settings"."line_url" IS 'Line Official add/contact URL used by the guest ChatFab Line button.';



CREATE TABLE IF NOT EXISTS "public"."rental_asset_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "asset_id" "uuid" NOT NULL,
    "booking_id" "uuid",
    "allocation_id" "uuid",
    "actor_user_id" "uuid",
    "event_type" "public"."rental_asset_event_type" NOT NULL,
    "from_status" "public"."rental_asset_status",
    "to_status" "public"."rental_asset_status",
    "from_hub_id" "text",
    "to_hub_id" "text",
    "event_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "notes" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL
);


ALTER TABLE "public"."rental_asset_events" OWNER TO "postgres";


COMMENT ON TABLE "public"."rental_asset_events" IS 'Immutable event ledger for asset status changes, transfers, allocations, and maintenance history.';



CREATE TABLE IF NOT EXISTS "public"."rental_assets" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "asset_code" "text" NOT NULL,
    "sku_id" "text" NOT NULL,
    "hub_id" "text",
    "serial_number" "text",
    "barcode" "text",
    "status" "public"."rental_asset_status" DEFAULT 'available'::"public"."rental_asset_status" NOT NULL,
    "notes" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "rental_assets_asset_code_check" CHECK (("char_length"("asset_code") > 0))
);


ALTER TABLE "public"."rental_assets" OWNER TO "postgres";


COMMENT ON TABLE "public"."rental_assets" IS 'Physical rentable units tracked individually for allocation, return, inspection, and maintenance.';



COMMENT ON COLUMN "public"."rental_assets"."asset_code" IS 'Stable business-facing asset ID used by operations and future staff workflows.';



CREATE TABLE IF NOT EXISTS "public"."rental_booking_assets" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "booking_id" "uuid" NOT NULL,
    "asset_id" "uuid" NOT NULL,
    "allocation_status" "public"."rental_asset_allocation_status" DEFAULT 'allocated'::"public"."rental_asset_allocation_status" NOT NULL,
    "allocated_by" "uuid",
    "allocated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "released_by" "uuid",
    "released_at" timestamp with time zone,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "rental_booking_assets_check" CHECK ((("released_at" IS NULL) OR ("released_at" >= "allocated_at")))
);


ALTER TABLE "public"."rental_booking_assets" OWNER TO "postgres";


COMMENT ON TABLE "public"."rental_booking_assets" IS 'Operational bridge between a commercial booking and the actual physical asset(s) assigned to fulfill it.';



CREATE TABLE IF NOT EXISTS "public"."rental_booking_cancellation_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "booking_id" "uuid" NOT NULL,
    "user_id" "uuid",
    "actor_user_id" "uuid",
    "actor_type" "text" DEFAULT 'customer'::"text" NOT NULL,
    "cancelled_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "cancellation_initiator" "text" NOT NULL,
    "cancellation_source" "text" NOT NULL,
    "cancellation_reason_code" "text",
    "cancellation_reason_note" "text",
    "cancellation_source_event_id" "text",
    "previous_status" "text" NOT NULL,
    "previous_booking_deposit_payment_status" "text",
    "pickup_date_snapshot" "date",
    "cancellation_local_date_snapshot" "date" NOT NULL,
    "refund_cutoff_date_snapshot" "date",
    "refund_policy_version" "text" DEFAULT 'booking_deposit_refund_calendar_day_v1'::"text" NOT NULL,
    "refund_timezone" "text" DEFAULT 'Asia/Bangkok'::"text" NOT NULL,
    "refund_eligible" boolean DEFAULT false NOT NULL,
    "refund_amount_due" numeric(12,2) DEFAULT 0 NOT NULL,
    "qualifies_for_restriction" boolean DEFAULT false NOT NULL,
    "qualifying_cancellation_count_after" integer,
    "restriction_window_started_at" timestamp with time zone,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "rental_booking_cancellation__qualifying_cancellation_coun_check" CHECK ((("qualifying_cancellation_count_after" IS NULL) OR ("qualifying_cancellation_count_after" >= 0))),
    CONSTRAINT "rental_booking_cancellation_events_actor_type_check" CHECK (("actor_type" = ANY (ARRAY['customer'::"text", 'staff'::"text", 'admin'::"text", 'system'::"text"]))),
    CONSTRAINT "rental_booking_cancellation_events_cancellation_initiator_check" CHECK (("cancellation_initiator" = ANY (ARRAY['customer'::"text", 'staff'::"text", 'admin'::"text", 'pos'::"text", 'system'::"text"]))),
    CONSTRAINT "rental_booking_cancellation_events_cancellation_source_check" CHECK (("cancellation_source" = ANY (ARRAY['customer_web'::"text", 'admin_rental_detail'::"text", 'admin_pos'::"text", 'pos_history'::"text", 'system_cleanup'::"text", 'payment_attempt'::"text", 'mixed_checkout'::"text", 'support'::"text"]))),
    CONSTRAINT "rental_booking_cancellation_events_check" CHECK ((("cancellation_initiator" <> 'customer'::"text") OR ("user_id" IS NOT NULL))),
    CONSTRAINT "rental_booking_cancellation_events_check1" CHECK ((("qualifies_for_restriction" = false) OR (("cancellation_initiator" = 'customer'::"text") AND ("user_id" IS NOT NULL)))),
    CONSTRAINT "rental_booking_cancellation_events_metadata_check" CHECK (("jsonb_typeof"("metadata") = 'object'::"text")),
    CONSTRAINT "rental_booking_cancellation_events_previous_status_check" CHECK (("char_length"(TRIM(BOTH FROM "previous_status")) > 0)),
    CONSTRAINT "rental_booking_cancellation_events_refund_amount_due_check" CHECK (("refund_amount_due" >= (0)::numeric)),
    CONSTRAINT "rental_booking_cancellation_events_refund_policy_version_check" CHECK (("char_length"(TRIM(BOTH FROM "refund_policy_version")) > 0)),
    CONSTRAINT "rental_booking_cancellation_events_refund_timezone_check" CHECK (("refund_timezone" = 'Asia/Bangkok'::"text"))
);


ALTER TABLE "public"."rental_booking_cancellation_events" OWNER TO "postgres";


COMMENT ON TABLE "public"."rental_booking_cancellation_events" IS 'Immutable audit events for rental booking cancellation provenance, refund policy snapshots, and excessive-cancellation counting.';



CREATE TABLE IF NOT EXISTS "public"."rental_booking_checklist_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "booking_checklist_id" "uuid" NOT NULL,
    "template_item_id" "uuid",
    "sort_order" integer DEFAULT 0 NOT NULL,
    "label" "text" NOT NULL,
    "instruction" "text",
    "response_type" "public"."rental_checklist_item_response_type" DEFAULT 'check'::"public"."rental_checklist_item_response_type" NOT NULL,
    "is_required" boolean DEFAULT true NOT NULL,
    "result_status" "public"."rental_checklist_item_result" DEFAULT 'pending'::"public"."rental_checklist_item_result" NOT NULL,
    "checked" boolean,
    "response_text" "text",
    "response_number" numeric(12,2),
    "photo_urls" "text"[] DEFAULT ARRAY[]::"text"[] NOT NULL,
    "remark" "text",
    "checked_at" timestamp with time zone,
    "checked_by_user_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."rental_booking_checklist_items" OWNER TO "postgres";


COMMENT ON TABLE "public"."rental_booking_checklist_items" IS 'Execution rows for staff tick/remark state during pickup, return, inspection, and service checklists.';



CREATE TABLE IF NOT EXISTS "public"."rental_booking_checklists" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "booking_id" "uuid" NOT NULL,
    "asset_id" "uuid" NOT NULL,
    "template_id" "uuid",
    "kind" "public"."rental_checklist_kind" NOT NULL,
    "template_name" "text",
    "template_version" integer,
    "status" "public"."rental_checklist_status" DEFAULT 'draft'::"public"."rental_checklist_status" NOT NULL,
    "performed_by_user_id" "uuid",
    "completed_by_user_id" "uuid",
    "started_at" timestamp with time zone,
    "completed_at" timestamp with time zone,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "rental_booking_checklists_check" CHECK ((("completed_at" IS NULL) OR ("started_at" IS NULL) OR ("completed_at" >= "started_at"))),
    CONSTRAINT "rental_booking_checklists_template_version_check" CHECK ((("template_version" IS NULL) OR ("template_version" >= 1)))
);


ALTER TABLE "public"."rental_booking_checklists" OWNER TO "postgres";


COMMENT ON TABLE "public"."rental_booking_checklists" IS 'Booking-linked checklist executions instantiated from asset templates.';



CREATE TABLE IF NOT EXISTS "public"."rental_booking_deposit_action_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "booking_id" "uuid" NOT NULL,
    "action" "text" NOT NULL,
    "staff_user_id" "uuid",
    "branch_id" "text",
    "old_values" "jsonb",
    "new_values" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "change_summary" "text" NOT NULL,
    "reason" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "rental_booking_deposit_action_logs_action_check" CHECK (("action" = ANY (ARRAY['manual_update'::"text", 'pos_create_override'::"text", 'return_refund'::"text"])))
);


ALTER TABLE "public"."rental_booking_deposit_action_logs" OWNER TO "postgres";


COMMENT ON TABLE "public"."rental_booking_deposit_action_logs" IS 'Audit trail for staff-created or manually adjusted rental booking deposit amounts.';



COMMENT ON COLUMN "public"."rental_booking_deposit_action_logs"."staff_user_id" IS 'Staff/admin user who performed the deposit change.';



CREATE TABLE IF NOT EXISTS "public"."rental_booking_deposit_agreements" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "booking_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "payment_attempt_id" "uuid",
    "accepted_terms_version" "text" NOT NULL,
    "terms_snapshot" "text" NOT NULL,
    "accepted_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "ip_address" "inet",
    "user_agent" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "rental_booking_deposit_agreements_accepted_terms_version_check" CHECK (("char_length"(TRIM(BOTH FROM "accepted_terms_version")) > 0)),
    CONSTRAINT "rental_booking_deposit_agreements_metadata_check" CHECK (("jsonb_typeof"("metadata") = 'object'::"text")),
    CONSTRAINT "rental_booking_deposit_agreements_terms_snapshot_check" CHECK (("char_length"(TRIM(BOTH FROM "terms_snapshot")) > 0))
);


ALTER TABLE "public"."rental_booking_deposit_agreements" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."rental_booking_deposit_proofs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "booking_id" "uuid" NOT NULL,
    "proof_kind" "text" DEFAULT 'payment'::"text" NOT NULL,
    "amount" numeric(12,2) DEFAULT 0 NOT NULL,
    "payment_method" "text",
    "file_url" "text" NOT NULL,
    "storage_bucket" "text" DEFAULT 'catalog-media'::"text" NOT NULL,
    "storage_path" "text" NOT NULL,
    "mime_type" "text",
    "file_size_bytes" bigint,
    "notes" "text",
    "created_by_user_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "rental_booking_deposit_proofs_amount_check" CHECK (("amount" >= (0)::numeric)),
    CONSTRAINT "rental_booking_deposit_proofs_file_size_bytes_check" CHECK ((("file_size_bytes" IS NULL) OR ("file_size_bytes" >= 0))),
    CONSTRAINT "rental_booking_deposit_proofs_payment_method_check" CHECK (("payment_method" = ANY (ARRAY['cash'::"text", 'qr_transfer'::"text", 'bank_transfer'::"text", 'card'::"text", 'other'::"text"]))),
    CONSTRAINT "rental_booking_deposit_proofs_proof_kind_check" CHECK (("proof_kind" = ANY (ARRAY['payment'::"text", 'refund'::"text"])))
);


ALTER TABLE "public"."rental_booking_deposit_proofs" OWNER TO "postgres";


COMMENT ON TABLE "public"."rental_booking_deposit_proofs" IS 'Uploaded POS deposit/refund proof files such as transfer slips or cash photos.';



CREATE TABLE IF NOT EXISTS "public"."rental_booking_documents" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "booking_id" "uuid" NOT NULL,
    "booking_checklist_id" "uuid",
    "asset_id" "uuid",
    "document_type" "public"."rental_booking_document_type" DEFAULT 'other'::"public"."rental_booking_document_type" NOT NULL,
    "visibility" "public"."asset_document_visibility" DEFAULT 'internal'::"public"."asset_document_visibility" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "file_url" "text" NOT NULL,
    "file_name" "text",
    "mime_type" "text",
    "file_size_bytes" bigint,
    "amount" numeric(12,2),
    "currency_code" "text" DEFAULT 'THB'::"text" NOT NULL,
    "issued_at" "date",
    "created_by_user_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "storage_bucket" "text",
    "storage_path" "text",
    CONSTRAINT "rental_booking_documents_amount_check" CHECK ((("amount" IS NULL) OR ("amount" >= (0)::numeric))),
    CONSTRAINT "rental_booking_documents_currency_code_check" CHECK (("char_length"("currency_code") = 3)),
    CONSTRAINT "rental_booking_documents_file_size_bytes_check" CHECK ((("file_size_bytes" IS NULL) OR ("file_size_bytes" >= 0)))
);


ALTER TABLE "public"."rental_booking_documents" OWNER TO "postgres";


COMMENT ON TABLE "public"."rental_booking_documents" IS 'Booking-specific documents such as damage evidence, repair records, handover files, and fine documents.';



COMMENT ON COLUMN "public"."rental_booking_documents"."storage_bucket" IS 'Storage bucket where the uploaded file lives (e.g. catalog-media).';



COMMENT ON COLUMN "public"."rental_booking_documents"."storage_path" IS 'Object path inside storage_bucket; used for clean deletion.';



CREATE TABLE IF NOT EXISTS "public"."rental_booking_fulfillments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "booking_id" "uuid" NOT NULL,
    "event_type" "text" NOT NULL,
    "status_after" "public"."rental_booking_status" NOT NULL,
    "signature_url" "text",
    "signature_storage_path" "text",
    "notes" "text",
    "performed_by_user_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "booking_checklist_id" "uuid",
    "branch_id" "text",
    "event_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "idempotency_key" "text",
    CONSTRAINT "rental_booking_fulfillments_event_type_check" CHECK (("event_type" = ANY (ARRAY['pickup'::"text", 'return'::"text"])))
);


ALTER TABLE "public"."rental_booking_fulfillments" OWNER TO "postgres";


COMMENT ON TABLE "public"."rental_booking_fulfillments" IS 'Admin pickup/return audit events including optional customer digital signatures.';



COMMENT ON COLUMN "public"."rental_booking_fulfillments"."booking_checklist_id" IS 'Completed pickup/return checklist used as operational evidence for this fulfillment event.';



COMMENT ON COLUMN "public"."rental_booking_fulfillments"."branch_id" IS 'Branch where staff performed the pickup/return fulfillment event.';



COMMENT ON COLUMN "public"."rental_booking_fulfillments"."event_at" IS 'Business timestamp for the pickup/return event, separate from insert created_at.';



COMMENT ON COLUMN "public"."rental_booking_fulfillments"."idempotency_key" IS 'Optional client/server idempotency key to protect staff retry/double-submit flows.';



CREATE TABLE IF NOT EXISTS "public"."rental_booking_handover_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "booking_id" "uuid" NOT NULL,
    "asset_id" "uuid",
    "item_name" "text" NOT NULL,
    "quantity_prepared" numeric(12,2) DEFAULT 1 NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "preparation_note" "text",
    "pickup_checked" boolean DEFAULT false NOT NULL,
    "quantity_handed_over" numeric(12,2),
    "pickup_checked_at" timestamp with time zone,
    "pickup_checked_by_user_id" "uuid",
    "pickup_note" "text",
    "return_status" "public"."rental_booking_handover_return_status" DEFAULT 'pending'::"public"."rental_booking_handover_return_status" NOT NULL,
    "quantity_returned" numeric(12,2),
    "return_checked_at" timestamp with time zone,
    "return_checked_by_user_id" "uuid",
    "return_note" "text",
    "created_by_user_id" "uuid",
    "updated_by_user_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deleted_at" timestamp with time zone,
    CONSTRAINT "rental_booking_handover_items_name_chk" CHECK (("char_length"(TRIM(BOTH FROM "item_name")) > 0)),
    CONSTRAINT "rental_booking_handover_items_qty_handed_over_chk" CHECK ((("quantity_handed_over" IS NULL) OR ("quantity_handed_over" >= (0)::numeric))),
    CONSTRAINT "rental_booking_handover_items_qty_prepared_chk" CHECK (("quantity_prepared" > (0)::numeric)),
    CONSTRAINT "rental_booking_handover_items_qty_returned_chk" CHECK ((("quantity_returned" IS NULL) OR ("quantity_returned" >= (0)::numeric)))
);


ALTER TABLE "public"."rental_booking_handover_items" OWNER TO "postgres";


COMMENT ON TABLE "public"."rental_booking_handover_items" IS 'Booking-level handover/return item manifest prepared before pickup and reused by POS V2 pickup/return flows.';



COMMENT ON COLUMN "public"."rental_booking_handover_items"."asset_id" IS 'Optional formal rental asset link. Accessory/free-text operational rows may leave this NULL.';



COMMENT ON COLUMN "public"."rental_booking_handover_items"."deleted_at" IS 'Soft-delete marker. Phase 1 APIs only soft-delete rows before pickup.';



CREATE TABLE IF NOT EXISTS "public"."rental_booking_no_show_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "booking_id" "uuid" NOT NULL,
    "admin_user_id" "uuid",
    "marked_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "pickup_date_snapshot" "date" NOT NULL,
    "previous_status" "text" DEFAULT 'confirmed'::"text" NOT NULL,
    "previous_deposit_refund_status" "text",
    "deposit_outcome" "text" DEFAULT 'booking_deposit_forfeited_no_refund'::"text" NOT NULL,
    "reason" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "rental_booking_no_show_events_deposit_outcome_check" CHECK (("deposit_outcome" = 'booking_deposit_forfeited_no_refund'::"text")),
    CONSTRAINT "rental_booking_no_show_events_metadata_check" CHECK (("jsonb_typeof"("metadata") = 'object'::"text")),
    CONSTRAINT "rental_booking_no_show_events_previous_status_check" CHECK (("previous_status" = 'confirmed'::"text"))
);


ALTER TABLE "public"."rental_booking_no_show_events" OWNER TO "postgres";


COMMENT ON TABLE "public"."rental_booking_no_show_events" IS 'Immutable admin no-show events for confirmed rental bookings whose pickup date has passed. No-show retains/forfeits Booking Deposit and does not create payment_refunds rows.';



CREATE TABLE IF NOT EXISTS "public"."rental_booking_payment_attempts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "booking_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "gateway" "public"."payment_gateway" DEFAULT 'omise'::"public"."payment_gateway" NOT NULL,
    "method" "public"."payment_attempt_method" NOT NULL,
    "status" "public"."payment_attempt_status" DEFAULT 'created'::"public"."payment_attempt_status" NOT NULL,
    "amount" numeric(12,2) NOT NULL,
    "currency_code" "text" DEFAULT 'THB'::"text" NOT NULL,
    "idempotency_key" "text" NOT NULL,
    "gateway_charge_id" "text",
    "gateway_source_id" "text",
    "gateway_authorize_uri" "text",
    "qr_image_url" "text",
    "expires_at" timestamp with time zone,
    "failure_code" "text",
    "failure_message" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "raw_gateway_response" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "rental_booking_payment_attempts_amount_check" CHECK (("amount" >= (0)::numeric)),
    CONSTRAINT "rental_booking_payment_attempts_currency_code_check" CHECK (("char_length"("currency_code") = 3)),
    CONSTRAINT "rental_booking_payment_attempts_metadata_check" CHECK (("jsonb_typeof"("metadata") = 'object'::"text")),
    CONSTRAINT "rental_booking_payment_attempts_raw_gateway_response_check" CHECK (("jsonb_typeof"("raw_gateway_response") = 'object'::"text"))
);


ALTER TABLE "public"."rental_booking_payment_attempts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."rental_booking_payment_lines" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "booking_id" "uuid" NOT NULL,
    "line_type" "text" NOT NULL,
    "tax_category" "text" NOT NULL,
    "description_th" "text" NOT NULL,
    "description_en" "text" NOT NULL,
    "gross_amount" numeric(12,2) DEFAULT 0 NOT NULL,
    "wht_applicable" boolean DEFAULT false NOT NULL,
    "wht_rate" numeric(7,6) DEFAULT 0 NOT NULL,
    "wht_amount" numeric(12,2) DEFAULT 0 NOT NULL,
    "net_payable_amount" numeric(12,2) DEFAULT 0 NOT NULL,
    "is_refundable" boolean DEFAULT false NOT NULL,
    "wht_certificate_required" boolean DEFAULT false NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "source" "text" DEFAULT 'system'::"text" NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "applies_to_security_deposit" boolean DEFAULT false NOT NULL,
    "reduces_remaining_security_deposit" boolean DEFAULT false NOT NULL,
    "applied_to_deposit_at" timestamp with time zone,
    "forfeited_at" timestamp with time zone,
    "refunded_at" timestamp with time zone,
    CONSTRAINT "rental_booking_payment_lines_booking_deposit_security_v2_check" CHECK ((("line_type" <> 'booking_deposit'::"text") OR (("tax_category" = 'partial_refundable_security_deposit'::"text") AND ("applies_to_security_deposit" = true) AND ("reduces_remaining_security_deposit" = true)))),
    CONSTRAINT "rental_booking_payment_lines_check" CHECK (("abs"(("net_payable_amount" - ("gross_amount" - "wht_amount"))) <= 0.01)),
    CONSTRAINT "rental_booking_payment_lines_deposit_wht_v2_check" CHECK ((("line_type" <> ALL (ARRAY['booking_deposit'::"text", 'refundable_security_deposit'::"text"])) OR (("tax_category" = ANY (ARRAY['partial_refundable_security_deposit'::"text", 'refundable_security_deposit'::"text"])) AND ("wht_applicable" = false) AND ("wht_rate" = (0)::numeric) AND ("wht_amount" = (0)::numeric) AND ("is_refundable" = true) AND ("wht_certificate_required" = false)))),
    CONSTRAINT "rental_booking_payment_lines_description_en_check" CHECK (("char_length"(TRIM(BOTH FROM "description_en")) > 0)),
    CONSTRAINT "rental_booking_payment_lines_description_th_check" CHECK (("char_length"(TRIM(BOTH FROM "description_th")) > 0)),
    CONSTRAINT "rental_booking_payment_lines_gross_amount_check" CHECK (("gross_amount" >= (0)::numeric)),
    CONSTRAINT "rental_booking_payment_lines_line_type_v2_check" CHECK (("line_type" = ANY (ARRAY['rental_fee'::"text", 'booking_deposit'::"text", 'refundable_security_deposit'::"text", 'delivery_fee'::"text", 'service_fee'::"text", 'insurance_fee'::"text", 'damage_fee'::"text", 'late_fee'::"text"]))),
    CONSTRAINT "rental_booking_payment_lines_metadata_check" CHECK (("jsonb_typeof"("metadata") = 'object'::"text")),
    CONSTRAINT "rental_booking_payment_lines_net_payable_amount_check" CHECK (("net_payable_amount" >= (0)::numeric)),
    CONSTRAINT "rental_booking_payment_lines_source_check" CHECK (("char_length"(TRIM(BOTH FROM "source")) > 0)),
    CONSTRAINT "rental_booking_payment_lines_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'voided'::"text"]))),
    CONSTRAINT "rental_booking_payment_lines_tax_category_v2_check" CHECK (("tax_category" = ANY (ARRAY['rental_income'::"text", 'partial_refundable_security_deposit'::"text", 'refundable_security_deposit'::"text", 'service_income'::"text", 'insurance_or_coverage'::"text", 'damage_compensation'::"text", 'penalty_income'::"text", 'non_taxable'::"text"]))),
    CONSTRAINT "rental_booking_payment_lines_wht_amount_check" CHECK (("wht_amount" >= (0)::numeric)),
    CONSTRAINT "rental_booking_payment_lines_wht_rate_check" CHECK (("wht_rate" >= (0)::numeric))
);


ALTER TABLE "public"."rental_booking_payment_lines" OWNER TO "postgres";


COMMENT ON TABLE "public"."rental_booking_payment_lines" IS 'Phase 1 rental monetary line snapshots for rental fee, refundable security deposit, and future service lines with WHT flags.';



COMMENT ON COLUMN "public"."rental_booking_payment_lines"."line_type" IS 'Business line type such as rental_fee or refundable_security_deposit.';



COMMENT ON COLUMN "public"."rental_booking_payment_lines"."tax_category" IS 'Tax/accounting category. Refundable security deposit is non-income and WHT 0.';



COMMENT ON COLUMN "public"."rental_booking_payment_lines"."applies_to_security_deposit" IS 'True when this line is part of the refundable security deposit lifecycle, including booking_deposit.';



COMMENT ON COLUMN "public"."rental_booking_payment_lines"."reduces_remaining_security_deposit" IS 'True when this paid line reduces the remaining refundable security deposit due at pickup.';



COMMENT ON COLUMN "public"."rental_booking_payment_lines"."applied_to_deposit_at" IS 'Future lifecycle timestamp when Booking Deposit is applied to the pickup security deposit.';



COMMENT ON COLUMN "public"."rental_booking_payment_lines"."forfeited_at" IS 'Future lifecycle timestamp when Booking Deposit is forfeited after cancellation/no-show.';



COMMENT ON COLUMN "public"."rental_booking_payment_lines"."refunded_at" IS 'Future lifecycle timestamp when Booking Deposit is refunded.';



CREATE TABLE IF NOT EXISTS "public"."rental_bookings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "product_id" "text",
    "sku_id" "text",
    "hub_id" "text",
    "product_name" "text" NOT NULL,
    "thumbnail" "text",
    "hub_name" "text",
    "start_date" "date" NOT NULL,
    "end_date" "date" NOT NULL,
    "rental_days" integer NOT NULL,
    "pricing_model" "public"."rental_pricing_model" DEFAULT 'daily'::"public"."rental_pricing_model" NOT NULL,
    "currency_code" "text" DEFAULT 'THB'::"text" NOT NULL,
    "daily_rate" numeric(12,2) NOT NULL,
    "rental_total" numeric(12,2) NOT NULL,
    "deposit_amount" numeric(12,2) DEFAULT 0 NOT NULL,
    "status" "public"."rental_booking_status" DEFAULT 'draft'::"public"."rental_booking_status" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "asset_id" "uuid",
    "asset_code" "text",
    "asset_slug" "text",
    "asset_name" "text",
    "asset_thumbnail" "text",
    "asset_snapshot" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "matched_product_id" "text",
    "matched_product_name" "text",
    "monthly_rate" numeric(12,2) DEFAULT 0 NOT NULL,
    "weekly_rate" numeric(12,2) DEFAULT 0 NOT NULL,
    "pricing_breakdown" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "booker_name" "text",
    "booker_phone" "text",
    "walk_in_phone" "text",
    "deposit_paid_amount" numeric(12,2) DEFAULT 0 NOT NULL,
    "deposit_payment_method" "text",
    "deposit_payment_status" "text" DEFAULT 'unpaid'::"text" NOT NULL,
    "deposit_refund_status" "text" DEFAULT 'not_refunded'::"text" NOT NULL,
    "deposit_paid_at" timestamp with time zone,
    "deposit_refunded_at" timestamp with time zone,
    "deposit_notes" "text",
    "checkout_total_amount" numeric(12,2) DEFAULT 0 NOT NULL,
    "checkout_paid_amount" numeric(12,2) DEFAULT 0 NOT NULL,
    "checkout_payment_method" "text",
    "pos_branch_id" "text",
    "pos_branch_code" "text",
    "pos_branch_name" "text",
    "pos_staff_user_id" "uuid",
    "deposit_refund_amount" numeric(12,2) DEFAULT 0 NOT NULL,
    "deposit_refund_notes" "text",
    "pickup_at" timestamp with time zone,
    "returned_at" timestamp with time zone,
    "pickup_branch_id" "text",
    "return_branch_id" "text",
    "booking_deposit_payment_status" "text" DEFAULT 'unpaid'::"text" NOT NULL,
    "booking_deposit_paid_amount" numeric(12,2) DEFAULT 0 NOT NULL,
    "booking_deposit_paid_at" timestamp with time zone,
    "booking_deposit_payment_attempt_id" "uuid",
    "booking_deposit_policy_version" "text" DEFAULT 'fixed_booking_deposit_v1'::"text" NOT NULL,
    "booking_deposit_terms_accepted_at" timestamp with time zone,
    "booking_deposit_terms_version" "text",
    "booking_deposit_confirm_failed_at" timestamp with time zone,
    "booking_deposit_confirm_failure_reason" "text",
    "booking_deposit_mixed_allocation_id" "uuid",
    "cancelled_at" timestamp with time zone,
    "cancelled_by_user_id" "uuid",
    "cancellation_initiator" "text",
    "cancellation_source" "text",
    "cancellation_reason" "text",
    "cancellation_source_event_id" "uuid",
    "cancellation_refund_eligible" boolean,
    "cancellation_refund_amount_due" numeric(12,2),
    "cancellation_refund_cutoff_date" "date",
    "no_show_at" timestamp with time zone,
    "no_show_marked_by_user_id" "uuid",
    "no_show_reason" "text",
    "no_show_source_event_id" "uuid",
    CONSTRAINT "rental_bookings_asset_snapshot_object_check" CHECK (("jsonb_typeof"("asset_snapshot") = 'object'::"text")),
    CONSTRAINT "rental_bookings_booking_deposit_paid_amount_check" CHECK (("booking_deposit_paid_amount" >= (0)::numeric)),
    CONSTRAINT "rental_bookings_booking_deposit_payment_status_check" CHECK (("booking_deposit_payment_status" = ANY (ARRAY['unpaid'::"text", 'pending'::"text", 'paid'::"text", 'failed'::"text", 'expired'::"text", 'cancelled'::"text", 'paid_confirm_failed'::"text"]))),
    CONSTRAINT "rental_bookings_cancellation_initiator_chk" CHECK ((("cancellation_initiator" IS NULL) OR ("cancellation_initiator" = ANY (ARRAY['customer'::"text", 'staff'::"text", 'admin'::"text", 'pos'::"text", 'system'::"text"])))),
    CONSTRAINT "rental_bookings_cancellation_refund_amount_due_check" CHECK ((("cancellation_refund_amount_due" IS NULL) OR ("cancellation_refund_amount_due" >= (0)::numeric))),
    CONSTRAINT "rental_bookings_cancellation_source_chk" CHECK ((("cancellation_source" IS NULL) OR ("cancellation_source" = ANY (ARRAY['customer_web'::"text", 'admin_rental_detail'::"text", 'admin_pos'::"text", 'pos_history'::"text", 'system_cleanup'::"text", 'payment_attempt'::"text", 'mixed_checkout'::"text", 'support'::"text"])))),
    CONSTRAINT "rental_bookings_check" CHECK (("end_date" >= "start_date")),
    CONSTRAINT "rental_bookings_checkout_paid_amount_check" CHECK (("checkout_paid_amount" >= (0)::numeric)),
    CONSTRAINT "rental_bookings_checkout_payment_method_check" CHECK (("checkout_payment_method" = ANY (ARRAY['cash'::"text", 'qr_transfer'::"text", 'bank_transfer'::"text", 'card'::"text", 'other'::"text"]))),
    CONSTRAINT "rental_bookings_checkout_total_amount_check" CHECK (("checkout_total_amount" >= (0)::numeric)),
    CONSTRAINT "rental_bookings_currency_code_check" CHECK (("char_length"("currency_code") = 3)),
    CONSTRAINT "rental_bookings_customer_ref_chk" CHECK ((("user_id" IS NOT NULL) OR ("walk_in_phone" IS NOT NULL))),
    CONSTRAINT "rental_bookings_daily_rate_check" CHECK (("daily_rate" >= (0)::numeric)),
    CONSTRAINT "rental_bookings_deposit_amount_check" CHECK (("deposit_amount" >= (0)::numeric)),
    CONSTRAINT "rental_bookings_deposit_paid_amount_check" CHECK (("deposit_paid_amount" >= (0)::numeric)),
    CONSTRAINT "rental_bookings_deposit_payment_method_check" CHECK (("deposit_payment_method" = ANY (ARRAY['cash'::"text", 'qr_transfer'::"text", 'bank_transfer'::"text", 'card'::"text", 'other'::"text"]))),
    CONSTRAINT "rental_bookings_deposit_payment_status_check" CHECK (("deposit_payment_status" = ANY (ARRAY['unpaid'::"text", 'pending_review'::"text", 'paid'::"text", 'refunded'::"text", 'partial_refund'::"text"]))),
    CONSTRAINT "rental_bookings_deposit_refund_amount_check" CHECK (("deposit_refund_amount" >= (0)::numeric)),
    CONSTRAINT "rental_bookings_deposit_refund_status_check" CHECK (("deposit_refund_status" = ANY (ARRAY['not_refunded'::"text", 'pending'::"text", 'refunded'::"text", 'forfeited'::"text", 'not_applicable'::"text"]))),
    CONSTRAINT "rental_bookings_rental_days_check" CHECK (("rental_days" > 0)),
    CONSTRAINT "rental_bookings_rental_total_check" CHECK (("rental_total" >= (0)::numeric)),
    CONSTRAINT "rental_bookings_root_chk" CHECK ((("asset_id" IS NOT NULL) OR (("product_id" IS NOT NULL) AND ("sku_id" IS NOT NULL))))
);


ALTER TABLE "public"."rental_bookings" OWNER TO "postgres";


COMMENT ON TABLE "public"."rental_bookings" IS 'Commercial rental booking records with display and pricing snapshots preserved on the row.';



COMMENT ON COLUMN "public"."rental_bookings"."product_id" IS 'Optional. Snapshot of matched product when booking originated from a product/SKU. NULL for asset-only bookings.';



COMMENT ON COLUMN "public"."rental_bookings"."sku_id" IS 'Optional. Snapshot of selected SKU when booking originated from a product/SKU. NULL for asset-only bookings.';



COMMENT ON COLUMN "public"."rental_bookings"."product_name" IS 'Snapshot of localized product name shown to the user when booking was made.';



COMMENT ON COLUMN "public"."rental_bookings"."daily_rate" IS 'Snapshot of the daily rental rate used for the calculation.';



COMMENT ON COLUMN "public"."rental_bookings"."asset_id" IS 'Future booking root. Nullable during migration so legacy product/SKU-rooted rows remain valid.';



COMMENT ON COLUMN "public"."rental_bookings"."asset_code" IS 'Snapshot of asset business code at booking time.';



COMMENT ON COLUMN "public"."rental_bookings"."asset_name" IS 'Snapshot of asset name shown to the customer at booking time.';



COMMENT ON COLUMN "public"."rental_bookings"."asset_snapshot" IS 'JSONB snapshot of asset-facing fields for history and analytics even if the source asset changes later.';



COMMENT ON COLUMN "public"."rental_bookings"."matched_product_id" IS 'Product attribution for the journey that led to the booking, separate from asset identity.';



COMMENT ON COLUMN "public"."rental_bookings"."monthly_rate" IS 'Monthly rate snapshot at the time of booking (0 when not enabled).';



COMMENT ON COLUMN "public"."rental_bookings"."weekly_rate" IS 'Weekly rate snapshot at the time of booking (0 when not enabled).';



COMMENT ON COLUMN "public"."rental_bookings"."pricing_breakdown" IS 'Tiered duration breakdown used to produce rental_total. Shape: { totalDays, currencyCode, lines: [{ unit, count, rate, subtotal }] }.';



COMMENT ON COLUMN "public"."rental_bookings"."booker_name" IS 'Contact name of the person making the rental booking (required at submission).';



COMMENT ON COLUMN "public"."rental_bookings"."booker_phone" IS 'Contact phone of the person making the rental booking (required at submission).';



COMMENT ON COLUMN "public"."rental_bookings"."walk_in_phone" IS 'POS walk-in customer reference. Allows rental bookings before the customer has an auth account.';



COMMENT ON COLUMN "public"."rental_bookings"."deposit_paid_amount" IS 'Actual deposit amount received by staff at POS.';



COMMENT ON COLUMN "public"."rental_bookings"."deposit_payment_method" IS 'How the POS deposit was received: cash, QR transfer, bank transfer, card, or other.';



COMMENT ON COLUMN "public"."rental_bookings"."deposit_payment_status" IS 'Deposit collection state for POS/admin workflows.';



COMMENT ON COLUMN "public"."rental_bookings"."deposit_refund_status" IS 'Deposit return state for return/settlement workflows.';



COMMENT ON COLUMN "public"."rental_bookings"."deposit_refund_amount" IS 'Actual deposit amount to refund/refunded during POS return settlement.';



COMMENT ON COLUMN "public"."rental_bookings"."deposit_refund_notes" IS 'Staff notes or accounting reference for deposit refund settlement.';



COMMENT ON COLUMN "public"."rental_bookings"."pickup_at" IS 'Actual operational pickup timestamp recorded by server-side fulfillment.';



COMMENT ON COLUMN "public"."rental_bookings"."returned_at" IS 'Actual operational return timestamp recorded by server-side fulfillment.';



COMMENT ON COLUMN "public"."rental_bookings"."pickup_branch_id" IS 'Actual branch where pickup was completed.';



COMMENT ON COLUMN "public"."rental_bookings"."return_branch_id" IS 'Actual branch where return was completed.';



COMMENT ON COLUMN "public"."rental_bookings"."booking_deposit_payment_status" IS 'Phase 3 online Booking Deposit payment state. Main booking status remains draft until confirm validation succeeds.';



COMMENT ON COLUMN "public"."rental_bookings"."cancellation_source_event_id" IS 'Latest cancellation provenance event. Do not infer qualifying customer cancellations from status = cancelled alone.';



COMMENT ON COLUMN "public"."rental_bookings"."no_show_at" IS 'Timestamp when staff marked this confirmed rental booking as no-show.';



COMMENT ON COLUMN "public"."rental_bookings"."no_show_marked_by_user_id" IS 'Staff/admin user who marked this rental booking as no-show.';



COMMENT ON COLUMN "public"."rental_bookings"."no_show_reason" IS 'Optional staff note explaining the no-show decision.';



COMMENT ON COLUMN "public"."rental_bookings"."no_show_source_event_id" IS 'Immutable no-show event proving the operational no-show and Booking Deposit no-refund outcome.';



CREATE TABLE IF NOT EXISTS "public"."service_providers" (
    "provider_id" "text" NOT NULL,
    "provider_type" "text" NOT NULL,
    "is_verified" boolean DEFAULT false NOT NULL,
    "contact_phone" "text",
    "contact_email" "text",
    "google_maps_url" "text",
    "kyc_documents" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "line_id" "text",
    "line_url" "text",
    CONSTRAINT "service_providers_contact_email_check" CHECK ((("contact_email" IS NULL) OR ("contact_email" ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'::"text"))),
    CONSTRAINT "service_providers_kyc_documents_check" CHECK ((("kyc_documents" IS NULL) OR ("jsonb_typeof"("kyc_documents") = 'object'::"text"))),
    CONSTRAINT "service_providers_line_id_format" CHECK ((("line_id" IS NULL) OR ("line_id" ~ '^@?[A-Za-z0-9._-]{2,64}$'::"text"))),
    CONSTRAINT "service_providers_line_url_format" CHECK ((("line_url" IS NULL) OR ("line_url" ~* '^https://(line\.me|lin\.ee|[A-Za-z0-9.-]+\.line\.me)(/|$)'::"text"))),
    CONSTRAINT "service_providers_provider_id_check" CHECK (("provider_id" ~ '^[0-9]{13}$'::"text")),
    CONSTRAINT "service_providers_provider_type_check" CHECK (("provider_type" = ANY (ARRAY['individual'::"text", 'company'::"text"])))
);


ALTER TABLE "public"."service_providers" OWNER TO "postgres";


COMMENT ON TABLE "public"."service_providers" IS 'Service provider identity/contact/KYC records. provider_id is Thai Citizen ID or Juristic ID (13 digits).';



COMMENT ON COLUMN "public"."service_providers"."kyc_documents" IS 'JSON object of KYC document metadata/path values for files stored in the catalog-media bucket.';



COMMENT ON COLUMN "public"."service_providers"."line_id" IS 'Optional Line ID, e.g. @hopnic or personal Line ID. Public storefront builds a line.me URL after validation.';



COMMENT ON COLUMN "public"."service_providers"."line_url" IS 'Optional full Line contact URL. Must be an HTTPS line.me/lin.ee URL.';



CREATE TABLE IF NOT EXISTS "public"."sku_branch_inventory" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "product_id" "text" NOT NULL,
    "sku_id" "text" NOT NULL,
    "branch_id" "text" NOT NULL,
    "branch_code" "text",
    "branch_name" "text" NOT NULL,
    "on_hand" integer DEFAULT 0 NOT NULL,
    "available" integer DEFAULT 0 NOT NULL,
    "reserved" integer DEFAULT 0 NOT NULL,
    "incoming" integer DEFAULT 0 NOT NULL,
    "safety_stock" integer DEFAULT 0 NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "inventory_id" "uuid" NOT NULL,
    "inventory_kind" "public"."sku_inventory_kind" DEFAULT 'shared'::"public"."sku_inventory_kind" NOT NULL,
    CONSTRAINT "sku_branch_inventory_new_available_check" CHECK (("available" >= 0)),
    CONSTRAINT "sku_branch_inventory_new_branch_id_check" CHECK (("char_length"(TRIM(BOTH FROM "branch_id")) > 0)),
    CONSTRAINT "sku_branch_inventory_new_branch_name_check" CHECK (("char_length"(TRIM(BOTH FROM "branch_name")) > 0)),
    CONSTRAINT "sku_branch_inventory_new_check" CHECK (("available" <= "on_hand")),
    CONSTRAINT "sku_branch_inventory_new_check1" CHECK (("reserved" <= "on_hand")),
    CONSTRAINT "sku_branch_inventory_new_check2" CHECK ((("available" + "reserved") <= "on_hand")),
    CONSTRAINT "sku_branch_inventory_new_incoming_check" CHECK (("incoming" >= 0)),
    CONSTRAINT "sku_branch_inventory_new_on_hand_check" CHECK (("on_hand" >= 0)),
    CONSTRAINT "sku_branch_inventory_new_reserved_check" CHECK (("reserved" >= 0)),
    CONSTRAINT "sku_branch_inventory_new_safety_stock_check" CHECK (("safety_stock" >= 0))
);


ALTER TABLE "public"."sku_branch_inventory" OWNER TO "postgres";


COMMENT ON TABLE "public"."sku_branch_inventory" IS 'Source-of-truth per-branch pooled inventory rows for each SKU.';



CREATE TABLE IF NOT EXISTS "public"."store_branches" (
    "id" "text" NOT NULL,
    "code" "text" NOT NULL,
    "name_th" "text" NOT NULL,
    "name_en" "text" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "address_th" "text" DEFAULT ''::"text" NOT NULL,
    "address_en" "text" DEFAULT ''::"text" NOT NULL,
    "phone" "text" DEFAULT ''::"text" NOT NULL,
    "email" "text" DEFAULT ''::"text" NOT NULL,
    "latitude" double precision,
    "longitude" double precision,
    "notes" "text" DEFAULT ''::"text" NOT NULL,
    CONSTRAINT "store_branches_code_check" CHECK (("char_length"(TRIM(BOTH FROM "code")) > 0)),
    CONSTRAINT "store_branches_id_check" CHECK (("char_length"(TRIM(BOTH FROM "id")) > 0)),
    CONSTRAINT "store_branches_name_en_check" CHECK (("char_length"(TRIM(BOTH FROM "name_en")) > 0)),
    CONSTRAINT "store_branches_name_th_check" CHECK (("char_length"(TRIM(BOTH FROM "name_th")) > 0))
);


ALTER TABLE "public"."store_branches" OWNER TO "postgres";


COMMENT ON TABLE "public"."store_branches" IS 'Master branch/store rows reused by admin inventory linking and future storefront hub selection.';



COMMENT ON COLUMN "public"."store_branches"."code" IS 'Short display code for the branch.';



COMMENT ON COLUMN "public"."store_branches"."address_th" IS 'Full Thai-language address for storefront pickup display.';



COMMENT ON COLUMN "public"."store_branches"."address_en" IS 'Full English-language address for storefront pickup display.';



COMMENT ON COLUMN "public"."store_branches"."phone" IS 'Branch contact phone number.';



COMMENT ON COLUMN "public"."store_branches"."email" IS 'Branch contact email.';



COMMENT ON COLUMN "public"."store_branches"."latitude" IS 'GPS latitude for map display.';



COMMENT ON COLUMN "public"."store_branches"."longitude" IS 'GPS longitude for map display.';



CREATE TABLE IF NOT EXISTS "public"."system_configs" (
    "key" "text" NOT NULL,
    "value" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "description" "text" DEFAULT ''::"text" NOT NULL,
    "updated_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "system_configs_key_check" CHECK (("char_length"(TRIM(BOTH FROM "key")) > 0)),
    CONSTRAINT "system_configs_value_check" CHECK (("jsonb_typeof"("value") = 'object'::"text"))
);


ALTER TABLE "public"."system_configs" OWNER TO "postgres";


COMMENT ON TABLE "public"."system_configs" IS 'Global key/value system configuration. Use for document_company_profile and future flexible config.';



CREATE TABLE IF NOT EXISTS "public"."user_save_list" (
    "user_id" "uuid" NOT NULL,
    "item_type" "text" NOT NULL,
    "asset_id" "uuid",
    "service_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "user_save_list_check" CHECK (((("item_type" = 'asset'::"text") AND ("asset_id" IS NOT NULL) AND ("service_id" IS NULL)) OR (("item_type" = 'service'::"text") AND ("service_id" IS NOT NULL) AND ("asset_id" IS NULL)))),
    CONSTRAINT "user_save_list_item_type_check" CHECK (("item_type" = ANY (ARRAY['asset'::"text", 'service'::"text"])))
);


ALTER TABLE "public"."user_save_list" OWNER TO "postgres";


COMMENT ON TABLE "public"."user_save_list" IS 'Rental assets and service content pages each authenticated user saved for later.';



CREATE TABLE IF NOT EXISTS "public"."user_wishlist" (
    "user_id" "uuid" NOT NULL,
    "product_id" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."user_wishlist" OWNER TO "postgres";


COMMENT ON TABLE "public"."user_wishlist" IS 'Products each authenticated user marked as interested/wishlisted.';



CREATE TABLE IF NOT EXISTS "public"."users" (
    "id" "uuid" NOT NULL,
    "full_name" "text",
    "phone" "text",
    "avatar_url" "text",
    "platform_role" "public"."platform_role" DEFAULT 'customer'::"public"."platform_role" NOT NULL,
    "membership_level" "public"."membership_level" DEFAULT 'bronze'::"public"."membership_level" NOT NULL,
    "kyc_status" "public"."kyc_status" DEFAULT 'pending'::"public"."kyc_status" NOT NULL,
    "id_card_url" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "pdpa_consent_url" "text",
    "pdpa_consented_at" timestamp with time zone,
    "kyc_rejection_reason" "text",
    "account_status" "text" DEFAULT 'active'::"text" NOT NULL,
    "deactivation_requested_at" timestamp with time zone,
    "deletion_requested_at" timestamp with time zone,
    "deleted_at" timestamp with time zone,
    "anonymized_at" timestamp with time zone,
    "deletion_reason" "text",
    "lifecycle_note" "text",
    "lifecycle_updated_at" timestamp with time zone,
    "lifecycle_updated_by" "uuid",
    "rental_booking_restriction_status" "text" DEFAULT 'none'::"text" NOT NULL,
    "rental_booking_restriction_applied_at" timestamp with time zone,
    "rental_booking_restriction_reason" "text",
    "rental_booking_restriction_source_event_id" "uuid",
    "rental_booking_restriction_cancellation_count" integer DEFAULT 0 NOT NULL,
    "rental_booking_restriction_window_started_at" timestamp with time zone,
    "rental_booking_restriction_overridden_at" timestamp with time zone,
    "rental_booking_restriction_overridden_by" "uuid",
    "rental_booking_restriction_override_reason" "text",
    "rental_booking_restriction_unrestricted_at" timestamp with time zone,
    "rental_booking_restriction_unrestricted_by" "uuid",
    CONSTRAINT "users_account_status_chk" CHECK (("account_status" = ANY (ARRAY['active'::"text", 'deactivated'::"text", 'deletion_requested'::"text", 'anonymized'::"text", 'deleted'::"text"]))),
    CONSTRAINT "users_anonymized_state_timestamp_chk" CHECK ((("account_status" <> 'anonymized'::"text") OR ("anonymized_at" IS NOT NULL))),
    CONSTRAINT "users_deleted_state_timestamp_chk" CHECK ((("account_status" <> 'deleted'::"text") OR ("deleted_at" IS NOT NULL))),
    CONSTRAINT "users_rental_booking_restricted_timestamp_chk" CHECK ((("rental_booking_restriction_status" <> 'restricted'::"text") OR ("rental_booking_restriction_applied_at" IS NOT NULL))),
    CONSTRAINT "users_rental_booking_restriction_cancellation_count_check" CHECK (("rental_booking_restriction_cancellation_count" >= 0)),
    CONSTRAINT "users_rental_booking_restriction_status_chk" CHECK (("rental_booking_restriction_status" = ANY (ARRAY['none'::"text", 'restricted'::"text", 'overridden'::"text", 'unrestricted'::"text"])))
);


ALTER TABLE "public"."users" OWNER TO "postgres";


COMMENT ON TABLE "public"."users" IS 'User profile linked 1:1 to auth.users. Everyone starts as B2C.';



COMMENT ON COLUMN "public"."users"."kyc_status" IS 'B2C KYC Status: pending, verified, rejected';



COMMENT ON COLUMN "public"."users"."id_card_url" IS 'URL to the uploaded ID card image in Storage';



COMMENT ON COLUMN "public"."users"."pdpa_consent_url" IS 'URL of PDPA terms document the user agreed to';



COMMENT ON COLUMN "public"."users"."pdpa_consented_at" IS 'Timestamp when user gave PDPA consent';



COMMENT ON COLUMN "public"."users"."kyc_rejection_reason" IS 'Reason for KYC rejection (set by admin only)';



COMMENT ON COLUMN "public"."users"."account_status" IS 'Non-destructive account lifecycle status. Do not hard-delete auth.users for customer deletion requests.';



COMMENT ON COLUMN "public"."users"."deactivation_requested_at" IS 'Timestamp when the user requested temporary deactivation.';



COMMENT ON COLUMN "public"."users"."deletion_requested_at" IS 'Timestamp when the user requested account deletion under PDPA/GDPR-style processes.';



COMMENT ON COLUMN "public"."users"."deleted_at" IS 'Timestamp when the account was soft-deleted. Legal transaction records remain retained.';



COMMENT ON COLUMN "public"."users"."anonymized_at" IS 'Timestamp when personally identifiable profile fields were anonymized.';



COMMENT ON COLUMN "public"."users"."deletion_reason" IS 'Optional user/admin supplied deletion reason retained for lifecycle audit.';



COMMENT ON COLUMN "public"."users"."lifecycle_note" IS 'Internal lifecycle processing note. Do not expose as editable profile data.';



COMMENT ON COLUMN "public"."users"."lifecycle_updated_at" IS 'Timestamp of the latest lifecycle state transition.';



COMMENT ON COLUMN "public"."users"."lifecycle_updated_by" IS 'Staff/service user that processed the latest lifecycle state transition.';



COMMENT ON COLUMN "public"."users"."rental_booking_restriction_status" IS 'Dedicated online rental booking restriction status. Do not overload account_status for excessive-cancellation restrictions.';



CREATE TABLE IF NOT EXISTS "public"."walk_in_customers" (
    "phone" "text" NOT NULL,
    "full_name" "text",
    "linked_user_id" "uuid",
    "id_card_url" "text",
    "id_card_storage_path" "text",
    "notes" "text",
    "created_by_user_id" "uuid",
    "updated_by_user_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "walk_in_customers_phone_check" CHECK (("char_length"(TRIM(BOTH FROM "phone")) > 0))
);


ALTER TABLE "public"."walk_in_customers" OWNER TO "postgres";


COMMENT ON TABLE "public"."walk_in_customers" IS 'Phone-primary customer records captured by admins for walk-in bookings before an auth account exists.';



COMMENT ON COLUMN "public"."walk_in_customers"."id_card_storage_path" IS 'Storage path in catalog-media under customer-ids/ used for cleanup/audit.';



CREATE TABLE IF NOT EXISTS "storage"."buckets" (
    "id" "text" NOT NULL,
    "name" "text" NOT NULL,
    "owner" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "public" boolean DEFAULT false,
    "avif_autodetection" boolean DEFAULT false,
    "file_size_limit" bigint,
    "allowed_mime_types" "text"[],
    "owner_id" "text",
    "type" "storage"."buckettype" DEFAULT 'STANDARD'::"storage"."buckettype" NOT NULL
);


ALTER TABLE "storage"."buckets" OWNER TO "supabase_storage_admin";


COMMENT ON COLUMN "storage"."buckets"."owner" IS 'Field is deprecated, use owner_id instead';



CREATE TABLE IF NOT EXISTS "storage"."buckets_analytics" (
    "name" "text" NOT NULL,
    "type" "storage"."buckettype" DEFAULT 'ANALYTICS'::"storage"."buckettype" NOT NULL,
    "format" "text" DEFAULT 'ICEBERG'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "deleted_at" timestamp with time zone
);


ALTER TABLE "storage"."buckets_analytics" OWNER TO "supabase_storage_admin";


CREATE TABLE IF NOT EXISTS "storage"."buckets_vectors" (
    "id" "text" NOT NULL,
    "type" "storage"."buckettype" DEFAULT 'VECTOR'::"storage"."buckettype" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "storage"."buckets_vectors" OWNER TO "supabase_storage_admin";


CREATE TABLE IF NOT EXISTS "storage"."iceberg_namespaces" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "bucket_name" "text" NOT NULL,
    "name" "text" NOT NULL COLLATE "pg_catalog"."C",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "catalog_id" "uuid" NOT NULL
);


ALTER TABLE "storage"."iceberg_namespaces" OWNER TO "supabase_storage_admin";


CREATE TABLE IF NOT EXISTS "storage"."iceberg_tables" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "namespace_id" "uuid" NOT NULL,
    "bucket_name" "text" NOT NULL,
    "name" "text" NOT NULL COLLATE "pg_catalog"."C",
    "location" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "remote_table_id" "text",
    "shard_key" "text",
    "shard_id" "text",
    "catalog_id" "uuid" NOT NULL
);


ALTER TABLE "storage"."iceberg_tables" OWNER TO "supabase_storage_admin";


CREATE TABLE IF NOT EXISTS "storage"."migrations" (
    "id" integer NOT NULL,
    "name" character varying(100) NOT NULL,
    "hash" character varying(40) NOT NULL,
    "executed_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE "storage"."migrations" OWNER TO "supabase_storage_admin";


CREATE TABLE IF NOT EXISTS "storage"."objects" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "bucket_id" "text",
    "name" "text",
    "owner" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "last_accessed_at" timestamp with time zone DEFAULT "now"(),
    "metadata" "jsonb",
    "path_tokens" "text"[] GENERATED ALWAYS AS ("string_to_array"("name", '/'::"text")) STORED,
    "version" "text",
    "owner_id" "text",
    "user_metadata" "jsonb"
);


ALTER TABLE "storage"."objects" OWNER TO "supabase_storage_admin";


COMMENT ON COLUMN "storage"."objects"."owner" IS 'Field is deprecated, use owner_id instead';



CREATE TABLE IF NOT EXISTS "storage"."s3_multipart_uploads" (
    "id" "text" NOT NULL,
    "in_progress_size" bigint DEFAULT 0 NOT NULL,
    "upload_signature" "text" NOT NULL,
    "bucket_id" "text" NOT NULL,
    "key" "text" NOT NULL COLLATE "pg_catalog"."C",
    "version" "text" NOT NULL,
    "owner_id" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "user_metadata" "jsonb"
);


ALTER TABLE "storage"."s3_multipart_uploads" OWNER TO "supabase_storage_admin";


CREATE TABLE IF NOT EXISTS "storage"."s3_multipart_uploads_parts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "upload_id" "text" NOT NULL,
    "size" bigint DEFAULT 0 NOT NULL,
    "part_number" integer NOT NULL,
    "bucket_id" "text" NOT NULL,
    "key" "text" NOT NULL COLLATE "pg_catalog"."C",
    "etag" "text" NOT NULL,
    "owner_id" "text",
    "version" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "storage"."s3_multipart_uploads_parts" OWNER TO "supabase_storage_admin";


CREATE TABLE IF NOT EXISTS "storage"."vector_indexes" (
    "id" "text" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL COLLATE "pg_catalog"."C",
    "bucket_id" "text" NOT NULL,
    "data_type" "text" NOT NULL,
    "dimension" integer NOT NULL,
    "distance_metric" "text" NOT NULL,
    "metadata_configuration" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "storage"."vector_indexes" OWNER TO "supabase_storage_admin";


ALTER TABLE ONLY "public"."addresses"
    ADD CONSTRAINT "addresses_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."admin_user_branch_access"
    ADD CONSTRAINT "admin_user_branch_access_pkey" PRIMARY KEY ("user_id", "branch_id");



ALTER TABLE ONLY "public"."agreement_acceptance_logs"
    ADD CONSTRAINT "agreement_acceptance_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."agreement_evidence_files"
    ADD CONSTRAINT "agreement_evidence_files_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."agreement_versions"
    ADD CONSTRAINT "agreement_versions_agreement_type_version_key" UNIQUE ("agreement_type", "version");



ALTER TABLE ONLY "public"."agreement_versions"
    ADD CONSTRAINT "agreement_versions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."asset_branch_inventory"
    ADD CONSTRAINT "asset_branch_inventory_asset_id_inventory_id_key" UNIQUE ("asset_id", "inventory_id");



ALTER TABLE ONLY "public"."asset_branch_inventory"
    ADD CONSTRAINT "asset_branch_inventory_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."asset_checklist_template_items"
    ADD CONSTRAINT "asset_checklist_template_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."asset_checklist_templates"
    ADD CONSTRAINT "asset_checklist_templates_asset_id_kind_name_version_key" UNIQUE ("asset_id", "kind", "name", "version");



ALTER TABLE ONLY "public"."asset_checklist_templates"
    ADD CONSTRAINT "asset_checklist_templates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."asset_documents"
    ADD CONSTRAINT "asset_documents_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."asset_filter_options"
    ADD CONSTRAINT "asset_filter_options_pkey" PRIMARY KEY ("asset_id", "filter_option_id");



ALTER TABLE ONLY "public"."asset_matches"
    ADD CONSTRAINT "asset_matches_asset_id_product_id_key" UNIQUE ("asset_id", "product_id");



ALTER TABLE ONLY "public"."asset_matches"
    ADD CONSTRAINT "asset_matches_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."asset_service_events"
    ADD CONSTRAINT "asset_service_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."assets"
    ADD CONSTRAINT "assets_code_key" UNIQUE ("code");



ALTER TABLE ONLY "public"."assets"
    ADD CONSTRAINT "assets_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."assets"
    ADD CONSTRAINT "assets_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."branch_document_settings"
    ADD CONSTRAINT "branch_document_settings_pkey" PRIMARY KEY ("branch_id");



ALTER TABLE ONLY "public"."cart_items"
    ADD CONSTRAINT "cart_items_cart_id_product_id_sku_id_key" UNIQUE ("cart_id", "product_id", "sku_id");



ALTER TABLE ONLY "public"."cart_items"
    ADD CONSTRAINT "cart_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."carts"
    ADD CONSTRAINT "carts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."carts"
    ADD CONSTRAINT "carts_user_id_key" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."catalog_terms"
    ADD CONSTRAINT "catalog_terms_kind_normalized_value_key" UNIQUE ("kind", "normalized_value");



ALTER TABLE ONLY "public"."catalog_terms"
    ADD CONSTRAINT "catalog_terms_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."chat_attachments"
    ADD CONSTRAINT "chat_attachments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."chat_attachments"
    ADD CONSTRAINT "chat_attachments_storage_bucket_storage_path_key" UNIQUE ("storage_bucket", "storage_path");



ALTER TABLE ONLY "public"."chat_conversations"
    ADD CONSTRAINT "chat_conversations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."chat_messages"
    ADD CONSTRAINT "chat_messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."chat_participants"
    ADD CONSTRAINT "chat_participants_pkey" PRIMARY KEY ("conversation_id", "user_id");



ALTER TABLE ONLY "public"."companies"
    ADD CONSTRAINT "companies_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."companies"
    ADD CONSTRAINT "companies_tax_id_key" UNIQUE ("tax_id");



ALTER TABLE ONLY "public"."company_members"
    ADD CONSTRAINT "company_members_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."company_members"
    ADD CONSTRAINT "company_members_user_id_company_id_key" UNIQUE ("user_id", "company_id");



ALTER TABLE ONLY "public"."content_page_assets"
    ADD CONSTRAINT "content_page_assets_pkey" PRIMARY KEY ("content_page_id", "asset_id");



ALTER TABLE ONLY "public"."content_page_products"
    ADD CONSTRAINT "content_page_products_pkey" PRIMARY KEY ("content_page_id", "product_id");



ALTER TABLE ONLY "public"."content_pages"
    ADD CONSTRAINT "content_pages_content_type_slug_key" UNIQUE ("content_type", "slug");



ALTER TABLE ONLY "public"."content_pages"
    ADD CONSTRAINT "content_pages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."customer_tax_profiles"
    ADD CONSTRAINT "customer_tax_profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."document_events"
    ADD CONSTRAINT "document_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."document_sequences"
    ADD CONSTRAINT "document_sequences_document_type_sequence_key_period_key" UNIQUE ("document_type", "sequence_key", "period");



ALTER TABLE ONLY "public"."document_sequences"
    ADD CONSTRAINT "document_sequences_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."filter_groups"
    ADD CONSTRAINT "filter_groups_main_key_unique" UNIQUE ("main_category_key", "key");



ALTER TABLE ONLY "public"."filter_groups"
    ADD CONSTRAINT "filter_groups_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."filter_options"
    ADD CONSTRAINT "filter_options_group_key_unique" UNIQUE ("group_id", "key");



ALTER TABLE ONLY "public"."filter_options"
    ADD CONSTRAINT "filter_options_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."home_banners"
    ADD CONSTRAINT "home_banners_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."home_category_groups"
    ADD CONSTRAINT "home_category_groups_main_category_key_key" UNIQUE ("main_category_key");



ALTER TABLE ONLY "public"."home_category_groups"
    ADD CONSTRAINT "home_category_groups_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."home_category_options"
    ADD CONSTRAINT "home_category_options_group_id_option_key_key" UNIQUE ("group_id", "option_key");



ALTER TABLE ONLY "public"."home_category_options"
    ADD CONSTRAINT "home_category_options_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."home_featured_assets"
    ADD CONSTRAINT "home_featured_assets_asset_id_key" UNIQUE ("asset_id");



ALTER TABLE ONLY "public"."home_featured_assets"
    ADD CONSTRAINT "home_featured_assets_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."home_featured_products"
    ADD CONSTRAINT "home_featured_products_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."home_featured_products"
    ADD CONSTRAINT "home_featured_products_product_id_key" UNIQUE ("product_id");



ALTER TABLE ONLY "public"."home_link_cards"
    ADD CONSTRAINT "home_link_cards_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."home_partner_logos"
    ADD CONSTRAINT "home_partner_logos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."inventories"
    ADD CONSTRAINT "inventories_branch_id_name_key" UNIQUE ("branch_id", "name");



ALTER TABLE ONLY "public"."inventories"
    ADD CONSTRAINT "inventories_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."inventory_change_log"
    ADD CONSTRAINT "inventory_change_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."main_categories"
    ADD CONSTRAINT "main_categories_pkey" PRIMARY KEY ("key");



ALTER TABLE ONLY "public"."mixed_checkout_sessions"
    ADD CONSTRAINT "mixed_checkout_sessions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."mixed_checkout_sessions"
    ADD CONSTRAINT "mixed_checkout_sessions_user_id_idempotency_key_key" UNIQUE ("user_id", "idempotency_key");



ALTER TABLE ONLY "public"."mixed_payment_allocations"
    ADD CONSTRAINT "mixed_payment_allocations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."mixed_payment_attempts"
    ADD CONSTRAINT "mixed_payment_attempts_mixed_checkout_session_id_idempotenc_key" UNIQUE ("mixed_checkout_session_id", "idempotency_key");



ALTER TABLE ONLY "public"."mixed_payment_attempts"
    ADD CONSTRAINT "mixed_payment_attempts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."official_documents"
    ADD CONSTRAINT "official_documents_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."order_idempotency_keys"
    ADD CONSTRAINT "order_idempotency_keys_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."order_idempotency_keys"
    ADD CONSTRAINT "order_idempotency_keys_user_id_idempotency_key_key" UNIQUE ("user_id", "idempotency_key");



ALTER TABLE ONLY "public"."order_items"
    ADD CONSTRAINT "order_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_order_number_key" UNIQUE ("order_number");



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."payment_alerts"
    ADD CONSTRAINT "payment_alerts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."payment_allocations"
    ADD CONSTRAINT "payment_allocations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."payment_attempts"
    ADD CONSTRAINT "payment_attempts_order_id_idempotency_key_key" UNIQUE ("order_id", "idempotency_key");



ALTER TABLE ONLY "public"."payment_attempts"
    ADD CONSTRAINT "payment_attempts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."payment_events"
    ADD CONSTRAINT "payment_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."payment_refunds"
    ADD CONSTRAINT "payment_refunds_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."product_filter_options"
    ADD CONSTRAINT "product_filter_options_pkey" PRIMARY KEY ("product_id", "filter_option_id");



ALTER TABLE ONLY "public"."product_metrics"
    ADD CONSTRAINT "product_metrics_pkey" PRIMARY KEY ("product_id");



ALTER TABLE ONLY "public"."product_skus"
    ADD CONSTRAINT "product_skus_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."product_skus"
    ADD CONSTRAINT "product_skus_product_id_id_key" UNIQUE ("product_id", "id");



ALTER TABLE ONLY "public"."products"
    ADD CONSTRAINT "products_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."products"
    ADD CONSTRAINT "products_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."public_contact_settings"
    ADD CONSTRAINT "public_contact_settings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."rental_asset_events"
    ADD CONSTRAINT "rental_asset_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."rental_assets"
    ADD CONSTRAINT "rental_assets_asset_code_key" UNIQUE ("asset_code");



ALTER TABLE ONLY "public"."rental_assets"
    ADD CONSTRAINT "rental_assets_barcode_key" UNIQUE ("barcode");



ALTER TABLE ONLY "public"."rental_assets"
    ADD CONSTRAINT "rental_assets_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."rental_assets"
    ADD CONSTRAINT "rental_assets_serial_number_key" UNIQUE ("serial_number");



ALTER TABLE ONLY "public"."rental_booking_assets"
    ADD CONSTRAINT "rental_booking_assets_booking_id_asset_id_key" UNIQUE ("booking_id", "asset_id");



ALTER TABLE ONLY "public"."rental_booking_assets"
    ADD CONSTRAINT "rental_booking_assets_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."rental_booking_cancellation_events"
    ADD CONSTRAINT "rental_booking_cancellation_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."rental_booking_checklist_items"
    ADD CONSTRAINT "rental_booking_checklist_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."rental_booking_checklists"
    ADD CONSTRAINT "rental_booking_checklists_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."rental_booking_deposit_action_logs"
    ADD CONSTRAINT "rental_booking_deposit_action_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."rental_booking_deposit_agreements"
    ADD CONSTRAINT "rental_booking_deposit_agreem_booking_id_accepted_terms_ver_key" UNIQUE ("booking_id", "accepted_terms_version");



ALTER TABLE ONLY "public"."rental_booking_deposit_agreements"
    ADD CONSTRAINT "rental_booking_deposit_agreements_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."rental_booking_deposit_proofs"
    ADD CONSTRAINT "rental_booking_deposit_proofs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."rental_booking_documents"
    ADD CONSTRAINT "rental_booking_documents_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."rental_booking_fulfillments"
    ADD CONSTRAINT "rental_booking_fulfillments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."rental_booking_handover_items"
    ADD CONSTRAINT "rental_booking_handover_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."rental_booking_no_show_events"
    ADD CONSTRAINT "rental_booking_no_show_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."rental_booking_payment_attempts"
    ADD CONSTRAINT "rental_booking_payment_attempts_booking_id_idempotency_key_key" UNIQUE ("booking_id", "idempotency_key");



ALTER TABLE ONLY "public"."rental_booking_payment_attempts"
    ADD CONSTRAINT "rental_booking_payment_attempts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."rental_booking_payment_lines"
    ADD CONSTRAINT "rental_booking_payment_lines_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."rental_bookings"
    ADD CONSTRAINT "rental_bookings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."service_providers"
    ADD CONSTRAINT "service_providers_pkey" PRIMARY KEY ("provider_id");



ALTER TABLE ONLY "public"."sku_branch_inventory"
    ADD CONSTRAINT "sku_branch_inventory_new_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."sku_branch_inventory"
    ADD CONSTRAINT "sku_branch_inventory_sku_inventory_unique" UNIQUE ("sku_id", "inventory_id");



ALTER TABLE ONLY "public"."store_branches"
    ADD CONSTRAINT "store_branches_code_key" UNIQUE ("code");



ALTER TABLE ONLY "public"."store_branches"
    ADD CONSTRAINT "store_branches_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."system_configs"
    ADD CONSTRAINT "system_configs_pkey" PRIMARY KEY ("key");



ALTER TABLE ONLY "public"."user_wishlist"
    ADD CONSTRAINT "user_wishlist_pkey" PRIMARY KEY ("user_id", "product_id");



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."walk_in_customers"
    ADD CONSTRAINT "walk_in_customers_pkey" PRIMARY KEY ("phone");



ALTER TABLE ONLY "storage"."buckets_analytics"
    ADD CONSTRAINT "buckets_analytics_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "storage"."buckets"
    ADD CONSTRAINT "buckets_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "storage"."buckets_vectors"
    ADD CONSTRAINT "buckets_vectors_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "storage"."iceberg_namespaces"
    ADD CONSTRAINT "iceberg_namespaces_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "storage"."iceberg_tables"
    ADD CONSTRAINT "iceberg_tables_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "storage"."migrations"
    ADD CONSTRAINT "migrations_name_key" UNIQUE ("name");



ALTER TABLE ONLY "storage"."migrations"
    ADD CONSTRAINT "migrations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "storage"."objects"
    ADD CONSTRAINT "objects_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "storage"."s3_multipart_uploads_parts"
    ADD CONSTRAINT "s3_multipart_uploads_parts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "storage"."s3_multipart_uploads"
    ADD CONSTRAINT "s3_multipart_uploads_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "storage"."vector_indexes"
    ADD CONSTRAINT "vector_indexes_pkey" PRIMARY KEY ("id");



CREATE INDEX "content_page_assets_asset_idx" ON "public"."content_page_assets" USING "btree" ("asset_id", "sort_order");



CREATE INDEX "content_page_products_product_idx" ON "public"."content_page_products" USING "btree" ("product_id", "sort_order");



CREATE INDEX "content_pages_service_areas_idx" ON "public"."content_pages" USING "gin" ("service_areas");



CREATE INDEX "home_link_cards_content_page_idx" ON "public"."home_link_cards" USING "btree" ("content_page_id");



CREATE UNIQUE INDEX "home_link_cards_content_page_unique" ON "public"."home_link_cards" USING "btree" ("section_key", "content_page_id") WHERE ("content_page_id" IS NOT NULL);



CREATE INDEX "idx_addresses_company" ON "public"."addresses" USING "btree" ("company_id");



CREATE INDEX "idx_addresses_user" ON "public"."addresses" USING "btree" ("user_id");



CREATE INDEX "idx_agreement_acceptance_logs_booking_type" ON "public"."agreement_acceptance_logs" USING "btree" ("booking_id", "agreement_type", "accepted_at" DESC) WHERE ("booking_id" IS NOT NULL);



CREATE INDEX "idx_agreement_acceptance_logs_company_created" ON "public"."agreement_acceptance_logs" USING "btree" ("company_id", "accepted_at" DESC) WHERE ("company_id" IS NOT NULL);



CREATE INDEX "idx_agreement_acceptance_logs_correction" ON "public"."agreement_acceptance_logs" USING "btree" ("correction_of_acceptance_id") WHERE ("correction_of_acceptance_id" IS NOT NULL);



CREATE INDEX "idx_agreement_acceptance_logs_document_type" ON "public"."agreement_acceptance_logs" USING "btree" ("official_document_id", "agreement_type", "accepted_at" DESC) WHERE ("official_document_id" IS NOT NULL);



CREATE UNIQUE INDEX "idx_agreement_acceptance_logs_idempotency_company" ON "public"."agreement_acceptance_logs" USING "btree" ("agreement_version_id", "source_type", "source_id", "company_id") WHERE (("source_id" IS NOT NULL) AND ("company_id" IS NOT NULL) AND ("status" = 'accepted'::"text"));



CREATE UNIQUE INDEX "idx_agreement_acceptance_logs_idempotency_user" ON "public"."agreement_acceptance_logs" USING "btree" ("agreement_version_id", "source_type", "source_id", "customer_user_id") WHERE (("source_id" IS NOT NULL) AND ("customer_user_id" IS NOT NULL) AND ("status" = 'accepted'::"text"));



CREATE UNIQUE INDEX "idx_agreement_acceptance_logs_idempotency_walk_in" ON "public"."agreement_acceptance_logs" USING "btree" ("agreement_version_id", "source_type", "source_id", "walk_in_phone") WHERE (("source_id" IS NOT NULL) AND ("walk_in_phone" IS NOT NULL) AND ("status" = 'accepted'::"text"));



CREATE INDEX "idx_agreement_acceptance_logs_order_type" ON "public"."agreement_acceptance_logs" USING "btree" ("order_id", "agreement_type", "accepted_at" DESC) WHERE ("order_id" IS NOT NULL);



CREATE INDEX "idx_agreement_acceptance_logs_staff_created" ON "public"."agreement_acceptance_logs" USING "btree" ("staff_user_id", "accepted_at" DESC) WHERE ("staff_user_id" IS NOT NULL);



CREATE INDEX "idx_agreement_acceptance_logs_status_created" ON "public"."agreement_acceptance_logs" USING "btree" ("status", "accepted_at" DESC);



CREATE INDEX "idx_agreement_acceptance_logs_type_version_created" ON "public"."agreement_acceptance_logs" USING "btree" ("agreement_type", "agreement_version", "accepted_at" DESC);



CREATE INDEX "idx_agreement_acceptance_logs_user_created" ON "public"."agreement_acceptance_logs" USING "btree" ("customer_user_id", "accepted_at" DESC) WHERE ("customer_user_id" IS NOT NULL);



CREATE INDEX "idx_agreement_acceptance_logs_walk_in_created" ON "public"."agreement_acceptance_logs" USING "btree" ("walk_in_phone", "accepted_at" DESC) WHERE ("walk_in_phone" IS NOT NULL);



CREATE INDEX "idx_agreement_evidence_files_acceptance" ON "public"."agreement_evidence_files" USING "btree" ("acceptance_id", "uploaded_at" DESC);



CREATE UNIQUE INDEX "idx_agreement_evidence_files_storage_path" ON "public"."agreement_evidence_files" USING "btree" ("storage_bucket", "storage_path");



CREATE INDEX "idx_agreement_evidence_files_uploaded_by" ON "public"."agreement_evidence_files" USING "btree" ("uploaded_by", "uploaded_at" DESC) WHERE ("uploaded_by" IS NOT NULL);



CREATE INDEX "idx_agreement_versions_replaces" ON "public"."agreement_versions" USING "btree" ("replaces_version_id") WHERE ("replaces_version_id" IS NOT NULL);



CREATE INDEX "idx_agreement_versions_status_effective" ON "public"."agreement_versions" USING "btree" ("status", "effective_from" DESC);



CREATE INDEX "idx_agreement_versions_type_status_effective" ON "public"."agreement_versions" USING "btree" ("agreement_type", "status", "effective_from" DESC);



CREATE INDEX "idx_asset_branch_inventory_asset" ON "public"."asset_branch_inventory" USING "btree" ("asset_id");



CREATE INDEX "idx_asset_branch_inventory_branch" ON "public"."asset_branch_inventory" USING "btree" ("branch_id");



CREATE INDEX "idx_asset_branch_inventory_inventory" ON "public"."asset_branch_inventory" USING "btree" ("inventory_id");



CREATE INDEX "idx_asset_checklist_template_items_template_sort" ON "public"."asset_checklist_template_items" USING "btree" ("template_id", "sort_order");



CREATE INDEX "idx_asset_checklist_templates_asset_kind" ON "public"."asset_checklist_templates" USING "btree" ("asset_id", "kind", "is_active", "sort_order");



CREATE INDEX "idx_asset_documents_asset_visibility_sort" ON "public"."asset_documents" USING "btree" ("asset_id", "visibility", "sort_order");



CREATE INDEX "idx_asset_documents_service_event" ON "public"."asset_documents" USING "btree" ("service_event_id");



CREATE INDEX "idx_asset_filter_options_option" ON "public"."asset_filter_options" USING "btree" ("filter_option_id");



CREATE INDEX "idx_asset_matches_asset_sort" ON "public"."asset_matches" USING "btree" ("asset_id", "sort_order", "product_id");



CREATE INDEX "idx_asset_matches_product_sort" ON "public"."asset_matches" USING "btree" ("product_id", "sort_order", "asset_id");



CREATE INDEX "idx_asset_service_events_asset_date" ON "public"."asset_service_events" USING "btree" ("asset_id", "service_date" DESC);



CREATE INDEX "idx_assets_brand_trgm" ON "public"."assets" USING "gin" (COALESCE("brand", ''::"text") "extensions"."gin_trgm_ops") WHERE ("brand" IS NOT NULL);



CREATE INDEX "idx_assets_category_keys" ON "public"."assets" USING "gin" ("category_keys");



CREATE INDEX "idx_assets_code_trgm" ON "public"."assets" USING "gin" (COALESCE("code", ''::"text") "extensions"."gin_trgm_ops");



CREATE INDEX "idx_assets_filter_keys" ON "public"."assets" USING "gin" ("filter_keys");



CREATE INDEX "idx_assets_last_rented_at" ON "public"."assets" USING "btree" ("last_rented_at" DESC);



CREATE INDEX "idx_assets_main_category_key" ON "public"."assets" USING "btree" ("main_category_key");



CREATE INDEX "idx_assets_main_category_visibility" ON "public"."assets" USING "btree" ("main_category_key", "status", "is_hidden", "sort_order", "updated_at" DESC);



CREATE INDEX "idx_assets_name_trgm" ON "public"."assets" USING "gin" ((((((((COALESCE("name_th", ''::"text") || ' '::"text") || COALESCE("name_en", ''::"text")) || ' '::"text") || COALESCE("name_cn", ''::"text")) || ' '::"text") || COALESCE("name_jp", ''::"text"))) "extensions"."gin_trgm_ops");



CREATE INDEX "idx_assets_search_keywords" ON "public"."assets" USING "gin" ("search_keywords");



CREATE INDEX "idx_assets_search_vector" ON "public"."assets" USING "gin" ("search_vector");



CREATE INDEX "idx_assets_status_hidden_sort" ON "public"."assets" USING "btree" ("status", "is_hidden", "sort_order", "created_at" DESC);



CREATE INDEX "idx_assets_storage_branch" ON "public"."assets" USING "btree" ("storage_branch_id");



CREATE INDEX "idx_assets_storage_inventory" ON "public"."assets" USING "btree" ("storage_inventory_id");



CREATE INDEX "idx_assets_tag_keys" ON "public"."assets" USING "gin" ("tag_keys");



CREATE INDEX "idx_cart_items_cart" ON "public"."cart_items" USING "btree" ("cart_id");



CREATE INDEX "idx_carts_user" ON "public"."carts" USING "btree" ("user_id");



CREATE INDEX "idx_catalog_terms_kind_active_display" ON "public"."catalog_terms" USING "btree" ("kind", "is_active", "display_value");



CREATE INDEX "idx_chat_attachments_deleted_old" ON "public"."chat_attachments" USING "btree" ("deleted_at", "created_at") WHERE ("deleted_at" IS NOT NULL);



CREATE INDEX "idx_chat_attachments_message" ON "public"."chat_attachments" USING "btree" ("message_id");



CREATE INDEX "idx_chat_conversations_status_updated" ON "public"."chat_conversations" USING "btree" ("status", "updated_at" DESC);



CREATE INDEX "idx_chat_conversations_subject" ON "public"."chat_conversations" USING "btree" ("subject_type", "subject_id");



CREATE INDEX "idx_chat_messages_conversation_created" ON "public"."chat_messages" USING "btree" ("conversation_id", "created_at" DESC);



CREATE INDEX "idx_chat_messages_sender_recent" ON "public"."chat_messages" USING "btree" ("sender_id", "created_at" DESC);



CREATE INDEX "idx_chat_participants_user" ON "public"."chat_participants" USING "btree" ("user_id", "conversation_id");



CREATE INDEX "idx_companies_tax_id" ON "public"."companies" USING "btree" ("tax_id");



CREATE INDEX "idx_company_members_company" ON "public"."company_members" USING "btree" ("company_id");



CREATE INDEX "idx_company_members_user" ON "public"."company_members" USING "btree" ("user_id");



CREATE INDEX "idx_content_pages_provider_id" ON "public"."content_pages" USING "btree" ("provider_id");



CREATE INDEX "idx_content_pages_public_sort" ON "public"."content_pages" USING "btree" ("content_type", "is_active", "sort_order", "published_at" DESC, "created_at" DESC);



CREATE INDEX "idx_content_pages_type_main_category" ON "public"."content_pages" USING "btree" ("content_type", "main_category_key", "is_active", "sort_order");



CREATE INDEX "idx_customer_tax_profiles_company_created" ON "public"."customer_tax_profiles" USING "btree" ("company_id", "created_at" DESC) WHERE ("company_id" IS NOT NULL);



CREATE UNIQUE INDEX "idx_customer_tax_profiles_default_user" ON "public"."customer_tax_profiles" USING "btree" ("customer_user_id") WHERE (("is_default" = true) AND ("customer_user_id" IS NOT NULL));



CREATE UNIQUE INDEX "idx_customer_tax_profiles_default_walk_in" ON "public"."customer_tax_profiles" USING "btree" ("walk_in_phone") WHERE (("is_default" = true) AND ("walk_in_phone" IS NOT NULL));



CREATE INDEX "idx_customer_tax_profiles_tax_id_normalized" ON "public"."customer_tax_profiles" USING "btree" ("tax_id_normalized");



CREATE INDEX "idx_customer_tax_profiles_user_created" ON "public"."customer_tax_profiles" USING "btree" ("customer_user_id", "created_at" DESC) WHERE ("customer_user_id" IS NOT NULL);



CREATE INDEX "idx_customer_tax_profiles_walk_in_created" ON "public"."customer_tax_profiles" USING "btree" ("walk_in_phone", "created_at" DESC) WHERE ("walk_in_phone" IS NOT NULL);



CREATE INDEX "idx_document_events_document_created" ON "public"."document_events" USING "btree" ("document_id", "created_at" DESC);



CREATE INDEX "idx_document_events_staff_created" ON "public"."document_events" USING "btree" ("staff_user_id", "created_at" DESC) WHERE ("staff_user_id" IS NOT NULL);



CREATE INDEX "idx_document_events_type_created" ON "public"."document_events" USING "btree" ("event_type", "created_at" DESC);



CREATE INDEX "idx_filter_groups_main_active_sort" ON "public"."filter_groups" USING "btree" ("main_category_key", "is_active", "sort_order");



CREATE INDEX "idx_filter_options_group_active_sort" ON "public"."filter_options" USING "btree" ("group_id", "is_active", "sort_order");



CREATE INDEX "idx_home_banners_active_sort" ON "public"."home_banners" USING "btree" ("is_active", "sort_order", "created_at" DESC);



CREATE INDEX "idx_home_category_groups_active_sort" ON "public"."home_category_groups" USING "btree" ("is_active", "sort_order", "label_th");



CREATE INDEX "idx_home_category_options_group_active_sort" ON "public"."home_category_options" USING "btree" ("group_id", "is_active", "sort_order", "label_th");



CREATE INDEX "idx_home_featured_assets_active_sort" ON "public"."home_featured_assets" USING "btree" ("is_active", "sort_order", "created_at" DESC);



CREATE INDEX "idx_home_featured_products_active_sort" ON "public"."home_featured_products" USING "btree" ("is_active", "sort_order", "created_at" DESC);



CREATE INDEX "idx_home_link_cards_section_active_sort" ON "public"."home_link_cards" USING "btree" ("section_key", "is_active", "sort_order", "created_at" DESC);



CREATE INDEX "idx_home_partner_logos_active_sort" ON "public"."home_partner_logos" USING "btree" ("is_active", "sort_order", "created_at" DESC);



CREATE INDEX "idx_inventories_branch" ON "public"."inventories" USING "btree" ("branch_id");



CREATE UNIQUE INDEX "idx_inventories_one_default_per_branch" ON "public"."inventories" USING "btree" ("branch_id") WHERE "is_default";



CREATE UNIQUE INDEX "idx_inventories_one_default_rental_per_branch" ON "public"."inventories" USING "btree" ("branch_id") WHERE "is_default_rental";



CREATE INDEX "idx_inventory_change_log_changed_by" ON "public"."inventory_change_log" USING "btree" ("changed_by");



CREATE INDEX "idx_inventory_change_log_created_at" ON "public"."inventory_change_log" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_inventory_change_log_inventory" ON "public"."inventory_change_log" USING "btree" ("inventory_id");



CREATE INDEX "idx_main_categories_active_sort" ON "public"."main_categories" USING "btree" ("is_active", "sort_order", "label_th");



CREATE INDEX "idx_main_categories_entity_types" ON "public"."main_categories" USING "gin" ("entity_types");



CREATE UNIQUE INDEX "idx_mixed_alloc_booking_deposit_once" ON "public"."mixed_payment_allocations" USING "btree" ("mixed_checkout_session_id", "rental_booking_id", "allocation_type") WHERE ("allocation_type" = 'booking_deposit'::"text");



CREATE INDEX "idx_mixed_allocations_session" ON "public"."mixed_payment_allocations" USING "btree" ("mixed_checkout_session_id");



CREATE INDEX "idx_mixed_attempts_session_created" ON "public"."mixed_payment_attempts" USING "btree" ("mixed_checkout_session_id", "created_at" DESC);



CREATE UNIQUE INDEX "idx_mixed_payment_attempts_gateway_charge" ON "public"."mixed_payment_attempts" USING "btree" ("gateway", "gateway_charge_id") WHERE ("gateway_charge_id" IS NOT NULL);



CREATE UNIQUE INDEX "idx_mixed_payment_attempts_one_paid" ON "public"."mixed_payment_attempts" USING "btree" ("mixed_checkout_session_id") WHERE ("status" = 'paid'::"public"."payment_attempt_status");



CREATE INDEX "idx_mixed_sessions_user_created" ON "public"."mixed_checkout_sessions" USING "btree" ("user_id", "created_at" DESC);



CREATE INDEX "idx_official_documents_branch_issued" ON "public"."official_documents" USING "btree" ("branch_id", "issued_at" DESC);



CREATE UNIQUE INDEX "idx_official_documents_document_no" ON "public"."official_documents" USING "btree" ("document_no") WHERE ("document_no" IS NOT NULL);



CREATE UNIQUE INDEX "idx_official_documents_idempotency" ON "public"."official_documents" USING "btree" ("source_type", "source_id", "document_type", "idempotency_key") WHERE ("idempotency_key" IS NOT NULL);



CREATE INDEX "idx_official_documents_source" ON "public"."official_documents" USING "btree" ("source_type", "source_id", "created_at" DESC);



CREATE INDEX "idx_official_documents_tax_profile_issued" ON "public"."official_documents" USING "btree" ("tax_profile_id", "issued_at" DESC) WHERE ("tax_profile_id" IS NOT NULL);



CREATE INDEX "idx_official_documents_type_issued" ON "public"."official_documents" USING "btree" ("document_type", "issued_at" DESC);



CREATE INDEX "idx_order_items_order" ON "public"."order_items" USING "btree" ("order_id");



CREATE INDEX "idx_orders_company_created_at" ON "public"."orders" USING "btree" ("company_id", "created_at" DESC);



CREATE INDEX "idx_orders_fulfillment_status_created_at" ON "public"."orders" USING "btree" ("fulfillment_status", "created_at" DESC);



CREATE INDEX "idx_orders_payment_status_created_at" ON "public"."orders" USING "btree" ("payment_status", "created_at" DESC);



CREATE INDEX "idx_orders_pickup_branch_created_at" ON "public"."orders" USING "btree" ("pickup_branch_id", "created_at" DESC) WHERE ("pickup_branch_id" IS NOT NULL);



CREATE INDEX "idx_orders_pos_branch_created" ON "public"."orders" USING "btree" ("pos_branch_id", "created_at" DESC);



CREATE INDEX "idx_orders_shipping_mode_created_at" ON "public"."orders" USING "btree" ("shipping_mode", "created_at" DESC);



CREATE INDEX "idx_orders_status_created_at" ON "public"."orders" USING "btree" ("status", "created_at" DESC);



CREATE INDEX "idx_orders_user_created_at" ON "public"."orders" USING "btree" ("user_id", "created_at" DESC);



CREATE INDEX "idx_orders_walk_in_phone_created" ON "public"."orders" USING "btree" ("walk_in_phone", "created_at" DESC);



CREATE INDEX "idx_payment_alerts_admin_open" ON "public"."payment_alerts" USING "btree" ("audience", "resolved_at", "created_at" DESC) WHERE (("audience" = 'admin'::"text") AND ("resolved_at" IS NULL));



CREATE INDEX "idx_payment_alerts_booking" ON "public"."payment_alerts" USING "btree" ("booking_id", "created_at" DESC) WHERE ("booking_id" IS NOT NULL);



CREATE INDEX "idx_payment_alerts_mixed_open" ON "public"."payment_alerts" USING "btree" ("mixed_checkout_session_id", "kind", "resolved_at") WHERE (("mixed_checkout_session_id" IS NOT NULL) AND ("audience" = 'admin'::"text"));



CREATE INDEX "idx_payment_alerts_mixed_session" ON "public"."payment_alerts" USING "btree" ("mixed_checkout_session_id", "created_at" DESC) WHERE ("mixed_checkout_session_id" IS NOT NULL);



CREATE INDEX "idx_payment_alerts_order" ON "public"."payment_alerts" USING "btree" ("order_id", "created_at" DESC);



CREATE INDEX "idx_payment_allocations_branch_created" ON "public"."payment_allocations" USING "btree" ("branch_id", "allocated_at" DESC) WHERE ("branch_id" IS NOT NULL);



CREATE UNIQUE INDEX "idx_payment_allocations_idempotency" ON "public"."payment_allocations" USING "btree" ("source_type", "source_id", "allocation_type", "idempotency_key") WHERE ("idempotency_key" IS NOT NULL);



CREATE INDEX "idx_payment_allocations_original_allocation" ON "public"."payment_allocations" USING "btree" ("original_allocation_id") WHERE ("original_allocation_id" IS NOT NULL);



CREATE INDEX "idx_payment_allocations_payment_attempt" ON "public"."payment_allocations" USING "btree" ("payment_attempt_id") WHERE ("payment_attempt_id" IS NOT NULL);



CREATE INDEX "idx_payment_allocations_related_document" ON "public"."payment_allocations" USING "btree" ("related_document_id") WHERE ("related_document_id" IS NOT NULL);



CREATE INDEX "idx_payment_allocations_source_created" ON "public"."payment_allocations" USING "btree" ("source_type", "source_id", "allocated_at" DESC);



CREATE INDEX "idx_payment_allocations_source_reference" ON "public"."payment_allocations" USING "btree" ("payment_source_type", "payment_source_id") WHERE (("payment_source_type" IS NOT NULL) OR ("payment_source_id" IS NOT NULL));



CREATE INDEX "idx_payment_allocations_type_created" ON "public"."payment_allocations" USING "btree" ("allocation_type", "allocated_at" DESC);



CREATE UNIQUE INDEX "idx_payment_attempts_gateway_charge_unique" ON "public"."payment_attempts" USING "btree" ("gateway", "gateway_charge_id") WHERE ("gateway_charge_id" IS NOT NULL);



CREATE UNIQUE INDEX "idx_payment_attempts_one_paid_per_order" ON "public"."payment_attempts" USING "btree" ("order_id") WHERE ("status" = 'paid'::"public"."payment_attempt_status");



CREATE INDEX "idx_payment_attempts_order_created" ON "public"."payment_attempts" USING "btree" ("order_id", "created_at" DESC);



CREATE INDEX "idx_payment_attempts_user_created" ON "public"."payment_attempts" USING "btree" ("user_id", "created_at" DESC);



CREATE INDEX "idx_payment_events_charge" ON "public"."payment_events" USING "btree" ("gateway", "gateway_charge_id");



CREATE UNIQUE INDEX "idx_payment_events_gateway_event_unique" ON "public"."payment_events" USING "btree" ("gateway", "gateway_event_id") WHERE ("gateway_event_id" IS NOT NULL);



CREATE INDEX "idx_payment_events_mixed_session" ON "public"."payment_events" USING "btree" ("mixed_checkout_session_id", "received_at" DESC) WHERE ("mixed_checkout_session_id" IS NOT NULL);



CREATE INDEX "idx_payment_refunds_booking" ON "public"."payment_refunds" USING "btree" ("booking_id", "requested_at" DESC);



CREATE UNIQUE INDEX "idx_payment_refunds_one_booking_deposit_per_booking" ON "public"."payment_refunds" USING "btree" ("booking_id") WHERE ("refund_type" = 'rental_booking_deposit'::"text");



COMMENT ON INDEX "public"."idx_payment_refunds_one_booking_deposit_per_booking" IS 'Idempotency guard: a rental booking can have only one manual Booking Deposit refund request.';



CREATE UNIQUE INDEX "idx_payment_refunds_one_booking_deposit_per_cancellation" ON "public"."payment_refunds" USING "btree" ("cancellation_event_id") WHERE (("refund_type" = 'rental_booking_deposit'::"text") AND ("cancellation_event_id" IS NOT NULL));



CREATE INDEX "idx_payment_refunds_status_requested" ON "public"."payment_refunds" USING "btree" ("status", "requested_at" DESC);



CREATE INDEX "idx_payment_refunds_user" ON "public"."payment_refunds" USING "btree" ("user_id", "requested_at" DESC) WHERE ("user_id" IS NOT NULL);



CREATE INDEX "idx_product_filter_options_option" ON "public"."product_filter_options" USING "btree" ("filter_option_id");



CREATE INDEX "idx_product_skus_product" ON "public"."product_skus" USING "btree" ("product_id");



CREATE INDEX "idx_product_skus_sku_code_lookup" ON "public"."product_skus" USING "btree" ("sku_code") WHERE ("sku_code" IS NOT NULL);



CREATE UNIQUE INDEX "idx_product_skus_sku_code_unique" ON "public"."product_skus" USING "btree" ("lower"("sku_code"));



CREATE INDEX "idx_products_brand_trgm" ON "public"."products" USING "gin" (COALESCE("brand", ''::"text") "extensions"."gin_trgm_ops") WHERE ("brand" IS NOT NULL);



CREATE INDEX "idx_products_category_keys" ON "public"."products" USING "gin" ("category_keys");



CREATE INDEX "idx_products_filter_keys" ON "public"."products" USING "gin" ("filter_keys");



CREATE INDEX "idx_products_main_category_key" ON "public"."products" USING "btree" ("main_category_key");



CREATE INDEX "idx_products_main_category_visibility" ON "public"."products" USING "btree" ("main_category_key", "is_hidden", "updated_at" DESC);



CREATE INDEX "idx_products_name_trgm" ON "public"."products" USING "gin" ((((COALESCE("name_th", ''::"text") || ' '::"text") || COALESCE("name_en", ''::"text"))) "extensions"."gin_trgm_ops");



CREATE INDEX "idx_products_search_keywords" ON "public"."products" USING "gin" ("search_keywords");



CREATE INDEX "idx_products_search_vector" ON "public"."products" USING "gin" ("search_vector");



CREATE INDEX "idx_products_tag_keys" ON "public"."products" USING "gin" ("tag_keys");



CREATE INDEX "idx_products_type_visibility" ON "public"."products" USING "btree" ("type", "is_hidden");



CREATE INDEX "idx_rental_asset_events_asset_time" ON "public"."rental_asset_events" USING "btree" ("asset_id", "event_at" DESC);



CREATE INDEX "idx_rental_asset_events_booking_time" ON "public"."rental_asset_events" USING "btree" ("booking_id", "event_at" DESC);



CREATE INDEX "idx_rental_assets_hub" ON "public"."rental_assets" USING "btree" ("hub_id");



CREATE INDEX "idx_rental_assets_sku_status" ON "public"."rental_assets" USING "btree" ("sku_id", "status");



CREATE INDEX "idx_rental_booking_assets_asset" ON "public"."rental_booking_assets" USING "btree" ("asset_id");



CREATE UNIQUE INDEX "idx_rental_booking_assets_asset_active" ON "public"."rental_booking_assets" USING "btree" ("asset_id") WHERE (("released_at" IS NULL) AND ("allocation_status" = ANY (ARRAY['allocated'::"public"."rental_asset_allocation_status", 'picked_up'::"public"."rental_asset_allocation_status"])));



CREATE INDEX "idx_rental_booking_assets_booking" ON "public"."rental_booking_assets" USING "btree" ("booking_id");



CREATE INDEX "idx_rental_booking_cancellation_events_booking" ON "public"."rental_booking_cancellation_events" USING "btree" ("booking_id", "cancelled_at" DESC);



CREATE UNIQUE INDEX "idx_rental_booking_cancellation_events_one_customer_web_per_boo" ON "public"."rental_booking_cancellation_events" USING "btree" ("booking_id") WHERE (("cancellation_initiator" = 'customer'::"text") AND ("cancellation_source" = 'customer_web'::"text"));



COMMENT ON INDEX "public"."idx_rental_booking_cancellation_events_one_customer_web_per_boo" IS 'Idempotency guard: a rental booking can have only one customer_web self-service cancellation event.';



CREATE INDEX "idx_rental_booking_cancellation_events_source" ON "public"."rental_booking_cancellation_events" USING "btree" ("cancellation_initiator", "cancellation_source", "cancelled_at" DESC);



CREATE INDEX "idx_rental_booking_cancellation_events_user_window" ON "public"."rental_booking_cancellation_events" USING "btree" ("user_id", "cancelled_at" DESC) WHERE ("qualifies_for_restriction" = true);



CREATE INDEX "idx_rental_booking_checklist_items_checklist" ON "public"."rental_booking_checklist_items" USING "btree" ("booking_checklist_id", "sort_order");



CREATE INDEX "idx_rental_booking_checklist_items_checklist_sort" ON "public"."rental_booking_checklist_items" USING "btree" ("booking_checklist_id", "sort_order");



CREATE INDEX "idx_rental_booking_checklists_booking" ON "public"."rental_booking_checklists" USING "btree" ("booking_id", "created_at" DESC);



CREATE INDEX "idx_rental_booking_checklists_booking_kind_status" ON "public"."rental_booking_checklists" USING "btree" ("booking_id", "kind", "status");



CREATE INDEX "idx_rental_booking_deposit_action_logs_booking" ON "public"."rental_booking_deposit_action_logs" USING "btree" ("booking_id", "created_at" DESC);



CREATE INDEX "idx_rental_booking_deposit_action_logs_staff" ON "public"."rental_booking_deposit_action_logs" USING "btree" ("staff_user_id", "created_at" DESC);



CREATE INDEX "idx_rental_booking_deposit_agreements_booking" ON "public"."rental_booking_deposit_agreements" USING "btree" ("booking_id", "accepted_at" DESC);



CREATE INDEX "idx_rental_booking_deposit_proofs_booking" ON "public"."rental_booking_deposit_proofs" USING "btree" ("booking_id", "proof_kind", "created_at" DESC);



CREATE INDEX "idx_rental_booking_documents_booking" ON "public"."rental_booking_documents" USING "btree" ("booking_id", "created_at" DESC);



CREATE INDEX "idx_rental_booking_documents_booking_visibility_created" ON "public"."rental_booking_documents" USING "btree" ("booking_id", "visibility", "created_at" DESC);



CREATE INDEX "idx_rental_booking_fulfillments_booking" ON "public"."rental_booking_fulfillments" USING "btree" ("booking_id", "created_at" DESC);



CREATE INDEX "idx_rental_booking_fulfillments_branch_event" ON "public"."rental_booking_fulfillments" USING "btree" ("branch_id", "event_at" DESC) WHERE ("branch_id" IS NOT NULL);



CREATE INDEX "idx_rental_booking_fulfillments_checklist" ON "public"."rental_booking_fulfillments" USING "btree" ("booking_checklist_id") WHERE ("booking_checklist_id" IS NOT NULL);



CREATE UNIQUE INDEX "idx_rental_booking_fulfillments_idempotency" ON "public"."rental_booking_fulfillments" USING "btree" ("booking_id", "event_type", "idempotency_key") WHERE ("idempotency_key" IS NOT NULL);



CREATE UNIQUE INDEX "idx_rental_booking_fulfillments_one_event" ON "public"."rental_booking_fulfillments" USING "btree" ("booking_id", "event_type") WHERE ("event_type" = ANY (ARRAY['pickup'::"text", 'return'::"text"]));



CREATE INDEX "idx_rental_booking_handover_items_asset" ON "public"."rental_booking_handover_items" USING "btree" ("asset_id") WHERE ("asset_id" IS NOT NULL);



CREATE INDEX "idx_rental_booking_handover_items_booking_sort" ON "public"."rental_booking_handover_items" USING "btree" ("booking_id", "deleted_at", "sort_order");



CREATE INDEX "idx_rental_booking_handover_items_pickup_checked" ON "public"."rental_booking_handover_items" USING "btree" ("booking_id", "pickup_checked");



CREATE INDEX "idx_rental_booking_handover_items_return_status" ON "public"."rental_booking_handover_items" USING "btree" ("booking_id", "return_status");



CREATE UNIQUE INDEX "idx_rental_booking_no_show_events_booking" ON "public"."rental_booking_no_show_events" USING "btree" ("booking_id");



CREATE INDEX "idx_rental_booking_no_show_events_marked_at" ON "public"."rental_booking_no_show_events" USING "btree" ("marked_at" DESC);



CREATE INDEX "idx_rental_booking_payment_attempts_booking_created" ON "public"."rental_booking_payment_attempts" USING "btree" ("booking_id", "created_at" DESC);



CREATE UNIQUE INDEX "idx_rental_booking_payment_attempts_gateway_charge" ON "public"."rental_booking_payment_attempts" USING "btree" ("gateway", "gateway_charge_id") WHERE ("gateway_charge_id" IS NOT NULL);



CREATE UNIQUE INDEX "idx_rental_booking_payment_attempts_one_paid" ON "public"."rental_booking_payment_attempts" USING "btree" ("booking_id") WHERE ("status" = 'paid'::"public"."payment_attempt_status");



CREATE UNIQUE INDEX "idx_rental_booking_payment_lines_active_source" ON "public"."rental_booking_payment_lines" USING "btree" ("booking_id", "line_type", "source") WHERE ("status" = 'active'::"text");



CREATE INDEX "idx_rental_booking_payment_lines_booking_created" ON "public"."rental_booking_payment_lines" USING "btree" ("booking_id", "created_at" DESC);



CREATE INDEX "idx_rental_booking_payment_lines_type" ON "public"."rental_booking_payment_lines" USING "btree" ("line_type");



CREATE INDEX "idx_rental_bookings_asset_status_period" ON "public"."rental_bookings" USING "btree" ("asset_id", "status", "start_date", "end_date");



CREATE INDEX "idx_rental_bookings_cancellation_event" ON "public"."rental_bookings" USING "btree" ("cancellation_source_event_id") WHERE ("cancellation_source_event_id" IS NOT NULL);



CREATE INDEX "idx_rental_bookings_cancelled_at" ON "public"."rental_bookings" USING "btree" ("cancelled_at" DESC) WHERE ("cancelled_at" IS NOT NULL);



CREATE INDEX "idx_rental_bookings_deposit_refund_export" ON "public"."rental_bookings" USING "btree" ("deposit_refund_status", "created_at" DESC) WHERE ("deposit_refund_amount" > (0)::numeric);



CREATE INDEX "idx_rental_bookings_deposit_status" ON "public"."rental_bookings" USING "btree" ("deposit_payment_status", "deposit_refund_status", "created_at" DESC);



CREATE INDEX "idx_rental_bookings_matched_product_created" ON "public"."rental_bookings" USING "btree" ("matched_product_id", "created_at" DESC);



CREATE INDEX "idx_rental_bookings_no_show_at" ON "public"."rental_bookings" USING "btree" ("no_show_at" DESC) WHERE ("no_show_at" IS NOT NULL);



CREATE INDEX "idx_rental_bookings_pickup_branch_at" ON "public"."rental_bookings" USING "btree" ("pickup_branch_id", "pickup_at" DESC) WHERE ("pickup_branch_id" IS NOT NULL);



CREATE INDEX "idx_rental_bookings_pos_branch_created" ON "public"."rental_bookings" USING "btree" ("pos_branch_id", "created_at" DESC);



CREATE INDEX "idx_rental_bookings_return_branch_at" ON "public"."rental_bookings" USING "btree" ("return_branch_id", "returned_at" DESC) WHERE ("return_branch_id" IS NOT NULL);



CREATE INDEX "idx_rental_bookings_sku_period" ON "public"."rental_bookings" USING "btree" ("sku_id", "start_date", "end_date", "status");



CREATE INDEX "idx_rental_bookings_user_status" ON "public"."rental_bookings" USING "btree" ("user_id", "status");



CREATE INDEX "idx_rental_bookings_walk_in_phone_created" ON "public"."rental_bookings" USING "btree" ("walk_in_phone", "created_at" DESC);



CREATE INDEX "idx_sku_branch_inventory_branch" ON "public"."sku_branch_inventory" USING "btree" ("branch_id");



CREATE INDEX "idx_sku_branch_inventory_branch_kind" ON "public"."sku_branch_inventory" USING "btree" ("branch_id", "inventory_kind");



CREATE INDEX "idx_sku_branch_inventory_inventory" ON "public"."sku_branch_inventory" USING "btree" ("inventory_id");



CREATE INDEX "idx_sku_branch_inventory_product" ON "public"."sku_branch_inventory" USING "btree" ("product_id", "sku_id");



CREATE INDEX "idx_sku_branch_inventory_sku" ON "public"."sku_branch_inventory" USING "btree" ("sku_id");



CREATE INDEX "idx_sku_branch_inventory_sku_kind" ON "public"."sku_branch_inventory" USING "btree" ("sku_id", "inventory_kind");



CREATE INDEX "idx_user_save_list_asset_lookup" ON "public"."user_save_list" USING "btree" ("asset_id", "created_at" DESC) WHERE ("item_type" = 'asset'::"text");



CREATE UNIQUE INDEX "idx_user_save_list_asset_unique" ON "public"."user_save_list" USING "btree" ("user_id", "asset_id") WHERE ("item_type" = 'asset'::"text");



CREATE INDEX "idx_user_save_list_service_lookup" ON "public"."user_save_list" USING "btree" ("service_id", "created_at" DESC) WHERE ("item_type" = 'service'::"text");



CREATE UNIQUE INDEX "idx_user_save_list_service_unique" ON "public"."user_save_list" USING "btree" ("user_id", "service_id") WHERE ("item_type" = 'service'::"text");



CREATE INDEX "idx_user_wishlist_product_id" ON "public"."user_wishlist" USING "btree" ("product_id", "created_at" DESC);



CREATE INDEX "idx_users_account_status" ON "public"."users" USING "btree" ("account_status", "updated_at" DESC);



CREATE INDEX "idx_users_deletion_requested_at" ON "public"."users" USING "btree" ("deletion_requested_at" DESC) WHERE ("deletion_requested_at" IS NOT NULL);



CREATE INDEX "idx_users_rental_booking_restriction_source_event" ON "public"."users" USING "btree" ("rental_booking_restriction_source_event_id") WHERE ("rental_booking_restriction_source_event_id" IS NOT NULL);



CREATE INDEX "idx_users_rental_booking_restriction_status" ON "public"."users" USING "btree" ("rental_booking_restriction_status", "rental_booking_restriction_applied_at" DESC);



CREATE INDEX "idx_walk_in_customers_linked_user" ON "public"."walk_in_customers" USING "btree" ("linked_user_id");



CREATE UNIQUE INDEX "bname" ON "storage"."buckets" USING "btree" ("name");



CREATE UNIQUE INDEX "bucketid_objname" ON "storage"."objects" USING "btree" ("bucket_id", "name");



CREATE UNIQUE INDEX "buckets_analytics_unique_name_idx" ON "storage"."buckets_analytics" USING "btree" ("name") WHERE ("deleted_at" IS NULL);



CREATE UNIQUE INDEX "idx_iceberg_namespaces_bucket_id" ON "storage"."iceberg_namespaces" USING "btree" ("catalog_id", "name");



CREATE UNIQUE INDEX "idx_iceberg_tables_location" ON "storage"."iceberg_tables" USING "btree" ("location");



CREATE UNIQUE INDEX "idx_iceberg_tables_namespace_id" ON "storage"."iceberg_tables" USING "btree" ("catalog_id", "namespace_id", "name");



CREATE INDEX "idx_multipart_uploads_list" ON "storage"."s3_multipart_uploads" USING "btree" ("bucket_id", "key", "created_at");



CREATE INDEX "idx_objects_bucket_id_name" ON "storage"."objects" USING "btree" ("bucket_id", "name" COLLATE "C");



CREATE INDEX "idx_objects_bucket_id_name_lower" ON "storage"."objects" USING "btree" ("bucket_id", "lower"("name") COLLATE "C");



CREATE INDEX "name_prefix_search" ON "storage"."objects" USING "btree" ("name" "text_pattern_ops");



CREATE UNIQUE INDEX "vector_indexes_name_bucket_id_idx" ON "storage"."vector_indexes" USING "btree" ("name", "bucket_id");



CREATE OR REPLACE TRIGGER "asset_branch_inventory_before_sync_branch_trg" BEFORE INSERT OR UPDATE OF "inventory_id" ON "public"."asset_branch_inventory" FOR EACH ROW EXECUTE FUNCTION "public"."asset_branch_inventory_sync_branch"();



CREATE OR REPLACE TRIGGER "asset_filter_options_after_change" AFTER INSERT OR DELETE ON "public"."asset_filter_options" FOR EACH ROW EXECUTE FUNCTION "public"."asset_filter_options_sync_trg"();



CREATE OR REPLACE TRIGGER "assets_after_sync_catalog_terms_trg" AFTER INSERT OR UPDATE OF "tag_keys", "search_keywords" ON "public"."assets" FOR EACH ROW EXECUTE FUNCTION "public"."sync_catalog_terms_from_asset"();



CREATE OR REPLACE TRIGGER "assets_before_sync_category_keys_trg" BEFORE INSERT OR UPDATE OF "main_category_key", "tag_keys", "category_keys" ON "public"."assets" FOR EACH ROW EXECUTE FUNCTION "public"."assets_sync_category_keys"();



CREATE OR REPLACE TRIGGER "assets_check_storage_inventory_trg" BEFORE INSERT OR UPDATE OF "storage_branch_id", "storage_inventory_id" ON "public"."assets" FOR EACH ROW EXECUTE FUNCTION "public"."assets_check_storage_inventory"();



CREATE OR REPLACE TRIGGER "assets_clear_filter_options_on_category_change" AFTER UPDATE OF "main_category_key" ON "public"."assets" FOR EACH ROW EXECUTE FUNCTION "public"."assets_clear_filter_options_on_category_change"();



CREATE OR REPLACE TRIGGER "assets_resync_filter_options_from_tags_trg" AFTER INSERT OR UPDATE OF "tag_keys", "main_category_key" ON "public"."assets" FOR EACH ROW EXECUTE FUNCTION "public"."assets_resync_filter_options_trg"();



CREATE OR REPLACE TRIGGER "assets_search_vector_trg" BEFORE INSERT OR UPDATE OF "code", "slug", "name_th", "name_en", "name_cn", "name_jp", "brand", "main_category_key", "category_keys", "tag_keys", "search_keywords", "description_th", "description_en", "description_cn", "description_jp", "spec_summary", "detail_blocks" ON "public"."assets" FOR EACH ROW EXECUTE FUNCTION "public"."assets_search_vector_update"();



CREATE OR REPLACE TRIGGER "chat_messages_after_insert_trg" AFTER INSERT ON "public"."chat_messages" FOR EACH ROW EXECUTE FUNCTION "public"."chat_after_message_insert"();



CREATE OR REPLACE TRIGGER "chat_messages_guard_write_trg" BEFORE INSERT OR UPDATE ON "public"."chat_messages" FOR EACH ROW EXECUTE FUNCTION "public"."chat_guard_message_write"();



CREATE OR REPLACE TRIGGER "ensure_default_address" AFTER INSERT OR UPDATE ON "public"."addresses" FOR EACH ROW EXECUTE FUNCTION "public"."ensure_single_default_address"();



CREATE OR REPLACE TRIGGER "filter_groups_cascade_resync" AFTER INSERT OR UPDATE OF "main_category_key", "is_active", "filter_type", "key" ON "public"."filter_groups" FOR EACH ROW EXECUTE FUNCTION "public"."filter_groups_cascade_resync_trg"();



CREATE OR REPLACE TRIGGER "filter_groups_resync_filter_keys" AFTER UPDATE OF "key" ON "public"."filter_groups" FOR EACH ROW EXECUTE FUNCTION "public"."filter_groups_resync_on_key_change"();



CREATE OR REPLACE TRIGGER "filter_options_cascade_resync" AFTER INSERT OR UPDATE OF "key", "is_active", "group_id" ON "public"."filter_options" FOR EACH ROW EXECUTE FUNCTION "public"."filter_options_cascade_resync_trg"();



CREATE OR REPLACE TRIGGER "filter_options_resync_filter_keys" AFTER UPDATE OF "key" ON "public"."filter_options" FOR EACH ROW EXECUTE FUNCTION "public"."filter_options_resync_on_key_change"();



CREATE OR REPLACE TRIGGER "guard_agreement_acceptance_log_updates" BEFORE UPDATE ON "public"."agreement_acceptance_logs" FOR EACH ROW EXECUTE FUNCTION "public"."guard_agreement_acceptance_log_updates"();



CREATE OR REPLACE TRIGGER "guard_agreement_version_finalized_delete" BEFORE DELETE ON "public"."agreement_versions" FOR EACH ROW EXECUTE FUNCTION "public"."guard_agreement_version_finalized_delete"();



CREATE OR REPLACE TRIGGER "guard_agreement_version_finalized_updates" BEFORE UPDATE ON "public"."agreement_versions" FOR EACH ROW EXECUTE FUNCTION "public"."guard_agreement_version_finalized_updates"();



CREATE OR REPLACE TRIGGER "guard_companies_finance" BEFORE UPDATE ON "public"."companies" FOR EACH ROW EXECUTE FUNCTION "public"."protect_companies_finance_columns"();



CREATE OR REPLACE TRIGGER "guard_official_document_finalized_updates" BEFORE UPDATE ON "public"."official_documents" FOR EACH ROW EXECUTE FUNCTION "public"."guard_official_document_finalized_updates"();



CREATE OR REPLACE TRIGGER "guard_rental_booking_asset_sku_match" BEFORE INSERT OR UPDATE ON "public"."rental_booking_assets" FOR EACH ROW EXECUTE FUNCTION "public"."ensure_rental_booking_asset_sku_match"();



CREATE OR REPLACE TRIGGER "guard_users_sensitive" BEFORE UPDATE ON "public"."users" FOR EACH ROW EXECUTE FUNCTION "public"."protect_users_sensitive_columns"();



CREATE OR REPLACE TRIGGER "inventories_protect_default_trg" BEFORE DELETE OR UPDATE ON "public"."inventories" FOR EACH ROW EXECUTE FUNCTION "public"."inventories_protect_default"();



CREATE OR REPLACE TRIGGER "prevent_agreement_acceptance_log_delete" BEFORE DELETE ON "public"."agreement_acceptance_logs" FOR EACH ROW EXECUTE FUNCTION "public"."prevent_agreement_acceptance_log_delete"();



CREATE OR REPLACE TRIGGER "prevent_agreement_evidence_file_delete" BEFORE DELETE ON "public"."agreement_evidence_files" FOR EACH ROW EXECUTE FUNCTION "public"."prevent_agreement_evidence_file_update_delete"();



CREATE OR REPLACE TRIGGER "prevent_agreement_evidence_file_update" BEFORE UPDATE ON "public"."agreement_evidence_files" FOR EACH ROW EXECUTE FUNCTION "public"."prevent_agreement_evidence_file_update_delete"();



CREATE OR REPLACE TRIGGER "prevent_public_users_hard_delete" BEFORE DELETE ON "public"."users" FOR EACH ROW EXECUTE FUNCTION "public"."prevent_public_users_hard_delete"();



CREATE OR REPLACE TRIGGER "product_filter_options_after_change" AFTER INSERT OR DELETE ON "public"."product_filter_options" FOR EACH ROW EXECUTE FUNCTION "public"."product_filter_options_sync_trg"();



CREATE OR REPLACE TRIGGER "products_after_insert_ensure_metrics_row_trg" AFTER INSERT ON "public"."products" FOR EACH ROW EXECUTE FUNCTION "public"."ensure_product_metrics_row"();



CREATE OR REPLACE TRIGGER "products_after_sync_catalog_terms_trg" AFTER INSERT OR UPDATE OF "tag_keys", "search_keywords" ON "public"."products" FOR EACH ROW EXECUTE FUNCTION "public"."sync_catalog_terms_from_product"();



CREATE OR REPLACE TRIGGER "products_before_sync_category_keys_trg" BEFORE INSERT OR UPDATE OF "main_category_key", "tag_keys", "category_keys" ON "public"."products" FOR EACH ROW EXECUTE FUNCTION "public"."products_sync_category_keys"();



CREATE OR REPLACE TRIGGER "products_clear_filter_options_on_category_change" AFTER UPDATE OF "main_category_key" ON "public"."products" FOR EACH ROW EXECUTE FUNCTION "public"."products_clear_filter_options_on_category_change"();



CREATE OR REPLACE TRIGGER "products_resync_filter_options_from_tags_trg" AFTER INSERT OR UPDATE OF "tag_keys", "main_category_key" ON "public"."products" FOR EACH ROW EXECUTE FUNCTION "public"."products_resync_filter_options_trg"();



CREATE OR REPLACE TRIGGER "products_search_vector_trg" BEFORE INSERT OR UPDATE OF "name_th", "name_en", "name_cn", "name_jp", "brand", "main_category_key", "tag_keys", "category_keys", "description_th", "description_en", "description_cn", "description_jp", "spec", "detail_blocks", "search_keywords" ON "public"."products" FOR EACH ROW EXECUTE FUNCTION "public"."products_search_vector_update"();



CREATE OR REPLACE TRIGGER "rental_bookings_prevent_blocking_overlap" BEFORE INSERT OR UPDATE OF "status", "asset_id", "sku_id", "start_date", "end_date" ON "public"."rental_bookings" FOR EACH ROW EXECUTE FUNCTION "public"."rental_bookings_prevent_blocking_overlap"();



CREATE OR REPLACE TRIGGER "set_addresses_updated_at" BEFORE UPDATE ON "public"."addresses" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "set_admin_user_branch_access_updated_at" BEFORE UPDATE ON "public"."admin_user_branch_access" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "set_agreement_versions_updated_at" BEFORE UPDATE ON "public"."agreement_versions" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "set_asset_branch_inventory_updated_at" BEFORE UPDATE ON "public"."asset_branch_inventory" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "set_asset_checklist_template_items_updated_at" BEFORE UPDATE ON "public"."asset_checklist_template_items" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "set_asset_checklist_templates_updated_at" BEFORE UPDATE ON "public"."asset_checklist_templates" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "set_asset_documents_updated_at" BEFORE UPDATE ON "public"."asset_documents" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "set_asset_matches_updated_at" BEFORE UPDATE ON "public"."asset_matches" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "set_asset_service_events_updated_at" BEFORE UPDATE ON "public"."asset_service_events" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "set_assets_updated_at" BEFORE UPDATE ON "public"."assets" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "set_branch_document_settings_updated_at" BEFORE UPDATE ON "public"."branch_document_settings" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "set_cart_items_pricing_snapshot_defaults" BEFORE INSERT OR UPDATE ON "public"."cart_items" FOR EACH ROW EXECUTE FUNCTION "public"."cart_items_apply_pricing_snapshot_defaults"();



CREATE OR REPLACE TRIGGER "set_carts_updated_at" BEFORE UPDATE ON "public"."carts" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "set_catalog_terms_updated_at" BEFORE UPDATE ON "public"."catalog_terms" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "set_chat_conversations_updated_at" BEFORE UPDATE ON "public"."chat_conversations" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "set_companies_updated_at" BEFORE UPDATE ON "public"."companies" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "set_content_pages_updated_at" BEFORE UPDATE ON "public"."content_pages" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "set_customer_tax_profiles_updated_at" BEFORE UPDATE ON "public"."customer_tax_profiles" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "set_document_sequences_updated_at" BEFORE UPDATE ON "public"."document_sequences" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "set_filter_groups_updated_at" BEFORE UPDATE ON "public"."filter_groups" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "set_filter_options_updated_at" BEFORE UPDATE ON "public"."filter_options" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "set_home_banners_updated_at" BEFORE UPDATE ON "public"."home_banners" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "set_home_category_groups_updated_at" BEFORE UPDATE ON "public"."home_category_groups" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "set_home_category_options_updated_at" BEFORE UPDATE ON "public"."home_category_options" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "set_home_featured_assets_updated_at" BEFORE UPDATE ON "public"."home_featured_assets" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "set_home_featured_products_updated_at" BEFORE UPDATE ON "public"."home_featured_products" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "set_home_link_cards_updated_at" BEFORE UPDATE ON "public"."home_link_cards" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "set_home_partner_logos_updated_at" BEFORE UPDATE ON "public"."home_partner_logos" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "set_inventories_updated_at" BEFORE UPDATE ON "public"."inventories" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "set_main_categories_updated_at" BEFORE UPDATE ON "public"."main_categories" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "set_mixed_checkout_sessions_updated_at" BEFORE UPDATE ON "public"."mixed_checkout_sessions" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "set_mixed_payment_allocations_updated_at" BEFORE UPDATE ON "public"."mixed_payment_allocations" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "set_mixed_payment_attempts_updated_at" BEFORE UPDATE ON "public"."mixed_payment_attempts" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "set_official_documents_updated_at" BEFORE UPDATE ON "public"."official_documents" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "set_orders_updated_at" BEFORE UPDATE ON "public"."orders" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "set_payment_allocations_updated_at" BEFORE UPDATE ON "public"."payment_allocations" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "set_payment_attempts_updated_at" BEFORE UPDATE ON "public"."payment_attempts" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "set_payment_refunds_updated_at" BEFORE UPDATE ON "public"."payment_refunds" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "set_product_metrics_updated_at" BEFORE UPDATE ON "public"."product_metrics" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "set_product_skus_updated_at" BEFORE UPDATE ON "public"."product_skus" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "set_products_updated_at" BEFORE UPDATE ON "public"."products" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "set_rental_assets_updated_at" BEFORE UPDATE ON "public"."rental_assets" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "set_rental_booking_assets_updated_at" BEFORE UPDATE ON "public"."rental_booking_assets" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "set_rental_booking_checklist_items_updated_at" BEFORE UPDATE ON "public"."rental_booking_checklist_items" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "set_rental_booking_checklists_updated_at" BEFORE UPDATE ON "public"."rental_booking_checklists" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "set_rental_booking_documents_updated_at" BEFORE UPDATE ON "public"."rental_booking_documents" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "set_rental_booking_handover_items_updated_at" BEFORE UPDATE ON "public"."rental_booking_handover_items" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "set_rental_booking_payment_attempts_updated_at" BEFORE UPDATE ON "public"."rental_booking_payment_attempts" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "set_rental_booking_payment_lines_updated_at" BEFORE UPDATE ON "public"."rental_booking_payment_lines" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "set_rental_bookings_updated_at" BEFORE UPDATE ON "public"."rental_bookings" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "set_service_providers_updated_at" BEFORE UPDATE ON "public"."service_providers" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "set_sku_branch_inventory_updated_at" BEFORE UPDATE ON "public"."sku_branch_inventory" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "set_store_branches_updated_at" BEFORE UPDATE ON "public"."store_branches" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "set_system_configs_updated_at" BEFORE UPDATE ON "public"."system_configs" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "set_users_updated_at" BEFORE UPDATE ON "public"."users" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "set_walk_in_customers_updated_at" BEFORE UPDATE ON "public"."walk_in_customers" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "sku_branch_inventory_after_write_sync_summary_trg" AFTER INSERT OR DELETE OR UPDATE ON "public"."sku_branch_inventory" FOR EACH ROW EXECUTE FUNCTION "public"."sku_branch_inventory_after_write_sync_summary"();



CREATE OR REPLACE TRIGGER "sku_branch_inventory_before_sync_branch_id_trg" BEFORE INSERT OR UPDATE OF "inventory_id" ON "public"."sku_branch_inventory" FOR EACH ROW EXECUTE FUNCTION "public"."sku_branch_inventory_sync_branch_id"();



CREATE OR REPLACE TRIGGER "sku_branch_inventory_before_sync_product_id_trg" BEFORE INSERT OR UPDATE OF "sku_id" ON "public"."sku_branch_inventory" FOR EACH ROW EXECUTE FUNCTION "public"."sku_branch_inventory_sync_product_id"();



CREATE OR REPLACE TRIGGER "store_branches_after_insert_seed_inventories_trg" AFTER INSERT ON "public"."store_branches" FOR EACH ROW EXECUTE FUNCTION "public"."store_branches_after_insert_seed_inventories"();



CREATE OR REPLACE TRIGGER "trg_orders_stamp_shipped_at" BEFORE UPDATE ON "public"."orders" FOR EACH ROW EXECUTE FUNCTION "public"."orders_stamp_shipped_at"();



CREATE OR REPLACE TRIGGER "update_public_contact_settings_updated_at" BEFORE UPDATE ON "public"."public_contact_settings" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "user_wishlist_after_delete_count_trg" AFTER DELETE ON "public"."user_wishlist" FOR EACH ROW EXECUTE FUNCTION "public"."decrement_product_wishlist_count"();



CREATE OR REPLACE TRIGGER "user_wishlist_after_insert_count_trg" AFTER INSERT ON "public"."user_wishlist" FOR EACH ROW EXECUTE FUNCTION "public"."increment_product_wishlist_count"();



CREATE OR REPLACE TRIGGER "validate_agreement_acceptance_version_snapshot" BEFORE INSERT OR UPDATE ON "public"."agreement_acceptance_logs" FOR EACH ROW EXECUTE FUNCTION "public"."validate_agreement_acceptance_version_snapshot"();



CREATE OR REPLACE TRIGGER "validate_agreement_version_state" BEFORE INSERT OR UPDATE ON "public"."agreement_versions" FOR EACH ROW EXECUTE FUNCTION "public"."validate_agreement_version_state"();



CREATE OR REPLACE TRIGGER "enforce_bucket_name_length_trigger" BEFORE INSERT OR UPDATE OF "name" ON "storage"."buckets" FOR EACH ROW EXECUTE FUNCTION "storage"."enforce_bucket_name_length"();



CREATE OR REPLACE TRIGGER "protect_buckets_delete" BEFORE DELETE ON "storage"."buckets" FOR EACH STATEMENT EXECUTE FUNCTION "storage"."protect_delete"();



CREATE OR REPLACE TRIGGER "protect_objects_delete" BEFORE DELETE ON "storage"."objects" FOR EACH STATEMENT EXECUTE FUNCTION "storage"."protect_delete"();



CREATE OR REPLACE TRIGGER "update_objects_updated_at" BEFORE UPDATE ON "storage"."objects" FOR EACH ROW EXECUTE FUNCTION "storage"."update_updated_at_column"();



ALTER TABLE ONLY "public"."addresses"
    ADD CONSTRAINT "addresses_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."addresses"
    ADD CONSTRAINT "addresses_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."admin_user_branch_access"
    ADD CONSTRAINT "admin_user_branch_access_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "public"."store_branches"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."admin_user_branch_access"
    ADD CONSTRAINT "admin_user_branch_access_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."admin_user_branch_access"
    ADD CONSTRAINT "admin_user_branch_access_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."agreement_acceptance_logs"
    ADD CONSTRAINT "agreement_acceptance_logs_agreement_version_id_fkey" FOREIGN KEY ("agreement_version_id") REFERENCES "public"."agreement_versions"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."agreement_acceptance_logs"
    ADD CONSTRAINT "agreement_acceptance_logs_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "public"."rental_bookings"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."agreement_acceptance_logs"
    ADD CONSTRAINT "agreement_acceptance_logs_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."agreement_acceptance_logs"
    ADD CONSTRAINT "agreement_acceptance_logs_correction_of_acceptance_id_fkey" FOREIGN KEY ("correction_of_acceptance_id") REFERENCES "public"."agreement_acceptance_logs"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."agreement_acceptance_logs"
    ADD CONSTRAINT "agreement_acceptance_logs_customer_user_id_fkey" FOREIGN KEY ("customer_user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."agreement_acceptance_logs"
    ADD CONSTRAINT "agreement_acceptance_logs_official_document_id_fkey" FOREIGN KEY ("official_document_id") REFERENCES "public"."official_documents"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."agreement_acceptance_logs"
    ADD CONSTRAINT "agreement_acceptance_logs_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."agreement_acceptance_logs"
    ADD CONSTRAINT "agreement_acceptance_logs_staff_user_id_fkey" FOREIGN KEY ("staff_user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."agreement_acceptance_logs"
    ADD CONSTRAINT "agreement_acceptance_logs_status_changed_by_fkey" FOREIGN KEY ("status_changed_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."agreement_acceptance_logs"
    ADD CONSTRAINT "agreement_acceptance_logs_walk_in_phone_fkey" FOREIGN KEY ("walk_in_phone") REFERENCES "public"."walk_in_customers"("phone") ON UPDATE CASCADE ON DELETE SET NULL;



ALTER TABLE ONLY "public"."agreement_evidence_files"
    ADD CONSTRAINT "agreement_evidence_files_acceptance_id_fkey" FOREIGN KEY ("acceptance_id") REFERENCES "public"."agreement_acceptance_logs"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."agreement_evidence_files"
    ADD CONSTRAINT "agreement_evidence_files_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."agreement_versions"
    ADD CONSTRAINT "agreement_versions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."agreement_versions"
    ADD CONSTRAINT "agreement_versions_published_by_fkey" FOREIGN KEY ("published_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."agreement_versions"
    ADD CONSTRAINT "agreement_versions_replaces_version_id_fkey" FOREIGN KEY ("replaces_version_id") REFERENCES "public"."agreement_versions"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."agreement_versions"
    ADD CONSTRAINT "agreement_versions_retired_by_fkey" FOREIGN KEY ("retired_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."agreement_versions"
    ADD CONSTRAINT "agreement_versions_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."asset_branch_inventory"
    ADD CONSTRAINT "asset_branch_inventory_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."asset_branch_inventory"
    ADD CONSTRAINT "asset_branch_inventory_inventory_id_fkey" FOREIGN KEY ("inventory_id") REFERENCES "public"."inventories"("id") ON UPDATE CASCADE ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."asset_checklist_template_items"
    ADD CONSTRAINT "asset_checklist_template_items_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "public"."asset_checklist_templates"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."asset_checklist_templates"
    ADD CONSTRAINT "asset_checklist_templates_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."asset_documents"
    ADD CONSTRAINT "asset_documents_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."asset_documents"
    ADD CONSTRAINT "asset_documents_service_event_id_fkey" FOREIGN KEY ("service_event_id") REFERENCES "public"."asset_service_events"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."asset_filter_options"
    ADD CONSTRAINT "asset_filter_options_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."asset_filter_options"
    ADD CONSTRAINT "asset_filter_options_filter_option_id_fkey" FOREIGN KEY ("filter_option_id") REFERENCES "public"."filter_options"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."asset_matches"
    ADD CONSTRAINT "asset_matches_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."asset_matches"
    ADD CONSTRAINT "asset_matches_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."asset_service_events"
    ADD CONSTRAINT "asset_service_events_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."asset_service_events"
    ADD CONSTRAINT "asset_service_events_performed_by_user_id_fkey" FOREIGN KEY ("performed_by_user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."assets"
    ADD CONSTRAINT "assets_main_category_key_fkey" FOREIGN KEY ("main_category_key") REFERENCES "public"."main_categories"("key") ON UPDATE CASCADE;



ALTER TABLE ONLY "public"."assets"
    ADD CONSTRAINT "assets_storage_branch_id_fkey" FOREIGN KEY ("storage_branch_id") REFERENCES "public"."store_branches"("id") ON UPDATE CASCADE ON DELETE SET NULL;



ALTER TABLE ONLY "public"."assets"
    ADD CONSTRAINT "assets_storage_inventory_id_fkey" FOREIGN KEY ("storage_inventory_id") REFERENCES "public"."inventories"("id") ON UPDATE CASCADE ON DELETE SET NULL;



ALTER TABLE ONLY "public"."branch_document_settings"
    ADD CONSTRAINT "branch_document_settings_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "public"."store_branches"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."branch_document_settings"
    ADD CONSTRAINT "branch_document_settings_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."cart_items"
    ADD CONSTRAINT "cart_items_cart_id_fkey" FOREIGN KEY ("cart_id") REFERENCES "public"."carts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."carts"
    ADD CONSTRAINT "carts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."chat_attachments"
    ADD CONSTRAINT "chat_attachments_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "public"."chat_messages"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."chat_conversations"
    ADD CONSTRAINT "chat_conversations_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."chat_conversations"
    ADD CONSTRAINT "chat_conversations_last_message_id_fkey" FOREIGN KEY ("last_message_id") REFERENCES "public"."chat_messages"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."chat_messages"
    ADD CONSTRAINT "chat_messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."chat_conversations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."chat_messages"
    ADD CONSTRAINT "chat_messages_deleted_by_fkey" FOREIGN KEY ("deleted_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."chat_messages"
    ADD CONSTRAINT "chat_messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "public"."users"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."chat_participants"
    ADD CONSTRAINT "chat_participants_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."chat_conversations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."chat_participants"
    ADD CONSTRAINT "chat_participants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."company_members"
    ADD CONSTRAINT "company_members_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."company_members"
    ADD CONSTRAINT "company_members_invited_by_fkey" FOREIGN KEY ("invited_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."company_members"
    ADD CONSTRAINT "company_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."content_page_assets"
    ADD CONSTRAINT "content_page_assets_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."content_page_assets"
    ADD CONSTRAINT "content_page_assets_content_page_id_fkey" FOREIGN KEY ("content_page_id") REFERENCES "public"."content_pages"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."content_page_products"
    ADD CONSTRAINT "content_page_products_content_page_id_fkey" FOREIGN KEY ("content_page_id") REFERENCES "public"."content_pages"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."content_page_products"
    ADD CONSTRAINT "content_page_products_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."content_pages"
    ADD CONSTRAINT "content_pages_main_category_key_fkey" FOREIGN KEY ("main_category_key") REFERENCES "public"."main_categories"("key") ON UPDATE CASCADE ON DELETE SET NULL;



ALTER TABLE ONLY "public"."content_pages"
    ADD CONSTRAINT "content_pages_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "public"."service_providers"("provider_id") ON UPDATE CASCADE ON DELETE SET NULL;



ALTER TABLE ONLY "public"."customer_tax_profiles"
    ADD CONSTRAINT "customer_tax_profiles_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."customer_tax_profiles"
    ADD CONSTRAINT "customer_tax_profiles_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."customer_tax_profiles"
    ADD CONSTRAINT "customer_tax_profiles_customer_user_id_fkey" FOREIGN KEY ("customer_user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."customer_tax_profiles"
    ADD CONSTRAINT "customer_tax_profiles_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."customer_tax_profiles"
    ADD CONSTRAINT "customer_tax_profiles_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."customer_tax_profiles"
    ADD CONSTRAINT "customer_tax_profiles_walk_in_phone_fkey" FOREIGN KEY ("walk_in_phone") REFERENCES "public"."walk_in_customers"("phone") ON UPDATE CASCADE ON DELETE SET NULL;



ALTER TABLE ONLY "public"."document_events"
    ADD CONSTRAINT "document_events_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "public"."official_documents"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."document_events"
    ADD CONSTRAINT "document_events_staff_user_id_fkey" FOREIGN KEY ("staff_user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."document_sequences"
    ADD CONSTRAINT "document_sequences_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "public"."store_branches"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."filter_groups"
    ADD CONSTRAINT "filter_groups_main_category_key_fkey" FOREIGN KEY ("main_category_key") REFERENCES "public"."main_categories"("key") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."filter_options"
    ADD CONSTRAINT "filter_options_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "public"."filter_groups"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."home_category_groups"
    ADD CONSTRAINT "home_category_groups_main_category_key_fkey" FOREIGN KEY ("main_category_key") REFERENCES "public"."main_categories"("key") ON UPDATE CASCADE ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."home_category_options"
    ADD CONSTRAINT "home_category_options_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "public"."home_category_groups"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."home_featured_assets"
    ADD CONSTRAINT "home_featured_assets_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."home_featured_products"
    ADD CONSTRAINT "home_featured_products_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."home_link_cards"
    ADD CONSTRAINT "home_link_cards_content_page_id_fkey" FOREIGN KEY ("content_page_id") REFERENCES "public"."content_pages"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."inventories"
    ADD CONSTRAINT "inventories_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "public"."store_branches"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."inventory_change_log"
    ADD CONSTRAINT "inventory_change_log_changed_by_fkey" FOREIGN KEY ("changed_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."mixed_checkout_sessions"
    ADD CONSTRAINT "mixed_checkout_sessions_cart_id_fkey" FOREIGN KEY ("cart_id") REFERENCES "public"."carts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."mixed_checkout_sessions"
    ADD CONSTRAINT "mixed_checkout_sessions_sale_order_id_fkey" FOREIGN KEY ("sale_order_id") REFERENCES "public"."orders"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."mixed_checkout_sessions"
    ADD CONSTRAINT "mixed_checkout_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."mixed_payment_allocations"
    ADD CONSTRAINT "mixed_payment_allocations_mixed_checkout_session_id_fkey" FOREIGN KEY ("mixed_checkout_session_id") REFERENCES "public"."mixed_checkout_sessions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."mixed_payment_allocations"
    ADD CONSTRAINT "mixed_payment_allocations_mixed_payment_attempt_id_fkey" FOREIGN KEY ("mixed_payment_attempt_id") REFERENCES "public"."mixed_payment_attempts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."mixed_payment_allocations"
    ADD CONSTRAINT "mixed_payment_allocations_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."mixed_payment_allocations"
    ADD CONSTRAINT "mixed_payment_allocations_order_line_id_fkey" FOREIGN KEY ("order_line_id") REFERENCES "public"."order_items"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."mixed_payment_allocations"
    ADD CONSTRAINT "mixed_payment_allocations_rental_booking_id_fkey" FOREIGN KEY ("rental_booking_id") REFERENCES "public"."rental_bookings"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."mixed_payment_allocations"
    ADD CONSTRAINT "mixed_payment_allocations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."mixed_payment_attempts"
    ADD CONSTRAINT "mixed_payment_attempts_mixed_checkout_session_id_fkey" FOREIGN KEY ("mixed_checkout_session_id") REFERENCES "public"."mixed_checkout_sessions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."mixed_payment_attempts"
    ADD CONSTRAINT "mixed_payment_attempts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."official_documents"
    ADD CONSTRAINT "official_documents_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "public"."store_branches"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."official_documents"
    ADD CONSTRAINT "official_documents_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."official_documents"
    ADD CONSTRAINT "official_documents_customer_user_id_fkey" FOREIGN KEY ("customer_user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."official_documents"
    ADD CONSTRAINT "official_documents_issued_by_fkey" FOREIGN KEY ("issued_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."official_documents"
    ADD CONSTRAINT "official_documents_original_document_id_fkey" FOREIGN KEY ("original_document_id") REFERENCES "public"."official_documents"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."official_documents"
    ADD CONSTRAINT "official_documents_tax_profile_id_fkey" FOREIGN KEY ("tax_profile_id") REFERENCES "public"."customer_tax_profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."official_documents"
    ADD CONSTRAINT "official_documents_voided_by_fkey" FOREIGN KEY ("voided_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."official_documents"
    ADD CONSTRAINT "official_documents_walk_in_phone_fkey" FOREIGN KEY ("walk_in_phone") REFERENCES "public"."walk_in_customers"("phone") ON UPDATE CASCADE ON DELETE SET NULL;



ALTER TABLE ONLY "public"."order_idempotency_keys"
    ADD CONSTRAINT "order_idempotency_keys_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."order_idempotency_keys"
    ADD CONSTRAINT "order_idempotency_keys_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."order_items"
    ADD CONSTRAINT "order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_address_id_fkey" FOREIGN KEY ("address_id") REFERENCES "public"."addresses"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_cart_id_fkey" FOREIGN KEY ("cart_id") REFERENCES "public"."carts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_mixed_checkout_session_id_fkey" FOREIGN KEY ("mixed_checkout_session_id") REFERENCES "public"."mixed_checkout_sessions"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_mixed_payment_attempt_id_fkey" FOREIGN KEY ("mixed_payment_attempt_id") REFERENCES "public"."mixed_payment_attempts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_pickup_branch_id_fkey" FOREIGN KEY ("pickup_branch_id") REFERENCES "public"."store_branches"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_pos_branch_id_fkey" FOREIGN KEY ("pos_branch_id") REFERENCES "public"."store_branches"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_pos_staff_user_id_fkey" FOREIGN KEY ("pos_staff_user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_walk_in_phone_fkey" FOREIGN KEY ("walk_in_phone") REFERENCES "public"."walk_in_customers"("phone") ON UPDATE CASCADE ON DELETE SET NULL;



ALTER TABLE ONLY "public"."payment_alerts"
    ADD CONSTRAINT "payment_alerts_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "public"."rental_bookings"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."payment_alerts"
    ADD CONSTRAINT "payment_alerts_mixed_checkout_session_id_fkey" FOREIGN KEY ("mixed_checkout_session_id") REFERENCES "public"."mixed_checkout_sessions"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."payment_alerts"
    ADD CONSTRAINT "payment_alerts_mixed_payment_allocation_id_fkey" FOREIGN KEY ("mixed_payment_allocation_id") REFERENCES "public"."mixed_payment_allocations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."payment_alerts"
    ADD CONSTRAINT "payment_alerts_mixed_payment_attempt_id_fkey" FOREIGN KEY ("mixed_payment_attempt_id") REFERENCES "public"."mixed_payment_attempts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."payment_alerts"
    ADD CONSTRAINT "payment_alerts_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."payment_alerts"
    ADD CONSTRAINT "payment_alerts_payment_attempt_id_fkey" FOREIGN KEY ("payment_attempt_id") REFERENCES "public"."payment_attempts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."payment_alerts"
    ADD CONSTRAINT "payment_alerts_rental_booking_payment_attempt_id_fkey" FOREIGN KEY ("rental_booking_payment_attempt_id") REFERENCES "public"."rental_booking_payment_attempts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."payment_alerts"
    ADD CONSTRAINT "payment_alerts_resolved_by_fkey" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."payment_allocations"
    ADD CONSTRAINT "payment_allocations_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "public"."store_branches"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."payment_allocations"
    ADD CONSTRAINT "payment_allocations_original_allocation_id_fkey" FOREIGN KEY ("original_allocation_id") REFERENCES "public"."payment_allocations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."payment_allocations"
    ADD CONSTRAINT "payment_allocations_payment_attempt_id_fkey" FOREIGN KEY ("payment_attempt_id") REFERENCES "public"."payment_attempts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."payment_allocations"
    ADD CONSTRAINT "payment_allocations_related_document_id_fkey" FOREIGN KEY ("related_document_id") REFERENCES "public"."official_documents"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."payment_allocations"
    ADD CONSTRAINT "payment_allocations_reversal_of_allocation_id_fkey" FOREIGN KEY ("reversal_of_allocation_id") REFERENCES "public"."payment_allocations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."payment_allocations"
    ADD CONSTRAINT "payment_allocations_staff_user_id_fkey" FOREIGN KEY ("staff_user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."payment_attempts"
    ADD CONSTRAINT "payment_attempts_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."payment_attempts"
    ADD CONSTRAINT "payment_attempts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."payment_events"
    ADD CONSTRAINT "payment_events_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "public"."rental_bookings"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."payment_events"
    ADD CONSTRAINT "payment_events_mixed_checkout_session_id_fkey" FOREIGN KEY ("mixed_checkout_session_id") REFERENCES "public"."mixed_checkout_sessions"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."payment_events"
    ADD CONSTRAINT "payment_events_mixed_payment_attempt_id_fkey" FOREIGN KEY ("mixed_payment_attempt_id") REFERENCES "public"."mixed_payment_attempts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."payment_events"
    ADD CONSTRAINT "payment_events_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."payment_events"
    ADD CONSTRAINT "payment_events_payment_attempt_id_fkey" FOREIGN KEY ("payment_attempt_id") REFERENCES "public"."payment_attempts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."payment_events"
    ADD CONSTRAINT "payment_events_rental_booking_payment_attempt_id_fkey" FOREIGN KEY ("rental_booking_payment_attempt_id") REFERENCES "public"."rental_booking_payment_attempts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."payment_refunds"
    ADD CONSTRAINT "payment_refunds_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "public"."rental_bookings"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."payment_refunds"
    ADD CONSTRAINT "payment_refunds_cancellation_event_id_fkey" FOREIGN KEY ("cancellation_event_id") REFERENCES "public"."rental_booking_cancellation_events"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."payment_refunds"
    ADD CONSTRAINT "payment_refunds_original_mixed_payment_allocation_id_fkey" FOREIGN KEY ("original_mixed_payment_allocation_id") REFERENCES "public"."mixed_payment_allocations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."payment_refunds"
    ADD CONSTRAINT "payment_refunds_original_rental_booking_payment_attempt_id_fkey" FOREIGN KEY ("original_rental_booking_payment_attempt_id") REFERENCES "public"."rental_booking_payment_attempts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."payment_refunds"
    ADD CONSTRAINT "payment_refunds_processed_by_user_id_fkey" FOREIGN KEY ("processed_by_user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."payment_refunds"
    ADD CONSTRAINT "payment_refunds_refund_proof_id_fkey" FOREIGN KEY ("refund_proof_id") REFERENCES "public"."rental_booking_deposit_proofs"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."payment_refunds"
    ADD CONSTRAINT "payment_refunds_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."product_filter_options"
    ADD CONSTRAINT "product_filter_options_filter_option_id_fkey" FOREIGN KEY ("filter_option_id") REFERENCES "public"."filter_options"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."product_filter_options"
    ADD CONSTRAINT "product_filter_options_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."product_metrics"
    ADD CONSTRAINT "product_metrics_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."product_skus"
    ADD CONSTRAINT "product_skus_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."products"
    ADD CONSTRAINT "products_main_category_key_fkey" FOREIGN KEY ("main_category_key") REFERENCES "public"."main_categories"("key") ON UPDATE CASCADE;



ALTER TABLE ONLY "public"."public_contact_settings"
    ADD CONSTRAINT "public_contact_settings_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."rental_asset_events"
    ADD CONSTRAINT "rental_asset_events_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."rental_asset_events"
    ADD CONSTRAINT "rental_asset_events_allocation_id_fkey" FOREIGN KEY ("allocation_id") REFERENCES "public"."rental_booking_assets"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."rental_asset_events"
    ADD CONSTRAINT "rental_asset_events_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "public"."rental_assets"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."rental_asset_events"
    ADD CONSTRAINT "rental_asset_events_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "public"."rental_bookings"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."rental_assets"
    ADD CONSTRAINT "rental_assets_sku_id_fkey" FOREIGN KEY ("sku_id") REFERENCES "public"."product_skus"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."rental_booking_assets"
    ADD CONSTRAINT "rental_booking_assets_allocated_by_fkey" FOREIGN KEY ("allocated_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."rental_booking_assets"
    ADD CONSTRAINT "rental_booking_assets_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "public"."rental_assets"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."rental_booking_assets"
    ADD CONSTRAINT "rental_booking_assets_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "public"."rental_bookings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."rental_booking_assets"
    ADD CONSTRAINT "rental_booking_assets_released_by_fkey" FOREIGN KEY ("released_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."rental_booking_cancellation_events"
    ADD CONSTRAINT "rental_booking_cancellation_events_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."rental_booking_cancellation_events"
    ADD CONSTRAINT "rental_booking_cancellation_events_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "public"."rental_bookings"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."rental_booking_cancellation_events"
    ADD CONSTRAINT "rental_booking_cancellation_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."rental_booking_checklist_items"
    ADD CONSTRAINT "rental_booking_checklist_items_booking_checklist_id_fkey" FOREIGN KEY ("booking_checklist_id") REFERENCES "public"."rental_booking_checklists"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."rental_booking_checklist_items"
    ADD CONSTRAINT "rental_booking_checklist_items_checked_by_user_id_fkey" FOREIGN KEY ("checked_by_user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."rental_booking_checklist_items"
    ADD CONSTRAINT "rental_booking_checklist_items_template_item_id_fkey" FOREIGN KEY ("template_item_id") REFERENCES "public"."asset_checklist_template_items"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."rental_booking_checklists"
    ADD CONSTRAINT "rental_booking_checklists_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."rental_booking_checklists"
    ADD CONSTRAINT "rental_booking_checklists_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "public"."rental_bookings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."rental_booking_checklists"
    ADD CONSTRAINT "rental_booking_checklists_completed_by_user_id_fkey" FOREIGN KEY ("completed_by_user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."rental_booking_checklists"
    ADD CONSTRAINT "rental_booking_checklists_performed_by_user_id_fkey" FOREIGN KEY ("performed_by_user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."rental_booking_checklists"
    ADD CONSTRAINT "rental_booking_checklists_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "public"."asset_checklist_templates"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."rental_booking_deposit_action_logs"
    ADD CONSTRAINT "rental_booking_deposit_action_logs_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "public"."rental_bookings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."rental_booking_deposit_action_logs"
    ADD CONSTRAINT "rental_booking_deposit_action_logs_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "public"."store_branches"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."rental_booking_deposit_action_logs"
    ADD CONSTRAINT "rental_booking_deposit_action_logs_staff_user_id_fkey" FOREIGN KEY ("staff_user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."rental_booking_deposit_agreements"
    ADD CONSTRAINT "rental_booking_deposit_agreements_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "public"."rental_bookings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."rental_booking_deposit_agreements"
    ADD CONSTRAINT "rental_booking_deposit_agreements_payment_attempt_id_fkey" FOREIGN KEY ("payment_attempt_id") REFERENCES "public"."rental_booking_payment_attempts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."rental_booking_deposit_agreements"
    ADD CONSTRAINT "rental_booking_deposit_agreements_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."rental_booking_deposit_proofs"
    ADD CONSTRAINT "rental_booking_deposit_proofs_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "public"."rental_bookings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."rental_booking_deposit_proofs"
    ADD CONSTRAINT "rental_booking_deposit_proofs_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."rental_booking_documents"
    ADD CONSTRAINT "rental_booking_documents_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."rental_booking_documents"
    ADD CONSTRAINT "rental_booking_documents_booking_checklist_id_fkey" FOREIGN KEY ("booking_checklist_id") REFERENCES "public"."rental_booking_checklists"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."rental_booking_documents"
    ADD CONSTRAINT "rental_booking_documents_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "public"."rental_bookings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."rental_booking_documents"
    ADD CONSTRAINT "rental_booking_documents_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."rental_booking_fulfillments"
    ADD CONSTRAINT "rental_booking_fulfillments_booking_checklist_id_fkey" FOREIGN KEY ("booking_checklist_id") REFERENCES "public"."rental_booking_checklists"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."rental_booking_fulfillments"
    ADD CONSTRAINT "rental_booking_fulfillments_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "public"."rental_bookings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."rental_booking_fulfillments"
    ADD CONSTRAINT "rental_booking_fulfillments_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "public"."store_branches"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."rental_booking_fulfillments"
    ADD CONSTRAINT "rental_booking_fulfillments_performed_by_user_id_fkey" FOREIGN KEY ("performed_by_user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."rental_booking_handover_items"
    ADD CONSTRAINT "rental_booking_handover_items_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."rental_booking_handover_items"
    ADD CONSTRAINT "rental_booking_handover_items_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "public"."rental_bookings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."rental_booking_handover_items"
    ADD CONSTRAINT "rental_booking_handover_items_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."rental_booking_handover_items"
    ADD CONSTRAINT "rental_booking_handover_items_pickup_checked_by_user_id_fkey" FOREIGN KEY ("pickup_checked_by_user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."rental_booking_handover_items"
    ADD CONSTRAINT "rental_booking_handover_items_return_checked_by_user_id_fkey" FOREIGN KEY ("return_checked_by_user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."rental_booking_handover_items"
    ADD CONSTRAINT "rental_booking_handover_items_updated_by_user_id_fkey" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."rental_booking_no_show_events"
    ADD CONSTRAINT "rental_booking_no_show_events_admin_user_id_fkey" FOREIGN KEY ("admin_user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."rental_booking_no_show_events"
    ADD CONSTRAINT "rental_booking_no_show_events_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "public"."rental_bookings"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."rental_booking_payment_attempts"
    ADD CONSTRAINT "rental_booking_payment_attempts_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "public"."rental_bookings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."rental_booking_payment_attempts"
    ADD CONSTRAINT "rental_booking_payment_attempts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."rental_booking_payment_lines"
    ADD CONSTRAINT "rental_booking_payment_lines_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "public"."rental_bookings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."rental_bookings"
    ADD CONSTRAINT "rental_bookings_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."rental_bookings"
    ADD CONSTRAINT "rental_bookings_booking_deposit_mixed_allocation_id_fkey" FOREIGN KEY ("booking_deposit_mixed_allocation_id") REFERENCES "public"."mixed_payment_allocations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."rental_bookings"
    ADD CONSTRAINT "rental_bookings_booking_deposit_payment_attempt_id_fkey" FOREIGN KEY ("booking_deposit_payment_attempt_id") REFERENCES "public"."rental_booking_payment_attempts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."rental_bookings"
    ADD CONSTRAINT "rental_bookings_cancellation_source_event_id_fkey" FOREIGN KEY ("cancellation_source_event_id") REFERENCES "public"."rental_booking_cancellation_events"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."rental_bookings"
    ADD CONSTRAINT "rental_bookings_cancelled_by_user_id_fkey" FOREIGN KEY ("cancelled_by_user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."rental_bookings"
    ADD CONSTRAINT "rental_bookings_matched_product_id_fkey" FOREIGN KEY ("matched_product_id") REFERENCES "public"."products"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."rental_bookings"
    ADD CONSTRAINT "rental_bookings_no_show_event_fk" FOREIGN KEY ("no_show_source_event_id") REFERENCES "public"."rental_booking_no_show_events"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."rental_bookings"
    ADD CONSTRAINT "rental_bookings_no_show_marked_by_user_id_fkey" FOREIGN KEY ("no_show_marked_by_user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."rental_bookings"
    ADD CONSTRAINT "rental_bookings_pickup_branch_id_fkey" FOREIGN KEY ("pickup_branch_id") REFERENCES "public"."store_branches"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."rental_bookings"
    ADD CONSTRAINT "rental_bookings_pos_branch_id_fkey" FOREIGN KEY ("pos_branch_id") REFERENCES "public"."store_branches"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."rental_bookings"
    ADD CONSTRAINT "rental_bookings_pos_staff_user_id_fkey" FOREIGN KEY ("pos_staff_user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."rental_bookings"
    ADD CONSTRAINT "rental_bookings_product_id_sku_id_fkey" FOREIGN KEY ("product_id", "sku_id") REFERENCES "public"."product_skus"("product_id", "id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."rental_bookings"
    ADD CONSTRAINT "rental_bookings_return_branch_id_fkey" FOREIGN KEY ("return_branch_id") REFERENCES "public"."store_branches"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."rental_bookings"
    ADD CONSTRAINT "rental_bookings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."rental_bookings"
    ADD CONSTRAINT "rental_bookings_walk_in_phone_fkey" FOREIGN KEY ("walk_in_phone") REFERENCES "public"."walk_in_customers"("phone") ON UPDATE CASCADE ON DELETE SET NULL;



ALTER TABLE ONLY "public"."sku_branch_inventory"
    ADD CONSTRAINT "sku_branch_inventory_inventory_id_fkey" FOREIGN KEY ("inventory_id") REFERENCES "public"."inventories"("id") ON UPDATE CASCADE ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."sku_branch_inventory"
    ADD CONSTRAINT "sku_branch_inventory_new_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "public"."store_branches"("id") ON UPDATE CASCADE;



ALTER TABLE ONLY "public"."sku_branch_inventory"
    ADD CONSTRAINT "sku_branch_inventory_new_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."sku_branch_inventory"
    ADD CONSTRAINT "sku_branch_inventory_new_sku_id_fkey" FOREIGN KEY ("sku_id") REFERENCES "public"."product_skus"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."system_configs"
    ADD CONSTRAINT "system_configs_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."user_save_list"
    ADD CONSTRAINT "user_save_list_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_save_list"
    ADD CONSTRAINT "user_save_list_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "public"."content_pages"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_save_list"
    ADD CONSTRAINT "user_save_list_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_wishlist"
    ADD CONSTRAINT "user_wishlist_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_wishlist"
    ADD CONSTRAINT "user_wishlist_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_lifecycle_updated_by_fkey" FOREIGN KEY ("lifecycle_updated_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_rental_booking_restriction_overridden_by_fkey" FOREIGN KEY ("rental_booking_restriction_overridden_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_rental_booking_restriction_source_event_id_fkey" FOREIGN KEY ("rental_booking_restriction_source_event_id") REFERENCES "public"."rental_booking_cancellation_events"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_rental_booking_restriction_unrestricted_by_fkey" FOREIGN KEY ("rental_booking_restriction_unrestricted_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."walk_in_customers"
    ADD CONSTRAINT "walk_in_customers_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."walk_in_customers"
    ADD CONSTRAINT "walk_in_customers_linked_user_id_fkey" FOREIGN KEY ("linked_user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."walk_in_customers"
    ADD CONSTRAINT "walk_in_customers_updated_by_user_id_fkey" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "storage"."iceberg_namespaces"
    ADD CONSTRAINT "iceberg_namespaces_catalog_id_fkey" FOREIGN KEY ("catalog_id") REFERENCES "storage"."buckets_analytics"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "storage"."iceberg_tables"
    ADD CONSTRAINT "iceberg_tables_catalog_id_fkey" FOREIGN KEY ("catalog_id") REFERENCES "storage"."buckets_analytics"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "storage"."iceberg_tables"
    ADD CONSTRAINT "iceberg_tables_namespace_id_fkey" FOREIGN KEY ("namespace_id") REFERENCES "storage"."iceberg_namespaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "storage"."objects"
    ADD CONSTRAINT "objects_bucketId_fkey" FOREIGN KEY ("bucket_id") REFERENCES "storage"."buckets"("id");



ALTER TABLE ONLY "storage"."s3_multipart_uploads"
    ADD CONSTRAINT "s3_multipart_uploads_bucket_id_fkey" FOREIGN KEY ("bucket_id") REFERENCES "storage"."buckets"("id");



ALTER TABLE ONLY "storage"."s3_multipart_uploads_parts"
    ADD CONSTRAINT "s3_multipart_uploads_parts_bucket_id_fkey" FOREIGN KEY ("bucket_id") REFERENCES "storage"."buckets"("id");



ALTER TABLE ONLY "storage"."s3_multipart_uploads_parts"
    ADD CONSTRAINT "s3_multipart_uploads_parts_upload_id_fkey" FOREIGN KEY ("upload_id") REFERENCES "storage"."s3_multipart_uploads"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "storage"."vector_indexes"
    ADD CONSTRAINT "vector_indexes_bucket_id_fkey" FOREIGN KEY ("bucket_id") REFERENCES "storage"."buckets_vectors"("id");



CREATE POLICY "Anyone can read public contact settings" ON "public"."public_contact_settings" FOR SELECT USING (true);



CREATE POLICY "Users can delete own save list" ON "public"."user_save_list" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can delete own wishlist" ON "public"."user_wishlist" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert own save list" ON "public"."user_save_list" FOR INSERT WITH CHECK ((("auth"."uid"() = "user_id") AND ((("item_type" = 'asset'::"text") AND (EXISTS ( SELECT 1
   FROM "public"."assets" "a"
  WHERE (("a"."id" = "user_save_list"."asset_id") AND ("a"."status" = 'active'::"public"."asset_status") AND ("a"."is_hidden" = false))))) OR (("item_type" = 'service'::"text") AND (EXISTS ( SELECT 1
   FROM "public"."content_pages" "cp"
  WHERE (("cp"."id" = "user_save_list"."service_id") AND ("cp"."content_type" = 'service'::"text") AND ("cp"."is_active" = true))))))));



CREATE POLICY "Users can insert own wishlist" ON "public"."user_wishlist" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can read own save list" ON "public"."user_save_list" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can read own wishlist" ON "public"."user_wishlist" FOR SELECT USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."addresses" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "addresses_delete_company" ON "public"."addresses" FOR DELETE USING ((("company_id" IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM "public"."company_members" "cm"
  WHERE (("cm"."company_id" = "addresses"."company_id") AND ("cm"."user_id" = "auth"."uid"()) AND ("cm"."role" = 'b2b_admin'::"public"."company_role"))))));



CREATE POLICY "addresses_delete_personal" ON "public"."addresses" FOR DELETE USING ((("user_id" = "auth"."uid"()) AND ("company_id" IS NULL)));



CREATE POLICY "addresses_insert_company" ON "public"."addresses" FOR INSERT WITH CHECK ((("company_id" IS NOT NULL) AND ("user_id" IS NULL) AND (EXISTS ( SELECT 1
   FROM "public"."company_members" "cm"
  WHERE (("cm"."company_id" = "addresses"."company_id") AND ("cm"."user_id" = "auth"."uid"()) AND ("cm"."role" = 'b2b_admin'::"public"."company_role"))))));



CREATE POLICY "addresses_insert_personal" ON "public"."addresses" FOR INSERT WITH CHECK ((("user_id" = "auth"."uid"()) AND ("company_id" IS NULL)));



CREATE POLICY "addresses_select_own_or_company" ON "public"."addresses" FOR SELECT USING ((("user_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."company_members" "cm"
  WHERE (("cm"."company_id" = "addresses"."company_id") AND ("cm"."user_id" = "auth"."uid"()))))));



CREATE POLICY "addresses_update_company" ON "public"."addresses" FOR UPDATE USING ((("company_id" IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM "public"."company_members" "cm"
  WHERE (("cm"."company_id" = "addresses"."company_id") AND ("cm"."user_id" = "auth"."uid"()) AND ("cm"."role" = 'b2b_admin'::"public"."company_role")))))) WITH CHECK ((("company_id" IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM "public"."company_members" "cm"
  WHERE (("cm"."company_id" = "addresses"."company_id") AND ("cm"."user_id" = "auth"."uid"()) AND ("cm"."role" = 'b2b_admin'::"public"."company_role"))))));



CREATE POLICY "addresses_update_personal" ON "public"."addresses" FOR UPDATE USING ((("user_id" = "auth"."uid"()) AND ("company_id" IS NULL))) WITH CHECK ((("user_id" = "auth"."uid"()) AND ("company_id" IS NULL)));



ALTER TABLE "public"."admin_user_branch_access" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "admin_user_branch_access_service_role_all" ON "public"."admin_user_branch_access" TO "service_role" USING (true) WITH CHECK (true);



ALTER TABLE "public"."agreement_acceptance_logs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "agreement_acceptance_logs_service_role_all" ON "public"."agreement_acceptance_logs" TO "service_role" USING (true) WITH CHECK (true);



ALTER TABLE "public"."agreement_evidence_files" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "agreement_evidence_files_service_role_all" ON "public"."agreement_evidence_files" TO "service_role" USING (true) WITH CHECK (true);



ALTER TABLE "public"."agreement_versions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "agreement_versions_service_role_all" ON "public"."agreement_versions" TO "service_role" USING (true) WITH CHECK (true);



ALTER TABLE "public"."asset_branch_inventory" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."asset_checklist_template_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."asset_checklist_templates" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."asset_documents" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "asset_documents_select_public_or_customer" ON "public"."asset_documents" FOR SELECT USING (((("visibility" = 'public'::"public"."asset_document_visibility") AND (EXISTS ( SELECT 1
   FROM "public"."assets" "ra"
  WHERE (("ra"."id" = "asset_documents"."asset_id") AND ("ra"."status" = 'active'::"public"."asset_status") AND ("ra"."is_hidden" = false))))) OR (("visibility" = 'customer_after_booking'::"public"."asset_document_visibility") AND ("auth"."uid"() IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM "public"."rental_bookings" "rb"
  WHERE (("rb"."asset_id" = "asset_documents"."asset_id") AND ("rb"."user_id" = "auth"."uid"()) AND ("rb"."status" <> 'cancelled'::"public"."rental_booking_status")))))));



ALTER TABLE "public"."asset_filter_options" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "asset_filter_options_select_public" ON "public"."asset_filter_options" FOR SELECT USING (true);



ALTER TABLE "public"."asset_matches" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "asset_matches_select_public" ON "public"."asset_matches" FOR SELECT USING (((EXISTS ( SELECT 1
   FROM "public"."assets" "ra"
  WHERE (("ra"."id" = "asset_matches"."asset_id") AND ("ra"."status" = 'active'::"public"."asset_status") AND ("ra"."is_hidden" = false)))) AND (EXISTS ( SELECT 1
   FROM "public"."products" "p"
  WHERE (("p"."id" = "asset_matches"."product_id") AND ("p"."is_hidden" = false))))));



ALTER TABLE "public"."asset_service_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."assets" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "assets_select_public" ON "public"."assets" FOR SELECT USING ((("status" = 'active'::"public"."asset_status") AND ("is_hidden" = false)));



ALTER TABLE "public"."branch_document_settings" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "branch_document_settings_service_role_all" ON "public"."branch_document_settings" TO "service_role" USING (true) WITH CHECK (true);



ALTER TABLE "public"."cart_items" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "cart_items_delete_own" ON "public"."cart_items" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."carts"
  WHERE (("carts"."id" = "cart_items"."cart_id") AND ("carts"."user_id" = "auth"."uid"())))));



CREATE POLICY "cart_items_insert_own" ON "public"."cart_items" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."carts"
  WHERE (("carts"."id" = "cart_items"."cart_id") AND ("carts"."user_id" = "auth"."uid"())))));



CREATE POLICY "cart_items_select_own" ON "public"."cart_items" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."carts"
  WHERE (("carts"."id" = "cart_items"."cart_id") AND ("carts"."user_id" = "auth"."uid"())))));



CREATE POLICY "cart_items_update_own" ON "public"."cart_items" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."carts"
  WHERE (("carts"."id" = "cart_items"."cart_id") AND ("carts"."user_id" = "auth"."uid"())))));



ALTER TABLE "public"."carts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "carts_delete_own" ON "public"."carts" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "carts_insert_own" ON "public"."carts" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "carts_select_own" ON "public"."carts" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "carts_update_own" ON "public"."carts" FOR UPDATE USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."chat_attachments" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "chat_attachments_select_access" ON "public"."chat_attachments" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."chat_messages" "m"
  WHERE (("m"."id" = "chat_attachments"."message_id") AND "public"."chat_can_access_conversation"("m"."conversation_id")))));



ALTER TABLE "public"."chat_conversations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "chat_conversations_select_access" ON "public"."chat_conversations" FOR SELECT USING ("public"."chat_can_access_conversation"("id"));



ALTER TABLE "public"."chat_messages" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "chat_messages_select_access" ON "public"."chat_messages" FOR SELECT USING ("public"."chat_can_access_conversation"("conversation_id"));



ALTER TABLE "public"."chat_participants" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "chat_participants_select_access" ON "public"."chat_participants" FOR SELECT USING ("public"."chat_can_access_conversation"("conversation_id"));



ALTER TABLE "public"."companies" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "companies_select_member" ON "public"."companies" FOR SELECT USING ("public"."is_company_member"("id"));



CREATE POLICY "companies_update_admin" ON "public"."companies" FOR UPDATE USING ("public"."is_company_admin"("id")) WITH CHECK ("public"."is_company_admin"("id"));



ALTER TABLE "public"."company_members" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."content_page_assets" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "content_page_assets_select_public" ON "public"."content_page_assets" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."content_pages" "cp"
  WHERE (("cp"."id" = "content_page_assets"."content_page_id") AND ("cp"."is_active" = true)))));



ALTER TABLE "public"."content_page_products" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "content_page_products_select_public" ON "public"."content_page_products" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."content_pages" "cp"
  WHERE (("cp"."id" = "content_page_products"."content_page_id") AND ("cp"."is_active" = true)))));



ALTER TABLE "public"."content_pages" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "content_pages_select_public" ON "public"."content_pages" FOR SELECT USING (("is_active" = true));



ALTER TABLE "public"."customer_tax_profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "customer_tax_profiles_service_role_all" ON "public"."customer_tax_profiles" TO "service_role" USING (true) WITH CHECK (true);



ALTER TABLE "public"."document_events" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "document_events_service_role_all" ON "public"."document_events" TO "service_role" USING (true) WITH CHECK (true);



ALTER TABLE "public"."document_sequences" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "document_sequences_service_role_all" ON "public"."document_sequences" TO "service_role" USING (true) WITH CHECK (true);



ALTER TABLE "public"."filter_groups" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "filter_groups_select_public_active" ON "public"."filter_groups" FOR SELECT USING (("is_active" = true));



ALTER TABLE "public"."filter_options" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "filter_options_select_public_active" ON "public"."filter_options" FOR SELECT USING ((("is_active" = true) AND (EXISTS ( SELECT 1
   FROM "public"."filter_groups" "fg"
  WHERE (("fg"."id" = "filter_options"."group_id") AND ("fg"."is_active" = true))))));



ALTER TABLE "public"."home_banners" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "home_banners_select_public" ON "public"."home_banners" FOR SELECT USING (("is_active" = true));



ALTER TABLE "public"."home_category_groups" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "home_category_groups_select_public_active" ON "public"."home_category_groups" FOR SELECT USING (("is_active" = true));



ALTER TABLE "public"."home_category_options" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "home_category_options_select_public_active" ON "public"."home_category_options" FOR SELECT USING ((("is_active" = true) AND (EXISTS ( SELECT 1
   FROM "public"."home_category_groups" "g"
  WHERE (("g"."id" = "home_category_options"."group_id") AND ("g"."is_active" = true))))));



ALTER TABLE "public"."home_featured_assets" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "home_featured_assets_select_public" ON "public"."home_featured_assets" FOR SELECT USING ((("is_active" = true) AND (EXISTS ( SELECT 1
   FROM "public"."assets" "ra"
  WHERE (("ra"."id" = "home_featured_assets"."asset_id") AND ("ra"."status" = 'active'::"public"."asset_status") AND ("ra"."is_hidden" = false))))));



ALTER TABLE "public"."home_featured_products" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "home_featured_products_select_public" ON "public"."home_featured_products" FOR SELECT USING ((("is_active" = true) AND (EXISTS ( SELECT 1
   FROM "public"."products" "p"
  WHERE (("p"."id" = "home_featured_products"."product_id") AND ("p"."is_hidden" = false))))));



ALTER TABLE "public"."home_link_cards" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "home_link_cards_select_public" ON "public"."home_link_cards" FOR SELECT USING (("is_active" = true));



ALTER TABLE "public"."home_partner_logos" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "home_partner_logos_select_public" ON "public"."home_partner_logos" FOR SELECT USING (("is_active" = true));



ALTER TABLE "public"."inventories" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "inventories_service_role_all" ON "public"."inventories" TO "service_role" USING (true) WITH CHECK (true);



ALTER TABLE "public"."inventory_change_log" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "inventory_change_log_service_role_all" ON "public"."inventory_change_log" TO "service_role" USING (true) WITH CHECK (true);



ALTER TABLE "public"."main_categories" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "main_categories_select_public_active" ON "public"."main_categories" FOR SELECT USING (("is_active" = true));



CREATE POLICY "members_delete_admin" ON "public"."company_members" FOR DELETE USING ("public"."is_company_admin"("company_id"));



CREATE POLICY "members_insert_admin" ON "public"."company_members" FOR INSERT WITH CHECK ("public"."is_company_admin"("company_id"));



CREATE POLICY "members_select_same_company" ON "public"."company_members" FOR SELECT USING ((("user_id" = "auth"."uid"()) OR "public"."is_company_member"("company_id")));



CREATE POLICY "members_update_admin" ON "public"."company_members" FOR UPDATE USING ("public"."is_company_admin"("company_id")) WITH CHECK ("public"."is_company_admin"("company_id"));



ALTER TABLE "public"."mixed_checkout_sessions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "mixed_checkout_sessions_select_own" ON "public"."mixed_checkout_sessions" FOR SELECT USING (("user_id" = "auth"."uid"()));



CREATE POLICY "mixed_checkout_sessions_service_role_all" ON "public"."mixed_checkout_sessions" TO "service_role" USING (true) WITH CHECK (true);



ALTER TABLE "public"."mixed_payment_allocations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "mixed_payment_allocations_select_own" ON "public"."mixed_payment_allocations" FOR SELECT USING (("user_id" = "auth"."uid"()));



CREATE POLICY "mixed_payment_allocations_service_role_all" ON "public"."mixed_payment_allocations" TO "service_role" USING (true) WITH CHECK (true);



ALTER TABLE "public"."mixed_payment_attempts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "mixed_payment_attempts_select_own" ON "public"."mixed_payment_attempts" FOR SELECT USING (("user_id" = "auth"."uid"()));



CREATE POLICY "mixed_payment_attempts_service_role_all" ON "public"."mixed_payment_attempts" TO "service_role" USING (true) WITH CHECK (true);



ALTER TABLE "public"."official_documents" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "official_documents_service_role_all" ON "public"."official_documents" TO "service_role" USING (true) WITH CHECK (true);



ALTER TABLE "public"."order_idempotency_keys" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."order_items" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "order_items_select_via_owned_order" ON "public"."order_items" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."orders"
  WHERE (("orders"."id" = "order_items"."order_id") AND (("orders"."user_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
           FROM "public"."company_members" "cm"
          WHERE (("cm"."company_id" = "orders"."company_id") AND ("cm"."user_id" = "auth"."uid"())))))))));



ALTER TABLE "public"."orders" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "orders_select_own_or_company" ON "public"."orders" FOR SELECT USING ((("user_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."company_members" "cm"
  WHERE (("cm"."company_id" = "orders"."company_id") AND ("cm"."user_id" = "auth"."uid"()))))));



ALTER TABLE "public"."payment_alerts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "payment_alerts_select_admin" ON "public"."payment_alerts" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."users" "u"
  WHERE (("u"."id" = "auth"."uid"()) AND ("u"."platform_role" = ANY (ARRAY['staff'::"public"."platform_role", 'super_admin'::"public"."platform_role"]))))));



CREATE POLICY "payment_alerts_select_own_user_alerts" ON "public"."payment_alerts" FOR SELECT USING ((("audience" = 'user'::"text") AND (EXISTS ( SELECT 1
   FROM "public"."orders" "o"
  WHERE (("o"."id" = "payment_alerts"."order_id") AND ("o"."user_id" = "auth"."uid"()))))));



CREATE POLICY "payment_alerts_update_admin" ON "public"."payment_alerts" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."users" "u"
  WHERE (("u"."id" = "auth"."uid"()) AND ("u"."platform_role" = ANY (ARRAY['staff'::"public"."platform_role", 'super_admin'::"public"."platform_role"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."users" "u"
  WHERE (("u"."id" = "auth"."uid"()) AND ("u"."platform_role" = ANY (ARRAY['staff'::"public"."platform_role", 'super_admin'::"public"."platform_role"]))))));



ALTER TABLE "public"."payment_allocations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "payment_allocations_service_role_all" ON "public"."payment_allocations" TO "service_role" USING (true) WITH CHECK (true);



ALTER TABLE "public"."payment_attempts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "payment_attempts_select_own" ON "public"."payment_attempts" FOR SELECT USING (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."payment_events" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "payment_events_select_via_own_attempt" ON "public"."payment_events" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."payment_attempts" "pa"
  WHERE (("pa"."id" = "payment_events"."payment_attempt_id") AND ("pa"."user_id" = "auth"."uid"())))));



ALTER TABLE "public"."payment_refunds" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "payment_refunds_service_role_all" ON "public"."payment_refunds" TO "service_role" USING (true) WITH CHECK (true);



ALTER TABLE "public"."product_filter_options" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "product_filter_options_select_public" ON "public"."product_filter_options" FOR SELECT USING (true);



ALTER TABLE "public"."product_metrics" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "product_metrics_select_public" ON "public"."product_metrics" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."products"
  WHERE (("products"."id" = "product_metrics"."product_id") AND ("products"."is_hidden" = false)))));



ALTER TABLE "public"."product_skus" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "product_skus_select_public" ON "public"."product_skus" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."products"
  WHERE (("products"."id" = "product_skus"."product_id") AND ("products"."is_hidden" = false)))));



ALTER TABLE "public"."products" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "products_select_public" ON "public"."products" FOR SELECT USING (("is_hidden" = false));



ALTER TABLE "public"."public_contact_settings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."rental_asset_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."rental_assets" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."rental_booking_assets" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."rental_booking_cancellation_events" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "rental_booking_cancellation_events_service_role_all" ON "public"."rental_booking_cancellation_events" TO "service_role" USING (true) WITH CHECK (true);



ALTER TABLE "public"."rental_booking_checklist_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."rental_booking_checklists" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."rental_booking_deposit_action_logs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "rental_booking_deposit_action_logs_service_role_all" ON "public"."rental_booking_deposit_action_logs" TO "service_role" USING (true) WITH CHECK (true);



ALTER TABLE "public"."rental_booking_deposit_agreements" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "rental_booking_deposit_agreements_service_role_all" ON "public"."rental_booking_deposit_agreements" TO "service_role" USING (true) WITH CHECK (true);



ALTER TABLE "public"."rental_booking_deposit_proofs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "rental_booking_deposit_proofs_service_role_all" ON "public"."rental_booking_deposit_proofs" TO "service_role" USING (true) WITH CHECK (true);



ALTER TABLE "public"."rental_booking_documents" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "rental_booking_documents_select_own_visible" ON "public"."rental_booking_documents" FOR SELECT USING ((("visibility" <> 'internal'::"public"."asset_document_visibility") AND ("auth"."uid"() IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM "public"."rental_bookings" "rb"
  WHERE (("rb"."id" = "rental_booking_documents"."booking_id") AND ("rb"."user_id" = "auth"."uid"()))))));



ALTER TABLE "public"."rental_booking_fulfillments" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "rental_booking_fulfillments_service_role_all" ON "public"."rental_booking_fulfillments" TO "service_role" USING (true) WITH CHECK (true);



ALTER TABLE "public"."rental_booking_handover_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."rental_booking_payment_attempts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "rental_booking_payment_attempts_service_role_all" ON "public"."rental_booking_payment_attempts" TO "service_role" USING (true) WITH CHECK (true);



ALTER TABLE "public"."rental_booking_payment_lines" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "rental_booking_payment_lines_service_role_all" ON "public"."rental_booking_payment_lines" TO "service_role" USING (true) WITH CHECK (true);



ALTER TABLE "public"."rental_bookings" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "rental_bookings_delete_own_draft" ON "public"."rental_bookings" FOR DELETE TO "authenticated" USING ((("auth"."uid"() = "user_id") AND ("status" = 'draft'::"public"."rental_booking_status") AND ("walk_in_phone" IS NULL)));



COMMENT ON POLICY "rental_bookings_delete_own_draft" ON "public"."rental_bookings" IS 'Customers may delete only their own draft, non-walk-in booking rows. Confirmed/lifecycle records are server-controlled.';



CREATE POLICY "rental_bookings_insert_own_draft" ON "public"."rental_bookings" FOR INSERT TO "authenticated" WITH CHECK ((("auth"."uid"() = "user_id") AND ("status" = 'draft'::"public"."rental_booking_status") AND ("walk_in_phone" IS NULL)));



COMMENT ON POLICY "rental_bookings_insert_own_draft" ON "public"."rental_bookings" IS 'Customers may create only their own draft, non-walk-in booking rows. Confirmation and lifecycle changes are server-controlled.';



CREATE POLICY "rental_bookings_select_own" ON "public"."rental_bookings" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "rental_bookings_update_own_draft" ON "public"."rental_bookings" FOR UPDATE TO "authenticated" USING ((("auth"."uid"() = "user_id") AND ("status" = 'draft'::"public"."rental_booking_status") AND ("walk_in_phone" IS NULL))) WITH CHECK ((("auth"."uid"() = "user_id") AND ("status" = 'draft'::"public"."rental_booking_status") AND ("walk_in_phone" IS NULL)));



COMMENT ON POLICY "rental_bookings_update_own_draft" ON "public"."rental_bookings" IS 'Customers may update only their own draft, non-walk-in booking rows. RLS limits row state; server confirmation must validate final values.';



ALTER TABLE "public"."service_providers" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "service_providers_select_public" ON "public"."service_providers" FOR SELECT USING (true);



ALTER TABLE "public"."sku_branch_inventory" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."store_branches" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "store_branches_service_role_all" ON "public"."store_branches" TO "service_role" USING (true) WITH CHECK (true);



ALTER TABLE "public"."system_configs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "system_configs_service_role_all" ON "public"."system_configs" TO "service_role" USING (true) WITH CHECK (true);



ALTER TABLE "public"."user_save_list" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_wishlist" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."users" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "users_select_own_or_same_company" ON "public"."users" FOR SELECT USING ((("auth"."uid"() = "id") OR (EXISTS ( SELECT 1
   FROM ("public"."company_members" "my"
     JOIN "public"."company_members" "their" ON (("their"."company_id" = "my"."company_id")))
  WHERE (("my"."user_id" = "auth"."uid"()) AND ("their"."user_id" = "users"."id"))))));



CREATE POLICY "users_update_own" ON "public"."users" FOR UPDATE USING (("auth"."uid"() = "id")) WITH CHECK (("auth"."uid"() = "id"));



ALTER TABLE "public"."walk_in_customers" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "walk_in_customers_service_role_all" ON "public"."walk_in_customers" TO "service_role" USING (true) WITH CHECK (true);



ALTER TABLE "storage"."buckets" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "storage"."buckets_analytics" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "storage"."buckets_vectors" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "storage"."iceberg_namespaces" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "storage"."iceberg_tables" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "storage"."migrations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "storage"."objects" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "storage"."s3_multipart_uploads" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "storage"."s3_multipart_uploads_parts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "storage"."vector_indexes" ENABLE ROW LEVEL SECURITY;


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT USAGE ON SCHEMA "storage" TO "postgres" WITH GRANT OPTION;
GRANT USAGE ON SCHEMA "storage" TO "anon";
GRANT USAGE ON SCHEMA "storage" TO "authenticated";
GRANT USAGE ON SCHEMA "storage" TO "service_role";
GRANT ALL ON SCHEMA "storage" TO "supabase_storage_admin" WITH GRANT OPTION;
GRANT ALL ON SCHEMA "storage" TO "dashboard_user";



GRANT ALL ON FUNCTION "public"."asset_branch_inventory_sync_branch"() TO "anon";
GRANT ALL ON FUNCTION "public"."asset_branch_inventory_sync_branch"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."asset_branch_inventory_sync_branch"() TO "service_role";



GRANT ALL ON FUNCTION "public"."asset_filter_options_sync_trg"() TO "anon";
GRANT ALL ON FUNCTION "public"."asset_filter_options_sync_trg"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."asset_filter_options_sync_trg"() TO "service_role";



GRANT ALL ON FUNCTION "public"."assets_check_storage_inventory"() TO "anon";
GRANT ALL ON FUNCTION "public"."assets_check_storage_inventory"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."assets_check_storage_inventory"() TO "service_role";



GRANT ALL ON FUNCTION "public"."assets_clear_filter_options_on_category_change"() TO "anon";
GRANT ALL ON FUNCTION "public"."assets_clear_filter_options_on_category_change"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."assets_clear_filter_options_on_category_change"() TO "service_role";



GRANT ALL ON FUNCTION "public"."assets_resync_filter_options_from_tags"("p_asset_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."assets_resync_filter_options_from_tags"("p_asset_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."assets_resync_filter_options_from_tags"("p_asset_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."assets_resync_filter_options_trg"() TO "anon";
GRANT ALL ON FUNCTION "public"."assets_resync_filter_options_trg"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."assets_resync_filter_options_trg"() TO "service_role";



GRANT ALL ON FUNCTION "public"."assets_search_vector_update"() TO "anon";
GRANT ALL ON FUNCTION "public"."assets_search_vector_update"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."assets_search_vector_update"() TO "service_role";



GRANT ALL ON FUNCTION "public"."assets_sync_category_keys"() TO "anon";
GRANT ALL ON FUNCTION "public"."assets_sync_category_keys"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."assets_sync_category_keys"() TO "service_role";



GRANT ALL ON FUNCTION "public"."assets_sync_filter_keys"("p_asset_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."assets_sync_filter_keys"("p_asset_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."assets_sync_filter_keys"("p_asset_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."autocomplete_assets"("prefix" "text", "p_limit" integer, "p_include_hidden" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."autocomplete_assets"("prefix" "text", "p_limit" integer, "p_include_hidden" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."autocomplete_assets"("prefix" "text", "p_limit" integer, "p_include_hidden" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."autocomplete_products"("prefix" "text", "p_limit" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."autocomplete_products"("prefix" "text", "p_limit" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."autocomplete_products"("prefix" "text", "p_limit" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."cart_items_apply_pricing_snapshot_defaults"() TO "anon";
GRANT ALL ON FUNCTION "public"."cart_items_apply_pricing_snapshot_defaults"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."cart_items_apply_pricing_snapshot_defaults"() TO "service_role";



GRANT ALL ON FUNCTION "public"."chat_after_message_insert"() TO "anon";
GRANT ALL ON FUNCTION "public"."chat_after_message_insert"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."chat_after_message_insert"() TO "service_role";



GRANT ALL ON FUNCTION "public"."chat_archive_inactive_conversations"() TO "anon";
GRANT ALL ON FUNCTION "public"."chat_archive_inactive_conversations"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."chat_archive_inactive_conversations"() TO "service_role";



GRANT ALL ON FUNCTION "public"."chat_can_access_conversation"("target_conversation_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."chat_can_access_conversation"("target_conversation_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."chat_can_access_conversation"("target_conversation_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."chat_guard_message_write"() TO "anon";
GRANT ALL ON FUNCTION "public"."chat_guard_message_write"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."chat_guard_message_write"() TO "service_role";



GRANT ALL ON FUNCTION "public"."chat_is_participant"("target_conversation_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."chat_is_participant"("target_conversation_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."chat_is_participant"("target_conversation_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."chat_is_platform_admin"() TO "anon";
GRANT ALL ON FUNCTION "public"."chat_is_platform_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."chat_is_platform_admin"() TO "service_role";



GRANT ALL ON FUNCTION "public"."chat_mark_deleted_message_attachments_for_cleanup"() TO "anon";
GRANT ALL ON FUNCTION "public"."chat_mark_deleted_message_attachments_for_cleanup"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."chat_mark_deleted_message_attachments_for_cleanup"() TO "service_role";



GRANT ALL ON FUNCTION "public"."decrement_product_wishlist_count"() TO "anon";
GRANT ALL ON FUNCTION "public"."decrement_product_wishlist_count"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."decrement_product_wishlist_count"() TO "service_role";



GRANT ALL ON FUNCTION "public"."ensure_product_metrics_row"() TO "anon";
GRANT ALL ON FUNCTION "public"."ensure_product_metrics_row"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."ensure_product_metrics_row"() TO "service_role";



GRANT ALL ON FUNCTION "public"."ensure_rental_booking_asset_sku_match"() TO "anon";
GRANT ALL ON FUNCTION "public"."ensure_rental_booking_asset_sku_match"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."ensure_rental_booking_asset_sku_match"() TO "service_role";



GRANT ALL ON FUNCTION "public"."ensure_single_default_address"() TO "anon";
GRANT ALL ON FUNCTION "public"."ensure_single_default_address"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."ensure_single_default_address"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."f_apply_order_inventory"("p_order_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."f_apply_order_inventory"("p_order_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."f_apply_order_inventory"("p_order_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."f_apply_order_inventory"("p_order_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."f_cancel_customer_rental_booking_refund_request"("p_booking_id" "uuid", "p_user_id" "uuid", "p_cancelled_at" timestamp with time zone, "p_cancellation_reason_code" "text", "p_cancellation_reason_note" "text", "p_pickup_local_date" "date", "p_cancellation_local_date" "date", "p_refund_cutoff_date" "date", "p_refund_policy_version" "text", "p_refund_timezone" "text", "p_refund_amount" numeric, "p_original_payment_source_type" "text", "p_original_rental_booking_payment_attempt_id" "uuid", "p_original_mixed_payment_allocation_id" "uuid", "p_gateway" "public"."payment_gateway", "p_gateway_charge_id" "text", "p_gateway_payment_reference" "text", "p_currency_code" "text", "p_refund_bank_name" "text", "p_refund_bank_account_number" "text", "p_refund_bank_account_name" "text", "p_refund_contact_phone" "text", "p_refund_customer_note" "text", "p_restriction_window_started_at" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."f_cancel_customer_rental_booking_refund_request"("p_booking_id" "uuid", "p_user_id" "uuid", "p_cancelled_at" timestamp with time zone, "p_cancellation_reason_code" "text", "p_cancellation_reason_note" "text", "p_pickup_local_date" "date", "p_cancellation_local_date" "date", "p_refund_cutoff_date" "date", "p_refund_policy_version" "text", "p_refund_timezone" "text", "p_refund_amount" numeric, "p_original_payment_source_type" "text", "p_original_rental_booking_payment_attempt_id" "uuid", "p_original_mixed_payment_allocation_id" "uuid", "p_gateway" "public"."payment_gateway", "p_gateway_charge_id" "text", "p_gateway_payment_reference" "text", "p_currency_code" "text", "p_refund_bank_name" "text", "p_refund_bank_account_number" "text", "p_refund_bank_account_name" "text", "p_refund_contact_phone" "text", "p_refund_customer_note" "text", "p_restriction_window_started_at" timestamp with time zone) TO "service_role";



REVOKE ALL ON FUNCTION "public"."f_cancel_pos_sale"("p_order_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."f_cancel_pos_sale"("p_order_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."f_cancel_pos_sale"("p_order_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."f_cancel_pos_sale"("p_order_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."f_get_active_agreement_version"("p_agreement_type" "text", "p_as_of" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."f_get_active_agreement_version"("p_agreement_type" "text", "p_as_of" timestamp with time zone) TO "service_role";



REVOKE ALL ON FUNCTION "public"."f_next_document_number"("p_document_type" "text", "p_branch_id" "text", "p_period" "text", "p_prefix" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."f_next_document_number"("p_document_type" "text", "p_branch_id" "text", "p_period" "text", "p_prefix" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."filter_groups_cascade_resync_trg"() TO "anon";
GRANT ALL ON FUNCTION "public"."filter_groups_cascade_resync_trg"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."filter_groups_cascade_resync_trg"() TO "service_role";



GRANT ALL ON FUNCTION "public"."filter_groups_resync_on_key_change"() TO "anon";
GRANT ALL ON FUNCTION "public"."filter_groups_resync_on_key_change"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."filter_groups_resync_on_key_change"() TO "service_role";



GRANT ALL ON FUNCTION "public"."filter_options_cascade_resync_trg"() TO "anon";
GRANT ALL ON FUNCTION "public"."filter_options_cascade_resync_trg"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."filter_options_cascade_resync_trg"() TO "service_role";



GRANT ALL ON FUNCTION "public"."filter_options_resync_on_key_change"() TO "anon";
GRANT ALL ON FUNCTION "public"."filter_options_resync_on_key_change"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."filter_options_resync_on_key_change"() TO "service_role";



GRANT ALL ON FUNCTION "public"."filter_resync_main_category"("p_main_category" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."filter_resync_main_category"("p_main_category" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."filter_resync_main_category"("p_main_category" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."guard_agreement_acceptance_log_updates"() TO "anon";
GRANT ALL ON FUNCTION "public"."guard_agreement_acceptance_log_updates"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."guard_agreement_acceptance_log_updates"() TO "service_role";



GRANT ALL ON FUNCTION "public"."guard_agreement_version_finalized_delete"() TO "anon";
GRANT ALL ON FUNCTION "public"."guard_agreement_version_finalized_delete"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."guard_agreement_version_finalized_delete"() TO "service_role";



GRANT ALL ON FUNCTION "public"."guard_agreement_version_finalized_updates"() TO "anon";
GRANT ALL ON FUNCTION "public"."guard_agreement_version_finalized_updates"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."guard_agreement_version_finalized_updates"() TO "service_role";



GRANT ALL ON FUNCTION "public"."guard_official_document_finalized_updates"() TO "anon";
GRANT ALL ON FUNCTION "public"."guard_official_document_finalized_updates"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."guard_official_document_finalized_updates"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."increment_product_wishlist_count"() TO "anon";
GRANT ALL ON FUNCTION "public"."increment_product_wishlist_count"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."increment_product_wishlist_count"() TO "service_role";



GRANT ALL ON FUNCTION "public"."inventories_protect_default"() TO "anon";
GRANT ALL ON FUNCTION "public"."inventories_protect_default"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."inventories_protect_default"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_company_admin"("target_company_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_company_admin"("target_company_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_company_admin"("target_company_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_company_member"("target_company_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_company_member"("target_company_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_company_member"("target_company_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."normalize_catalog_search_keyword_term"("raw_value" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."normalize_catalog_search_keyword_term"("raw_value" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."normalize_catalog_search_keyword_term"("raw_value" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."normalize_catalog_tag_term"("raw_value" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."normalize_catalog_tag_term"("raw_value" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."normalize_catalog_tag_term"("raw_value" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."orders_stamp_shipped_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."orders_stamp_shipped_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."orders_stamp_shipped_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."prevent_agreement_acceptance_log_delete"() TO "anon";
GRANT ALL ON FUNCTION "public"."prevent_agreement_acceptance_log_delete"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."prevent_agreement_acceptance_log_delete"() TO "service_role";



GRANT ALL ON FUNCTION "public"."prevent_agreement_evidence_file_update_delete"() TO "anon";
GRANT ALL ON FUNCTION "public"."prevent_agreement_evidence_file_update_delete"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."prevent_agreement_evidence_file_update_delete"() TO "service_role";



GRANT ALL ON FUNCTION "public"."prevent_public_users_hard_delete"() TO "anon";
GRANT ALL ON FUNCTION "public"."prevent_public_users_hard_delete"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."prevent_public_users_hard_delete"() TO "service_role";



GRANT ALL ON FUNCTION "public"."product_filter_options_sync_trg"() TO "anon";
GRANT ALL ON FUNCTION "public"."product_filter_options_sync_trg"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."product_filter_options_sync_trg"() TO "service_role";



GRANT ALL ON FUNCTION "public"."products_clear_filter_options_on_category_change"() TO "anon";
GRANT ALL ON FUNCTION "public"."products_clear_filter_options_on_category_change"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."products_clear_filter_options_on_category_change"() TO "service_role";



GRANT ALL ON FUNCTION "public"."products_resync_filter_options_from_tags"("p_product_id" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."products_resync_filter_options_from_tags"("p_product_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."products_resync_filter_options_from_tags"("p_product_id" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."products_resync_filter_options_trg"() TO "anon";
GRANT ALL ON FUNCTION "public"."products_resync_filter_options_trg"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."products_resync_filter_options_trg"() TO "service_role";



GRANT ALL ON FUNCTION "public"."products_search_vector_update"() TO "anon";
GRANT ALL ON FUNCTION "public"."products_search_vector_update"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."products_search_vector_update"() TO "service_role";



GRANT ALL ON FUNCTION "public"."products_sync_category_keys"() TO "anon";
GRANT ALL ON FUNCTION "public"."products_sync_category_keys"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."products_sync_category_keys"() TO "service_role";



GRANT ALL ON FUNCTION "public"."products_sync_filter_keys"("p_product_id" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."products_sync_filter_keys"("p_product_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."products_sync_filter_keys"("p_product_id" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."protect_companies_finance_columns"() TO "anon";
GRANT ALL ON FUNCTION "public"."protect_companies_finance_columns"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."protect_companies_finance_columns"() TO "service_role";



GRANT ALL ON FUNCTION "public"."protect_users_sensitive_columns"() TO "anon";
GRANT ALL ON FUNCTION "public"."protect_users_sensitive_columns"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."protect_users_sensitive_columns"() TO "service_role";



GRANT ALL ON FUNCTION "public"."rental_bookings_prevent_blocking_overlap"() TO "anon";
GRANT ALL ON FUNCTION "public"."rental_bookings_prevent_blocking_overlap"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rental_bookings_prevent_blocking_overlap"() TO "service_role";



GRANT ALL ON FUNCTION "public"."search_products"("q" "text", "p_categories" "text"[], "p_type" "text", "p_brands" "text"[], "p_min_price" numeric, "p_max_price" numeric, "p_in_stock" boolean, "p_limit" integer, "p_offset" integer, "p_dynamic_filters" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."search_products"("q" "text", "p_categories" "text"[], "p_type" "text", "p_brands" "text"[], "p_min_price" numeric, "p_max_price" numeric, "p_in_stock" boolean, "p_limit" integer, "p_offset" integer, "p_dynamic_filters" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."search_products"("q" "text", "p_categories" "text"[], "p_type" "text", "p_brands" "text"[], "p_min_price" numeric, "p_max_price" numeric, "p_in_stock" boolean, "p_limit" integer, "p_offset" integer, "p_dynamic_filters" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."sku_branch_inventory_after_write_sync_summary"() TO "anon";
GRANT ALL ON FUNCTION "public"."sku_branch_inventory_after_write_sync_summary"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sku_branch_inventory_after_write_sync_summary"() TO "service_role";



GRANT ALL ON FUNCTION "public"."sku_branch_inventory_sync_branch_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."sku_branch_inventory_sync_branch_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sku_branch_inventory_sync_branch_id"() TO "service_role";



GRANT ALL ON FUNCTION "public"."sku_branch_inventory_sync_product_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."sku_branch_inventory_sync_product_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sku_branch_inventory_sync_product_id"() TO "service_role";



GRANT ALL ON FUNCTION "public"."store_branches_after_insert_seed_inventories"() TO "anon";
GRANT ALL ON FUNCTION "public"."store_branches_after_insert_seed_inventories"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."store_branches_after_insert_seed_inventories"() TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_all_product_sku_inventory_summaries"("p_product_id" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."sync_all_product_sku_inventory_summaries"("p_product_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_all_product_sku_inventory_summaries"("p_product_id" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_catalog_terms_from_asset"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_catalog_terms_from_asset"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_catalog_terms_from_asset"() TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_catalog_terms_from_product"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_catalog_terms_from_product"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_catalog_terms_from_product"() TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_product_sku_inventory_summary"("p_sku_id" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."sync_product_sku_inventory_summary"("p_sku_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_product_sku_inventory_summary"("p_sku_id" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."update_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."upsert_catalog_term"("term_kind" "text", "raw_value" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."upsert_catalog_term"("term_kind" "text", "raw_value" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."upsert_catalog_term"("term_kind" "text", "raw_value" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."validate_agreement_acceptance_version_snapshot"() TO "anon";
GRANT ALL ON FUNCTION "public"."validate_agreement_acceptance_version_snapshot"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."validate_agreement_acceptance_version_snapshot"() TO "service_role";



GRANT ALL ON FUNCTION "public"."validate_agreement_version_state"() TO "anon";
GRANT ALL ON FUNCTION "public"."validate_agreement_version_state"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."validate_agreement_version_state"() TO "service_role";



GRANT ALL ON TABLE "public"."addresses" TO "anon";
GRANT ALL ON TABLE "public"."addresses" TO "authenticated";
GRANT ALL ON TABLE "public"."addresses" TO "service_role";



GRANT ALL ON TABLE "public"."admin_user_branch_access" TO "service_role";



GRANT ALL ON TABLE "public"."agreement_acceptance_logs" TO "service_role";



GRANT ALL ON TABLE "public"."agreement_evidence_files" TO "service_role";



GRANT ALL ON TABLE "public"."agreement_versions" TO "service_role";



GRANT ALL ON TABLE "public"."asset_branch_inventory" TO "anon";
GRANT ALL ON TABLE "public"."asset_branch_inventory" TO "authenticated";
GRANT ALL ON TABLE "public"."asset_branch_inventory" TO "service_role";



GRANT ALL ON TABLE "public"."asset_checklist_template_items" TO "anon";
GRANT ALL ON TABLE "public"."asset_checklist_template_items" TO "authenticated";
GRANT ALL ON TABLE "public"."asset_checklist_template_items" TO "service_role";



GRANT ALL ON TABLE "public"."asset_checklist_templates" TO "anon";
GRANT ALL ON TABLE "public"."asset_checklist_templates" TO "authenticated";
GRANT ALL ON TABLE "public"."asset_checklist_templates" TO "service_role";



GRANT ALL ON TABLE "public"."asset_documents" TO "anon";
GRANT ALL ON TABLE "public"."asset_documents" TO "authenticated";
GRANT ALL ON TABLE "public"."asset_documents" TO "service_role";



GRANT ALL ON TABLE "public"."asset_filter_options" TO "anon";
GRANT ALL ON TABLE "public"."asset_filter_options" TO "authenticated";
GRANT ALL ON TABLE "public"."asset_filter_options" TO "service_role";



GRANT ALL ON TABLE "public"."asset_matches" TO "anon";
GRANT ALL ON TABLE "public"."asset_matches" TO "authenticated";
GRANT ALL ON TABLE "public"."asset_matches" TO "service_role";



GRANT ALL ON TABLE "public"."asset_service_events" TO "anon";
GRANT ALL ON TABLE "public"."asset_service_events" TO "authenticated";
GRANT ALL ON TABLE "public"."asset_service_events" TO "service_role";



GRANT ALL ON TABLE "public"."assets" TO "anon";
GRANT ALL ON TABLE "public"."assets" TO "authenticated";
GRANT ALL ON TABLE "public"."assets" TO "service_role";



GRANT ALL ON TABLE "public"."branch_document_settings" TO "anon";
GRANT ALL ON TABLE "public"."branch_document_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."branch_document_settings" TO "service_role";



GRANT ALL ON TABLE "public"."cart_items" TO "anon";
GRANT ALL ON TABLE "public"."cart_items" TO "authenticated";
GRANT ALL ON TABLE "public"."cart_items" TO "service_role";



GRANT ALL ON TABLE "public"."carts" TO "anon";
GRANT ALL ON TABLE "public"."carts" TO "authenticated";
GRANT ALL ON TABLE "public"."carts" TO "service_role";



GRANT ALL ON TABLE "public"."catalog_terms" TO "anon";
GRANT ALL ON TABLE "public"."catalog_terms" TO "authenticated";
GRANT ALL ON TABLE "public"."catalog_terms" TO "service_role";



GRANT ALL ON SEQUENCE "public"."catalog_terms_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."catalog_terms_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."catalog_terms_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."chat_attachments" TO "anon";
GRANT ALL ON TABLE "public"."chat_attachments" TO "authenticated";
GRANT ALL ON TABLE "public"."chat_attachments" TO "service_role";



GRANT ALL ON TABLE "public"."chat_conversations" TO "anon";
GRANT ALL ON TABLE "public"."chat_conversations" TO "authenticated";
GRANT ALL ON TABLE "public"."chat_conversations" TO "service_role";



GRANT ALL ON TABLE "public"."chat_messages" TO "anon";
GRANT ALL ON TABLE "public"."chat_messages" TO "authenticated";
GRANT ALL ON TABLE "public"."chat_messages" TO "service_role";



GRANT ALL ON TABLE "public"."chat_participants" TO "anon";
GRANT ALL ON TABLE "public"."chat_participants" TO "authenticated";
GRANT ALL ON TABLE "public"."chat_participants" TO "service_role";



GRANT ALL ON TABLE "public"."companies" TO "anon";
GRANT ALL ON TABLE "public"."companies" TO "authenticated";
GRANT ALL ON TABLE "public"."companies" TO "service_role";



GRANT ALL ON TABLE "public"."company_members" TO "anon";
GRANT ALL ON TABLE "public"."company_members" TO "authenticated";
GRANT ALL ON TABLE "public"."company_members" TO "service_role";



GRANT ALL ON TABLE "public"."content_page_assets" TO "anon";
GRANT ALL ON TABLE "public"."content_page_assets" TO "authenticated";
GRANT ALL ON TABLE "public"."content_page_assets" TO "service_role";



GRANT ALL ON TABLE "public"."content_page_products" TO "anon";
GRANT ALL ON TABLE "public"."content_page_products" TO "authenticated";
GRANT ALL ON TABLE "public"."content_page_products" TO "service_role";



GRANT ALL ON TABLE "public"."content_pages" TO "anon";
GRANT ALL ON TABLE "public"."content_pages" TO "authenticated";
GRANT ALL ON TABLE "public"."content_pages" TO "service_role";



GRANT ALL ON TABLE "public"."customer_tax_profiles" TO "anon";
GRANT ALL ON TABLE "public"."customer_tax_profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."customer_tax_profiles" TO "service_role";



GRANT ALL ON TABLE "public"."document_events" TO "anon";
GRANT ALL ON TABLE "public"."document_events" TO "authenticated";
GRANT ALL ON TABLE "public"."document_events" TO "service_role";



GRANT ALL ON TABLE "public"."document_sequences" TO "anon";
GRANT ALL ON TABLE "public"."document_sequences" TO "authenticated";
GRANT ALL ON TABLE "public"."document_sequences" TO "service_role";



GRANT ALL ON TABLE "public"."filter_groups" TO "anon";
GRANT ALL ON TABLE "public"."filter_groups" TO "authenticated";
GRANT ALL ON TABLE "public"."filter_groups" TO "service_role";



GRANT ALL ON TABLE "public"."filter_options" TO "anon";
GRANT ALL ON TABLE "public"."filter_options" TO "authenticated";
GRANT ALL ON TABLE "public"."filter_options" TO "service_role";



GRANT ALL ON TABLE "public"."home_banners" TO "anon";
GRANT ALL ON TABLE "public"."home_banners" TO "authenticated";
GRANT ALL ON TABLE "public"."home_banners" TO "service_role";



GRANT ALL ON TABLE "public"."home_category_groups" TO "anon";
GRANT ALL ON TABLE "public"."home_category_groups" TO "authenticated";
GRANT ALL ON TABLE "public"."home_category_groups" TO "service_role";



GRANT ALL ON TABLE "public"."home_category_options" TO "anon";
GRANT ALL ON TABLE "public"."home_category_options" TO "authenticated";
GRANT ALL ON TABLE "public"."home_category_options" TO "service_role";



GRANT ALL ON TABLE "public"."home_featured_assets" TO "anon";
GRANT ALL ON TABLE "public"."home_featured_assets" TO "authenticated";
GRANT ALL ON TABLE "public"."home_featured_assets" TO "service_role";



GRANT ALL ON TABLE "public"."home_featured_products" TO "anon";
GRANT ALL ON TABLE "public"."home_featured_products" TO "authenticated";
GRANT ALL ON TABLE "public"."home_featured_products" TO "service_role";



GRANT ALL ON TABLE "public"."home_link_cards" TO "anon";
GRANT ALL ON TABLE "public"."home_link_cards" TO "authenticated";
GRANT ALL ON TABLE "public"."home_link_cards" TO "service_role";



GRANT ALL ON TABLE "public"."home_partner_logos" TO "anon";
GRANT ALL ON TABLE "public"."home_partner_logos" TO "authenticated";
GRANT ALL ON TABLE "public"."home_partner_logos" TO "service_role";



GRANT ALL ON TABLE "public"."inventories" TO "anon";
GRANT ALL ON TABLE "public"."inventories" TO "authenticated";
GRANT ALL ON TABLE "public"."inventories" TO "service_role";



GRANT ALL ON TABLE "public"."inventory_change_log" TO "anon";
GRANT ALL ON TABLE "public"."inventory_change_log" TO "authenticated";
GRANT ALL ON TABLE "public"."inventory_change_log" TO "service_role";



GRANT ALL ON TABLE "public"."main_categories" TO "anon";
GRANT ALL ON TABLE "public"."main_categories" TO "authenticated";
GRANT ALL ON TABLE "public"."main_categories" TO "service_role";



GRANT ALL ON TABLE "public"."mixed_checkout_sessions" TO "anon";
GRANT ALL ON TABLE "public"."mixed_checkout_sessions" TO "authenticated";
GRANT ALL ON TABLE "public"."mixed_checkout_sessions" TO "service_role";



GRANT ALL ON TABLE "public"."mixed_payment_allocations" TO "anon";
GRANT ALL ON TABLE "public"."mixed_payment_allocations" TO "authenticated";
GRANT ALL ON TABLE "public"."mixed_payment_allocations" TO "service_role";



GRANT ALL ON TABLE "public"."mixed_payment_attempts" TO "anon";
GRANT ALL ON TABLE "public"."mixed_payment_attempts" TO "authenticated";
GRANT ALL ON TABLE "public"."mixed_payment_attempts" TO "service_role";



GRANT ALL ON TABLE "public"."official_documents" TO "anon";
GRANT ALL ON TABLE "public"."official_documents" TO "authenticated";
GRANT ALL ON TABLE "public"."official_documents" TO "service_role";



GRANT ALL ON TABLE "public"."order_idempotency_keys" TO "anon";
GRANT ALL ON TABLE "public"."order_idempotency_keys" TO "authenticated";
GRANT ALL ON TABLE "public"."order_idempotency_keys" TO "service_role";



GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."order_items" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."order_items" TO "authenticated";
GRANT ALL ON TABLE "public"."order_items" TO "service_role";



GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."orders" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."orders" TO "authenticated";
GRANT ALL ON TABLE "public"."orders" TO "service_role";



GRANT ALL ON TABLE "public"."payment_alerts" TO "anon";
GRANT ALL ON TABLE "public"."payment_alerts" TO "authenticated";
GRANT ALL ON TABLE "public"."payment_alerts" TO "service_role";



GRANT ALL ON TABLE "public"."payment_allocations" TO "anon";
GRANT ALL ON TABLE "public"."payment_allocations" TO "authenticated";
GRANT ALL ON TABLE "public"."payment_allocations" TO "service_role";



GRANT ALL ON TABLE "public"."payment_attempts" TO "anon";
GRANT ALL ON TABLE "public"."payment_attempts" TO "authenticated";
GRANT ALL ON TABLE "public"."payment_attempts" TO "service_role";



GRANT ALL ON TABLE "public"."payment_events" TO "anon";
GRANT ALL ON TABLE "public"."payment_events" TO "authenticated";
GRANT ALL ON TABLE "public"."payment_events" TO "service_role";



GRANT ALL ON TABLE "public"."payment_refunds" TO "anon";
GRANT ALL ON TABLE "public"."payment_refunds" TO "authenticated";
GRANT ALL ON TABLE "public"."payment_refunds" TO "service_role";



GRANT ALL ON TABLE "public"."product_filter_options" TO "anon";
GRANT ALL ON TABLE "public"."product_filter_options" TO "authenticated";
GRANT ALL ON TABLE "public"."product_filter_options" TO "service_role";



GRANT ALL ON TABLE "public"."product_metrics" TO "anon";
GRANT ALL ON TABLE "public"."product_metrics" TO "authenticated";
GRANT ALL ON TABLE "public"."product_metrics" TO "service_role";



GRANT ALL ON TABLE "public"."product_skus" TO "anon";
GRANT ALL ON TABLE "public"."product_skus" TO "authenticated";
GRANT ALL ON TABLE "public"."product_skus" TO "service_role";



GRANT ALL ON TABLE "public"."products" TO "anon";
GRANT ALL ON TABLE "public"."products" TO "authenticated";
GRANT ALL ON TABLE "public"."products" TO "service_role";



GRANT ALL ON TABLE "public"."public_contact_settings" TO "anon";
GRANT ALL ON TABLE "public"."public_contact_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."public_contact_settings" TO "service_role";



GRANT ALL ON TABLE "public"."rental_asset_events" TO "anon";
GRANT ALL ON TABLE "public"."rental_asset_events" TO "authenticated";
GRANT ALL ON TABLE "public"."rental_asset_events" TO "service_role";



GRANT ALL ON TABLE "public"."rental_assets" TO "anon";
GRANT ALL ON TABLE "public"."rental_assets" TO "authenticated";
GRANT ALL ON TABLE "public"."rental_assets" TO "service_role";



GRANT ALL ON TABLE "public"."rental_booking_assets" TO "anon";
GRANT ALL ON TABLE "public"."rental_booking_assets" TO "authenticated";
GRANT ALL ON TABLE "public"."rental_booking_assets" TO "service_role";



GRANT ALL ON TABLE "public"."rental_booking_cancellation_events" TO "anon";
GRANT ALL ON TABLE "public"."rental_booking_cancellation_events" TO "authenticated";
GRANT ALL ON TABLE "public"."rental_booking_cancellation_events" TO "service_role";



GRANT ALL ON TABLE "public"."rental_booking_checklist_items" TO "anon";
GRANT ALL ON TABLE "public"."rental_booking_checklist_items" TO "authenticated";
GRANT ALL ON TABLE "public"."rental_booking_checklist_items" TO "service_role";



GRANT ALL ON TABLE "public"."rental_booking_checklists" TO "anon";
GRANT ALL ON TABLE "public"."rental_booking_checklists" TO "authenticated";
GRANT ALL ON TABLE "public"."rental_booking_checklists" TO "service_role";



GRANT ALL ON TABLE "public"."rental_booking_deposit_action_logs" TO "service_role";



GRANT ALL ON TABLE "public"."rental_booking_deposit_agreements" TO "anon";
GRANT ALL ON TABLE "public"."rental_booking_deposit_agreements" TO "authenticated";
GRANT ALL ON TABLE "public"."rental_booking_deposit_agreements" TO "service_role";



GRANT ALL ON TABLE "public"."rental_booking_deposit_proofs" TO "service_role";



GRANT ALL ON TABLE "public"."rental_booking_documents" TO "anon";
GRANT ALL ON TABLE "public"."rental_booking_documents" TO "authenticated";
GRANT ALL ON TABLE "public"."rental_booking_documents" TO "service_role";



GRANT ALL ON TABLE "public"."rental_booking_fulfillments" TO "service_role";



GRANT ALL ON TABLE "public"."rental_booking_handover_items" TO "anon";
GRANT ALL ON TABLE "public"."rental_booking_handover_items" TO "authenticated";
GRANT ALL ON TABLE "public"."rental_booking_handover_items" TO "service_role";



GRANT ALL ON TABLE "public"."rental_booking_no_show_events" TO "anon";
GRANT ALL ON TABLE "public"."rental_booking_no_show_events" TO "authenticated";
GRANT ALL ON TABLE "public"."rental_booking_no_show_events" TO "service_role";



GRANT ALL ON TABLE "public"."rental_booking_payment_attempts" TO "anon";
GRANT ALL ON TABLE "public"."rental_booking_payment_attempts" TO "authenticated";
GRANT ALL ON TABLE "public"."rental_booking_payment_attempts" TO "service_role";



GRANT ALL ON TABLE "public"."rental_booking_payment_lines" TO "anon";
GRANT ALL ON TABLE "public"."rental_booking_payment_lines" TO "authenticated";
GRANT ALL ON TABLE "public"."rental_booking_payment_lines" TO "service_role";



GRANT ALL ON TABLE "public"."rental_bookings" TO "anon";
GRANT ALL ON TABLE "public"."rental_bookings" TO "authenticated";
GRANT ALL ON TABLE "public"."rental_bookings" TO "service_role";



GRANT ALL ON TABLE "public"."service_providers" TO "service_role";



GRANT SELECT("provider_id") ON TABLE "public"."service_providers" TO "anon";
GRANT SELECT("provider_id") ON TABLE "public"."service_providers" TO "authenticated";



GRANT SELECT("provider_type") ON TABLE "public"."service_providers" TO "anon";
GRANT SELECT("provider_type") ON TABLE "public"."service_providers" TO "authenticated";



GRANT SELECT("is_verified") ON TABLE "public"."service_providers" TO "anon";
GRANT SELECT("is_verified") ON TABLE "public"."service_providers" TO "authenticated";



GRANT SELECT("contact_phone") ON TABLE "public"."service_providers" TO "anon";
GRANT SELECT("contact_phone") ON TABLE "public"."service_providers" TO "authenticated";



GRANT SELECT("contact_email") ON TABLE "public"."service_providers" TO "anon";
GRANT SELECT("contact_email") ON TABLE "public"."service_providers" TO "authenticated";



GRANT SELECT("google_maps_url") ON TABLE "public"."service_providers" TO "anon";
GRANT SELECT("google_maps_url") ON TABLE "public"."service_providers" TO "authenticated";



GRANT SELECT("created_at") ON TABLE "public"."service_providers" TO "anon";
GRANT SELECT("created_at") ON TABLE "public"."service_providers" TO "authenticated";



GRANT SELECT("updated_at") ON TABLE "public"."service_providers" TO "anon";
GRANT SELECT("updated_at") ON TABLE "public"."service_providers" TO "authenticated";



GRANT SELECT("line_id") ON TABLE "public"."service_providers" TO "anon";
GRANT SELECT("line_id") ON TABLE "public"."service_providers" TO "authenticated";



GRANT SELECT("line_url") ON TABLE "public"."service_providers" TO "anon";
GRANT SELECT("line_url") ON TABLE "public"."service_providers" TO "authenticated";



GRANT ALL ON TABLE "public"."sku_branch_inventory" TO "anon";
GRANT ALL ON TABLE "public"."sku_branch_inventory" TO "authenticated";
GRANT ALL ON TABLE "public"."sku_branch_inventory" TO "service_role";



GRANT ALL ON TABLE "public"."store_branches" TO "service_role";



GRANT ALL ON TABLE "public"."system_configs" TO "anon";
GRANT ALL ON TABLE "public"."system_configs" TO "authenticated";
GRANT ALL ON TABLE "public"."system_configs" TO "service_role";



GRANT ALL ON TABLE "public"."user_save_list" TO "anon";
GRANT ALL ON TABLE "public"."user_save_list" TO "authenticated";
GRANT ALL ON TABLE "public"."user_save_list" TO "service_role";



GRANT ALL ON TABLE "public"."user_wishlist" TO "anon";
GRANT ALL ON TABLE "public"."user_wishlist" TO "authenticated";
GRANT ALL ON TABLE "public"."user_wishlist" TO "service_role";



GRANT ALL ON TABLE "public"."users" TO "anon";
GRANT ALL ON TABLE "public"."users" TO "authenticated";
GRANT ALL ON TABLE "public"."users" TO "service_role";



GRANT ALL ON TABLE "public"."walk_in_customers" TO "service_role";



GRANT ALL ON TABLE "storage"."buckets" TO "postgres" WITH GRANT OPTION;
GRANT ALL ON TABLE "storage"."buckets" TO "service_role";
GRANT ALL ON TABLE "storage"."buckets" TO "authenticated";
GRANT ALL ON TABLE "storage"."buckets" TO "anon";



GRANT ALL ON TABLE "storage"."buckets_analytics" TO "service_role";
GRANT ALL ON TABLE "storage"."buckets_analytics" TO "authenticated";
GRANT ALL ON TABLE "storage"."buckets_analytics" TO "anon";



GRANT SELECT ON TABLE "storage"."buckets_vectors" TO "service_role";
GRANT SELECT ON TABLE "storage"."buckets_vectors" TO "authenticated";
GRANT SELECT ON TABLE "storage"."buckets_vectors" TO "anon";



GRANT ALL ON TABLE "storage"."iceberg_namespaces" TO "service_role";
GRANT SELECT ON TABLE "storage"."iceberg_namespaces" TO "authenticated";
GRANT SELECT ON TABLE "storage"."iceberg_namespaces" TO "anon";



GRANT ALL ON TABLE "storage"."iceberg_tables" TO "service_role";
GRANT SELECT ON TABLE "storage"."iceberg_tables" TO "authenticated";
GRANT SELECT ON TABLE "storage"."iceberg_tables" TO "anon";



GRANT ALL ON TABLE "storage"."objects" TO "postgres" WITH GRANT OPTION;
GRANT ALL ON TABLE "storage"."objects" TO "service_role";
GRANT ALL ON TABLE "storage"."objects" TO "authenticated";
GRANT ALL ON TABLE "storage"."objects" TO "anon";



GRANT ALL ON TABLE "storage"."s3_multipart_uploads" TO "service_role";
GRANT SELECT ON TABLE "storage"."s3_multipart_uploads" TO "authenticated";
GRANT SELECT ON TABLE "storage"."s3_multipart_uploads" TO "anon";



GRANT ALL ON TABLE "storage"."s3_multipart_uploads_parts" TO "service_role";
GRANT SELECT ON TABLE "storage"."s3_multipart_uploads_parts" TO "authenticated";
GRANT SELECT ON TABLE "storage"."s3_multipart_uploads_parts" TO "anon";



GRANT SELECT ON TABLE "storage"."vector_indexes" TO "service_role";
GRANT SELECT ON TABLE "storage"."vector_indexes" TO "authenticated";
GRANT SELECT ON TABLE "storage"."vector_indexes" TO "anon";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "storage" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "storage" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "storage" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "storage" GRANT ALL ON SEQUENCES TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "storage" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "storage" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "storage" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "storage" GRANT ALL ON FUNCTIONS TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "storage" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "storage" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "storage" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "storage" GRANT ALL ON TABLES TO "service_role";




