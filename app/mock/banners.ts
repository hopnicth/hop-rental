import type { BannerSlide } from '~/types/banner';

/**
 * Mock banner slides
 *
 * TODO: Replace with useFetch() / API call when Admin dashboard is ready.
 * Images use picsum.photos as placeholders (16:9-ish ratio, 1200×400).
 */
export const mockBannerSlides: BannerSlide[] = [
  {
    id: 'banner-1',
    imageUrl: 'https://picsum.photos/seed/hop-banner1/1200/400',
    alt: 'Promotion: Rental tools discount 20%',
    linkUrl: '/promotions/rental-discount',
    linkTarget: '_self',
    sortOrder: 1,
    isActive: true,
  },
  {
    id: 'banner-2',
    imageUrl: 'https://picsum.photos/seed/hop-banner2/1200/400',
    alt: 'New arrivals: Safety equipment collection',
    linkUrl: '/blog/new-safety-equipment',
    linkTarget: '_self',
    sortOrder: 2,
    isActive: true,
  },
  {
    id: 'banner-3',
    imageUrl: 'https://picsum.photos/seed/hop-banner3/1200/400',
    alt: 'Summer sale: Up to 30% off on power tools',
    linkUrl: '/promotions/summer-sale',
    linkTarget: '_self',
    sortOrder: 3,
    isActive: true,
  },
  {
    id: 'banner-4',
    imageUrl: 'https://picsum.photos/seed/hop-banner4/1200/400',
    alt: 'Blog: How to choose the right PPE',
    linkUrl: '/blog/choose-right-ppe',
    linkTarget: '_self',
    sortOrder: 4,
    isActive: true,
  },
  {
    id: 'banner-5',
    imageUrl: 'https://picsum.photos/seed/hop-banner5/1200/400',
    alt: 'Partner program: Register now',
    linkUrl: '/partner-program',
    linkTarget: '_blank',
    sortOrder: 5,
    isActive: false, // disabled — demonstrates isActive filtering
  },
];

