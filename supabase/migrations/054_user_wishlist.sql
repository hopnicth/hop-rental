-- Per-user product wishlist.

CREATE TABLE IF NOT EXISTS public.user_wishlist (
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, product_id)
);

COMMENT ON TABLE public.user_wishlist IS 'Products each authenticated user marked as interested/wishlisted.';

CREATE INDEX IF NOT EXISTS idx_user_wishlist_product_id
  ON public.user_wishlist (product_id, created_at DESC);

ALTER TABLE public.user_wishlist ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own wishlist" ON public.user_wishlist;
CREATE POLICY "Users can read own wishlist"
  ON public.user_wishlist
  FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own wishlist" ON public.user_wishlist;
CREATE POLICY "Users can insert own wishlist"
  ON public.user_wishlist
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own wishlist" ON public.user_wishlist;
CREATE POLICY "Users can delete own wishlist"
  ON public.user_wishlist
  FOR DELETE
  USING (auth.uid() = user_id);

GRANT SELECT, INSERT, DELETE ON public.user_wishlist TO authenticated;

CREATE OR REPLACE FUNCTION public.increment_product_wishlist_count()
RETURNS TRIGGER
LANGUAGE plpgsql
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

CREATE OR REPLACE FUNCTION public.decrement_product_wishlist_count()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE public.product_metrics
  SET wishlist_count = GREATEST(wishlist_count - 1, 0),
      updated_at = now()
  WHERE product_id = OLD.product_id;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS user_wishlist_after_insert_count_trg ON public.user_wishlist;
CREATE TRIGGER user_wishlist_after_insert_count_trg
  AFTER INSERT ON public.user_wishlist
  FOR EACH ROW EXECUTE FUNCTION public.increment_product_wishlist_count();

DROP TRIGGER IF EXISTS user_wishlist_after_delete_count_trg ON public.user_wishlist;
CREATE TRIGGER user_wishlist_after_delete_count_trg
  AFTER DELETE ON public.user_wishlist
  FOR EACH ROW EXECUTE FUNCTION public.decrement_product_wishlist_count();