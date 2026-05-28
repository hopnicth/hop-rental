#!/usr/bin/env bash
# validate_phase1a.sh — Phase 1A validation for 096 + 097
# Usage: bash supabase/snippets/validate_phase1a.sh
# Expected: 41 PASS, 0 FAIL
DB="docker exec supabase_db_hop-rental psql -U postgres -d postgres"
PASS=0; FAIL=0
run() {
  local label="$1" sql="$2" expect="$3" result
  result=$($DB -tA -c "$sql" 2>&1)
  if echo "$result" | grep -qF "$expect"; then echo "PASS | $label"; PASS=$((PASS+1))
  else echo "FAIL | $label"; echo "  exp: $expect"; echo "  got: $result"; FAIL=$((FAIL+1)); fi
}
reject() {
  local label="$1" sql="$2" result
  result=$($DB -tA -c "$sql" 2>&1)
  if echo "$result" | grep -qiE "ERROR|violates"; then echo "PASS | $label"; PASS=$((PASS+1))
  else echo "FAIL | $label (not rejected)"; echo "  got: $result"; Fail=$((FAIL+1)); fi
}
accept() {
  local label="$1" ins="$2" del="$3" result
  result=$($DB -tA -c "$ins" 2>&1)
  if echo "$result" | grep -qiE "ERROR|violates"; then echo "FAIL | $label (not accepted)"; echo "  got: $result"; FAIL=$((FAIL+1))
  else $DB -tA -c "$del" >/dev/null 2>&1; echo "PASS | $label"; PASS=$((PASS+1)); fi
}
echo "======================================================"
echo " Phase 1A Local Validation (096 + 097)"
echo "======================================================"

# ── Migrations applied ──────────────────────────────────────
run "CHECK 01: 096 applied" "SELECT version FROM supabase_migrations.schema_migrations WHERE version='096'" "096"
run "CHECK 02: 097 applied" "SELECT version FROM supabase_migrations.schema_migrations WHERE version='097'" "097"

# ── Table & columns ─────────────────────────────────────────
run "CHECK 03: partner_profiles table exists" "SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name='partner_profiles'" "partner_profiles"
run "CHECK 04: service_areas TEXT[] NOT NULL default={}" "SELECT udt_name||'|'||is_nullable||'|'||column_default FROM information_schema.columns WHERE table_schema='public' AND table_name='partner_profiles' AND column_name='service_areas'" "_text|NO|'{}'::text[]"
run "CHECK 05: business_hours_text nullable TEXT" "SELECT data_type||'|'||is_nullable FROM information_schema.columns WHERE table_schema='public' AND table_name='partner_profiles' AND column_name='business_hours_text'" "text|YES"
run "CHECK 06: name_th NOT NULL" "SELECT is_nullable FROM information_schema.columns WHERE table_schema='public' AND table_name='partner_profiles' AND column_name='name_th'" "NO"
run "CHECK 07: name_en nullable" "SELECT is_nullable FROM information_schema.columns WHERE table_schema='public' AND table_name='partner_profiles' AND column_name='name_en'" "YES"
run "CHECK 08: kyc_documents JSONB NOT NULL" "SELECT data_type||'|'||is_nullable FROM information_schema.columns WHERE table_schema='public' AND table_name='partner_profiles' AND column_name='kyc_documents'" "jsonb|NO"

# ── Grants ──────────────────────────────────────────────────
run "CHECK 09: business_hours_text in anon SELECT" "SELECT column_name FROM information_schema.column_privileges WHERE table_schema='public' AND table_name='partner_profiles' AND column_name='business_hours_text' AND grantee='anon' AND privilege_type='SELECT'" "business_hours_text"
run "CHECK 10: kyc_documents NOT in anon grants" "SELECT COUNT(*)::text FROM information_schema.column_privileges WHERE table_schema='public' AND table_name='partner_profiles' AND column_name='kyc_documents' AND grantee='anon'" "0"
run "CHECK 11: verified_notes NOT in anon grants" "SELECT COUNT(*)::text FROM information_schema.column_privileges WHERE table_schema='public' AND table_name='partner_profiles' AND column_name='verified_notes' AND grantee='anon'" "0"
run "CHECK 12: internal_notes NOT in anon grants" "SELECT COUNT(*)::text FROM information_schema.column_privileges WHERE table_schema='public' AND table_name='partner_profiles' AND column_name='internal_notes' AND grantee='anon'" "0"

# ── RLS & policies ──────────────────────────────────────────
run "CHECK 13: RLS enabled" "SELECT relrowsecurity::text FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname='partner_profiles'" "t"
run "CHECK 14: select policy USING is_public=true" "SELECT qual FROM pg_policies WHERE schemaname='public' AND tablename='partner_profiles' AND policyname='partner_profiles_select_public'" "is_public"
run "CHECK 15: service_role ALL policy" "SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='partner_profiles' AND policyname='partner_profiles_service_role_all'" "partner_profiles_service_role_all"

# ── Trigger (cast tgenabled to text — it is PostgreSQL char type) ───
run "CHECK 16: updated_at trigger enabled (tgenabled::text=O)" "SELECT tgname||'|'||tgenabled::text FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname='partner_profiles' AND tgname='set_partner_profiles_updated_at'" "set_partner_profiles_updated_at|O"

# ── Constraint presence ─────────────────────────────────────
run "CHECK 17: slug format constraint" "SELECT COUNT(*)::text FROM pg_constraint WHERE conrelid='public.partner_profiles'::regclass AND contype='c' AND conname='partner_profiles_slug_check'" "1"
run "CHECK 18: reserved slug constraint" "SELECT COUNT(*)::text FROM pg_constraint WHERE conrelid='public.partner_profiles'::regclass AND contype='c' AND conname='partner_profiles_slug_check1'" "1"
run "CHECK 19: directory_type constraint" "SELECT COUNT(*)::text FROM pg_constraint WHERE conrelid='public.partner_profiles'::regclass AND contype='c' AND conname='partner_profiles_directory_type_check'" "1"
run "CHECK 20: entity_type constraint" "SELECT COUNT(*)::text FROM pg_constraint WHERE conrelid='public.partner_profiles'::regclass AND contype='c' AND conname='partner_profiles_entity_type_check'" "1"
run "CHECK 21: line_url constraint" "SELECT COUNT(*)::text FROM pg_constraint WHERE conrelid='public.partner_profiles'::regclass AND contype='c' AND conname='partner_profiles_line_url_check'" "1"
run "CHECK 22: maps_url constraint" "SELECT COUNT(*)::text FROM pg_constraint WHERE conrelid='public.partner_profiles'::regclass AND contype='c' AND conname='partner_profiles_maps_url_check'" "1"
# CHECK 23: constraint definition contains maps\.app\.goo\.gl (DB stores backslash-escaped dots)
# grep -F searches for the literal string; use \\ in bash double-quotes to pass one backslash.
run "CHECK 23: maps_url constraint has maps\\.app\\.goo\\.gl" \
  "SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid='public.partner_profiles'::regclass AND conname='partner_profiles_maps_url_check'" \
  "maps\\.app\\.goo\\.gl"

# CHECK 23b: standalone goo.gl (the removed domain) must be absent.
# sed strips maps\.app\.goo\.gl first, then checks nothing matching goo[.\]gl remains.
MAPS_DEF=$($DB -tA -c "SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid='public.partner_profiles'::regclass AND conname='partner_profiles_maps_url_check'" 2>&1)
STRIPPED=$(echo "$MAPS_DEF" | sed 's/maps\\\.app\\\.goo\\\.gl//g')
if echo "$STRIPPED" | grep -qE "goo[\\.]gl"; then
  echo "FAIL | CHECK 23b: standalone goo.gl still in maps_url constraint"; FAIL=$((FAIL+1))
else
  echo "PASS | CHECK 23b: standalone goo.gl absent, maps.app.goo.gl kept"; PASS=$((PASS+1))
fi

# ── Category seed ───────────────────────────────────────────
run "CHECK 24: 20 partner categories seeded" "SELECT COUNT(*)::text FROM public.main_categories WHERE entity_types @> ARRAY['partner']::TEXT[]" "20"
run "CHECK 25: 7 store_ categories" "SELECT COUNT(*)::text FROM public.main_categories WHERE key LIKE 'store_%' AND entity_types @> ARRAY['partner']::TEXT[]" "7"
run "CHECK 26: 6 service_ categories" "SELECT COUNT(*)::text FROM public.main_categories WHERE key LIKE 'service_%' AND entity_types @> ARRAY['partner']::TEXT[]" "6"
run "CHECK 27: 7 contractor_ categories" "SELECT COUNT(*)::text FROM public.main_categories WHERE key LIKE 'contractor_%' AND entity_types @> ARRAY['partner']::TEXT[]" "7"
run "CHECK 28: all 20 partner categories is_active=true" "SELECT COUNT(*)::text FROM public.main_categories WHERE entity_types @> ARRAY['partner']::TEXT[] AND is_active=true" "20"
run "CHECK 29: no entity_types outside allowed set" "SELECT COUNT(*)::text FROM public.main_categories WHERE NOT (entity_types <@ ARRAY['product','asset','service','promotion','blog','review','partner']::TEXT[])" "0"

# ── Live INSERT constraint enforcement ──────────────────────
reject "CHECK 30: reserved slug [admin] blocked" "INSERT INTO public.partner_profiles(slug,directory_type,entity_type,name_th) VALUES('admin','store','organization','T')"
reject "CHECK 31: reserved slug [stores] blocked" "INSERT INTO public.partner_profiles(slug,directory_type,entity_type,name_th) VALUES('stores','store','organization','T')"
reject "CHECK 32: reserved slug [services] blocked" "INSERT INTO public.partner_profiles(slug,directory_type,entity_type,name_th) VALUES('services','service','organization','T')"
reject "CHECK 33: reserved slug [contractors] blocked" "INSERT INTO public.partner_profiles(slug,directory_type,entity_type,name_th) VALUES('contractors','contractor','organization','T')"
reject "CHECK 34: reserved slug [new] blocked" "INSERT INTO public.partner_profiles(slug,directory_type,entity_type,name_th) VALUES('new','store','organization','T')"
reject "CHECK 35: reserved slug [edit] blocked" "INSERT INTO public.partner_profiles(slug,directory_type,entity_type,name_th) VALUES('edit','store','organization','T')"
reject "CHECK 36: bad directory_type blocked" "INSERT INTO public.partner_profiles(slug,directory_type,entity_type,name_th) VALUES('test-bad1','marketplace','organization','T')"
reject "CHECK 37: bad entity_type blocked" "INSERT INTO public.partner_profiles(slug,directory_type,entity_type,name_th) VALUES('test-bad2','store','company','T')"
reject "CHECK 38: line_url http:// blocked" "INSERT INTO public.partner_profiles(slug,directory_type,entity_type,name_th,line_url) VALUES('test-bad3','store','organization','T','http://line.me/unsafe')"
reject "CHECK 39: unsafe line_url domain blocked" "INSERT INTO public.partner_profiles(slug,directory_type,entity_type,name_th,line_url) VALUES('test-bad4','store','organization','T','https://telegram.me/hopnic')"
reject "CHECK 40: maps_url http:// blocked" "INSERT INTO public.partner_profiles(slug,directory_type,entity_type,name_th,maps_url) VALUES('test-bad5','store','organization','T','http://maps.google.com/unsafe')"
reject "CHECK 41: maps_url evil.com blocked" "INSERT INTO public.partner_profiles(slug,directory_type,entity_type,name_th,maps_url) VALUES('test-bad6','store','organization','T','https://evil.com/maps')"
reject "CHECK 42: maps_url subdomain bypass blocked" "INSERT INTO public.partner_profiles(slug,directory_type,entity_type,name_th,maps_url) VALUES('test-bad7','store','organization','T','https://maps.google.com.evil.com/test')"
reject "CHECK 43: maps_url goo.gl blocked (removed domain)" "INSERT INTO public.partner_profiles(slug,directory_type,entity_type,name_th,maps_url) VALUES('test-bad8','store','organization','T','https://goo.gl/maps/abc')"
reject "CHECK 44: verified_at set when is_verified=false blocked" "INSERT INTO public.partner_profiles(slug,directory_type,entity_type,name_th,is_verified,verified_at) VALUES('test-bad9','store','organization','T',false,now())"
accept "CHECK 45: valid store profile accepted" \
  "INSERT INTO public.partner_profiles(slug,directory_type,entity_type,name_th) VALUES('test-ok-store','store','organization','T')" \
  "DELETE FROM public.partner_profiles WHERE slug='test-ok-store'"
accept "CHECK 46: valid service profile accepted" \
  "INSERT INTO public.partner_profiles(slug,directory_type,entity_type,name_th) VALUES('test-ok-svc','service','individual','T')" \
  "DELETE FROM public.partner_profiles WHERE slug='test-ok-svc'"
accept "CHECK 47: valid contractor profile accepted" \
  "INSERT INTO public.partner_profiles(slug,directory_type,entity_type,name_th) VALUES('test-ok-con','contractor','organization','T')" \
  "DELETE FROM public.partner_profiles WHERE slug='test-ok-con'"
accept "CHECK 48: https://line.me URL accepted" \
  "INSERT INTO public.partner_profiles(slug,directory_type,entity_type,name_th,line_url) VALUES('test-lu-ok','store','organization','T','https://line.me/ti/p/@hopnic')" \
  "DELETE FROM public.partner_profiles WHERE slug='test-lu-ok'"
accept "CHECK 49: https://maps.google.com URL accepted" \
  "INSERT INTO public.partner_profiles(slug,directory_type,entity_type,name_th,maps_url) VALUES('test-mu-ok','store','organization','T','https://maps.google.com/place/test')" \
  "DELETE FROM public.partner_profiles WHERE slug='test-mu-ok'"
accept "CHECK 50: https://maps.app.goo.gl URL accepted" \
  "INSERT INTO public.partner_profiles(slug,directory_type,entity_type,name_th,maps_url) VALUES('test-mu-ok2','store','organization','T','https://maps.app.goo.gl/abc123')" \
  "DELETE FROM public.partner_profiles WHERE slug='test-mu-ok2'"

# ── Trigger fires on UPDATE ─────────────────────────────────
# Insert separately (discard output), then SELECT id to avoid merging with INSERT message.
$DB -tA -c "INSERT INTO public.partner_profiles(slug,directory_type,entity_type,name_th) VALUES('test-trig','store','organization','T')" >/dev/null 2>&1
TRID=$($DB -tA -c "SELECT id::text FROM public.partner_profiles WHERE slug='test-trig'" 2>&1 | head -1 | tr -d '[:space:]')
sleep 1
$DB -tA -c "UPDATE public.partner_profiles SET name_th='U' WHERE id='$TRID'" >/dev/null 2>&1
# PostgreSQL boolean::text returns 'true'/'false', not 't'/'f'
TAFTER=$($DB -tA -c "SELECT (updated_at > created_at)::text FROM public.partner_profiles WHERE id='$TRID'" 2>&1 | tr -d '[:space:]')
$DB -tA -c "DELETE FROM public.partner_profiles WHERE slug='test-trig'" >/dev/null 2>&1
if [ "$TAFTER" = "true" ]; then echo "PASS | CHECK 51: updated_at trigger fires on UPDATE"; PASS=$((PASS+1))
else echo "FAIL | CHECK 51: updated_at trigger (got: $TAFTER)"; FAIL=$((FAIL+1)); fi

# ── RLS gate: anon cannot read unpublished row ──────────────
$DB -tA -c "INSERT INTO public.partner_profiles(slug,directory_type,entity_type,name_th,is_public) VALUES('test-private','store','organization','T',false)" >/dev/null 2>&1
PUB_ID=$($DB -tA -c "SELECT id::text FROM public.partner_profiles WHERE slug='test-private'" 2>&1 | head -1 | tr -d '[:space:]')
# Use BEGIN/SET LOCAL ROLE/ROLLBACK; grep for numeric-only line to skip "SET" command tag output
RLS_RESULT=$($DB -tA -c "BEGIN; SET LOCAL ROLE anon; SELECT COUNT(*)::text FROM public.partner_profiles WHERE id='$PUB_ID'; ROLLBACK;" 2>&1 | grep -E '^[0-9]+$' | head -1 | tr -d '[:space:]')
$DB -tA -c "DELETE FROM public.partner_profiles WHERE slug='test-private'" >/dev/null 2>&1
if [ "$RLS_RESULT" = "0" ]; then echo "PASS | CHECK 52: anon cannot read is_public=false row (RLS gate)"; PASS=$((PASS+1))
else echo "FAIL | CHECK 52: RLS gate leaked non-public row (got: $RLS_RESULT)"; FAIL=$((FAIL+1)); fi

echo "======================================================"
echo " TOTAL: PASS=$PASS  FAIL=$FAIL"
echo "======================================================"
