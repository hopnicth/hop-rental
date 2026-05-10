-- 063: Allow anonymous walk-in POS sale orders.
-- Storefront orders still require user_id; POS sales may omit customer data when
-- they are branch-scoped and handled by staff.

ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_customer_ref_chk;

ALTER TABLE public.orders
  ADD CONSTRAINT orders_customer_ref_chk
  CHECK (
    user_id IS NOT NULL
    OR walk_in_phone IS NOT NULL
    OR (pos_branch_id IS NOT NULL AND pos_staff_user_id IS NOT NULL)
  );

COMMENT ON CONSTRAINT orders_customer_ref_chk ON public.orders IS
  'Requires a customer reference for storefront orders, but permits anonymous branch-scoped staff POS sales.';