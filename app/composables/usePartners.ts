import { mockPartners } from "~/mock/partners";
import type { IconSlideItem } from "~/types/iconSlide";

const HOME_PARTNERS_ONCE_KEY = "home:partners";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;
}

function normalizePartnerRow(row: unknown): IconSlideItem | null {
  if (!isRecord(row)) return null;

  const id = toString(row.id);
  const imageUrl = toString(row.image_url);
  const alt = toString(row.name);
  const linkUrl = toString(row.link_url);
  if (!id || !imageUrl || !alt || !linkUrl) return null;

  return {
    id,
    imageUrl,
    alt,
    linkUrl,
    linkTarget: row.link_target === "_blank" ? "_blank" : "_self",
  };
}

function isMissingHomePartnerSchemaError(error: unknown): boolean {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "object" && error !== null && "message" in error
        ? String(error.message)
        : "";
  const details =
    typeof error === "object" && error !== null && "details" in error
      ? String(error.details)
      : "";
  const hint =
    typeof error === "object" && error !== null && "hint" in error
      ? String(error.hint)
      : "";
  const combined = `${message} ${details} ${hint}`.toLowerCase();

  return (
    combined.includes("home_partner_logos") &&
    (combined.includes("schema cache") ||
      combined.includes("does not exist") ||
      combined.includes("404"))
  );
}

export function usePartners() {
  const supabase = useSupabaseClient();
  const allPartners = useState<IconSlideItem[]>("home:partners:items", () => [
    ...mockPartners,
  ]);
  const hasRemotePartners = useState<boolean>(
    "home:partners:remote",
    () => false,
  );

  async function fetchPartners(): Promise<void> {
    try {
      const { data, error } = await supabase
        .from("home_partner_logos")
        .select("id, name, image_url, link_url, link_target")
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: false });

      if (error) throw error;

      allPartners.value = ((data ?? []) as unknown[])
        .map(normalizePartnerRow)
        .filter((item): item is IconSlideItem => !!item);
      hasRemotePartners.value = true;
    } catch (fetchError) {
      if (isMissingHomePartnerSchemaError(fetchError)) {
        hasRemotePartners.value = false;
        return;
      }

      console.warn("[usePartners] Failed to fetch partner logos:", fetchError);
    }
  }

  async function ensurePartnersLoaded(): Promise<void> {
    await callOnce(HOME_PARTNERS_ONCE_KEY, fetchPartners);
  }

  onServerPrefetch(ensurePartnersLoaded);

  if (import.meta.client) {
    void ensurePartnersLoaded();
  }

  const partnerItems = computed(() =>
    hasRemotePartners.value ? allPartners.value : mockPartners,
  );

  return {
    partnerItems,
  };
}
