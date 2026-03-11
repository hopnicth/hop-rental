import type { StoreLocation } from "~/types/store";

/**
 * Mock store / hub locations.
 *
 * These match the `storeLocationIds` used in `mock/products.ts → rentalConfig`.
 */
export const mockStores: StoreLocation[] = [
  {
    id: "store-001",
    name: {
      th: "สาขากรุงเทพฯ (บางนา)",
      en: "Bangkok Branch (Bangna)",
      cn: "曼谷分店（邦纳）",
      jp: "バンコク支店（バンナー）",
    },
    shortCode: "BKK",
    address: {
      th: "123/45 ถ.บางนา-ตราด กม.7 ต.บางแก้ว อ.บางพลี จ.สมุทรปราการ 10540",
      en: "123/45 Bangna-Trad Rd. Km.7, Bang Kaeo, Bang Phli, Samut Prakan 10540",
      cn: "北揽府邦披县邦纳-达叻路7公里处 123/45号 10540",
      jp: "サムットプラーカーン県バンプリー郡バンナー・トラート通り7km 123/45 10540",
    },
    phone: "02-123-4567",
    operatingHours: {
      th: "จันทร์-เสาร์ 08:00-17:00",
      en: "Mon-Sat 08:00-17:00",
      cn: "周一至周六 08:00-17:00",
      jp: "月〜土 08:00-17:00",
    },
    mapUrl: "https://maps.google.com/?q=13.6513,100.6615",
    isActive: true,
  },
  {
    id: "store-002",
    name: {
      th: "สาขาระยอง (มาบตาพุด)",
      en: "Rayong Branch (Map Ta Phut)",
      cn: "罗勇分店（马达普）",
      jp: "ラヨーン支店（マプタプット）",
    },
    shortCode: "RYG",
    address: {
      th: "88/9 ถ.สุขุมวิท ต.มาบตาพุด อ.เมืองระยอง จ.ระยอง 21150",
      en: "88/9 Sukhumvit Rd., Map Ta Phut, Mueang Rayong, Rayong 21150",
      cn: "罗勇府马达普素坤逸路 88/9号 21150",
      jp: "ラヨーン県ムアンラヨーン郡マプタプットスクンビット通り 88/9 21150",
    },
    phone: "038-987-654",
    operatingHours: {
      th: "จันทร์-เสาร์ 07:30-16:30",
      en: "Mon-Sat 07:30-16:30",
      cn: "周一至周六 07:30-16:30",
      jp: "月〜土 07:30-16:30",
    },
    mapUrl: "https://maps.google.com/?q=12.6841,101.1367",
    isActive: true,
  },
  {
    id: "store-003",
    name: {
      th: "สาขาชลบุรี (ศรีราชา)",
      en: "Chonburi Branch (Si Racha)",
      cn: "春武里分店（是拉差）",
      jp: "チョンブリー支店（シーラチャー）",
    },
    shortCode: "CBR",
    address: {
      th: "56/7 ถ.สุขุมวิท ต.ศรีราชา อ.ศรีราชา จ.ชลบุรี 20110",
      en: "56/7 Sukhumvit Rd., Si Racha, Si Racha, Chonburi 20110",
      cn: "春武里府是拉差素坤逸路 56/7号 20110",
      jp: "チョンブリー県シーラチャー郡スクンビット通り 56/7 20110",
    },
    phone: "038-765-432",
    operatingHours: {
      th: "จันทร์-เสาร์ 08:00-17:00",
      en: "Mon-Sat 08:00-17:00",
      cn: "周一至周六 08:00-17:00",
      jp: "月〜土 08:00-17:00",
    },
    mapUrl: "https://maps.google.com/?q=13.1676,100.9267",
    isActive: true,
  },
  {
    id: "store-004",
    name: {
      th: "สาขาสมุทรสาคร",
      en: "Samut Sakhon Branch",
      cn: "龙仔厝分店",
      jp: "サムットサーコーン支店",
    },
    shortCode: "SSK",
    address: {
      th: "200/1 ถ.เศรษฐกิจ 1 ต.มหาชัย อ.เมืองสมุทรสาคร จ.สมุทรสาคร 74000",
      en: "200/1 Setthakit 1 Rd., Maha Chai, Mueang Samut Sakhon, Samut Sakhon 74000",
      cn: "龙仔厝府经济1路 200/1号 74000",
      jp: "サムットサーコーン県セータキット1通り 200/1 74000",
    },
    phone: "034-456-789",
    operatingHours: {
      th: "จันทร์-ศุกร์ 08:00-17:00",
      en: "Mon-Fri 08:00-17:00",
      cn: "周一至周五 08:00-17:00",
      jp: "月〜金 08:00-17:00",
    },
    mapUrl: "https://maps.google.com/?q=13.5475,100.2744",
    isActive: true,
  },
];

