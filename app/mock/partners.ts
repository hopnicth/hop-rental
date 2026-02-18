import type { IconSlideItem } from '~/types/iconSlide';

/**
 * Mock partner brands
 *
 * TODO: Replace with useFetch() / API call when Admin dashboard is ready.
 * Logos use placehold.co as placeholders — replace with actual brand logos later.
 *
 * linkUrl format: /product (ขั้นนี้ link ไปหน้า product ก่อน)
 * TODO next step: เปลี่ยน link เป็น /product?brand=BrandName เมื่อหน้า Product + brand search พร้อม
 */
export const mockPartners: IconSlideItem[] = [
  {
    id: 'partner-3m',
    imageUrl: 'https://placehold.co/160x80/D32F2F/FFFFFF?text=3M&font=roboto',
    alt: '3M',
    linkUrl: '/product',
    linkTarget: '_self',
  },
  {
    id: 'partner-milwaukee',
    imageUrl: 'https://placehold.co/160x80/B71C1C/FFFFFF?text=Milwaukee&font=roboto',
    alt: 'Milwaukee',
    linkUrl: '/product',
    linkTarget: '_self',
  },
  {
    id: 'partner-makita',
    imageUrl: 'https://placehold.co/160x80/00897B/FFFFFF?text=Makita&font=roboto',
    alt: 'Makita',
    linkUrl: '/product',
    linkTarget: '_self',
  },
  {
    id: 'partner-dewalt',
    imageUrl: 'https://placehold.co/160x80/F9A825/000000?text=DeWalt&font=roboto',
    alt: 'DeWalt',
    linkUrl: '/product',
    linkTarget: '_self',
  },
  {
    id: 'partner-bosch',
    imageUrl: 'https://placehold.co/160x80/1565C0/FFFFFF?text=Bosch&font=roboto',
    alt: 'Bosch',
    linkUrl: '/product',
    linkTarget: '_self',
  },
  {
    id: 'partner-stanley',
    imageUrl: 'https://placehold.co/160x80/F57F17/000000?text=Stanley&font=roboto',
    alt: 'Stanley',
    linkUrl: '/product',
    linkTarget: '_self',
  },
  {
    id: 'partner-hilti',
    imageUrl: 'https://placehold.co/160x80/D50000/FFFFFF?text=Hilti&font=roboto',
    alt: 'Hilti',
    linkUrl: '/product',
    linkTarget: '_self',
  },
  {
    id: 'partner-festool',
    imageUrl: 'https://placehold.co/160x80/2E7D32/FFFFFF?text=Festool&font=roboto',
    alt: 'Festool',
    linkUrl: '/product',
    linkTarget: '_self',
  },
  {
    id: 'partner-ryobi',
    imageUrl: 'https://placehold.co/160x80/388E3C/FFFFFF?text=Ryobi&font=roboto',
    alt: 'Ryobi',
    linkUrl: '/product',
    linkTarget: '_self',
  },
  {
    id: 'partner-metabo',
    imageUrl: 'https://placehold.co/160x80/4E342E/FFFFFF?text=Metabo&font=roboto',
    alt: 'Metabo',
    linkUrl: '/product',
    linkTarget: '_self',
  },
];

