/**
 * Master vocabulary for `content_pages.service_areas` slugs.
 *
 * Stored values are slugs (kebab-case, ASCII). Display uses TH/EN labels.
 * Categories admins can mix-and-match per service page:
 *  - `nationwide` — applies to the whole country
 *  - `region-*` — one of the major Thai regions
 *  - `bangkok-metro` — Bangkok plus the five vicinity provinces
 *  - province slugs — any of the 77 provinces individually
 */

export type ServiceAreaGroup =
  | "special"
  | "region"
  | "metro"
  | "north"
  | "northeast"
  | "central"
  | "east"
  | "south";

export interface ServiceAreaOption {
  value: string;
  labelTh: string;
  labelEn: string;
  group: ServiceAreaGroup;
}

export const SERVICE_AREA_OPTIONS: ServiceAreaOption[] = [
  {
    value: "nationwide",
    labelTh: "ทั่วประเทศ",
    labelEn: "Nationwide",
    group: "special",
  },

  {
    value: "region-north",
    labelTh: "ภาคเหนือ",
    labelEn: "Northern",
    group: "region",
  },
  {
    value: "region-northeast",
    labelTh: "ภาคตะวันออกเฉียงเหนือ (อีสาน)",
    labelEn: "Northeastern (Isan)",
    group: "region",
  },
  {
    value: "region-central",
    labelTh: "ภาคกลาง",
    labelEn: "Central",
    group: "region",
  },
  {
    value: "region-east",
    labelTh: "ภาคตะวันออก",
    labelEn: "Eastern",
    group: "region",
  },
  {
    value: "region-south",
    labelTh: "ภาคใต้",
    labelEn: "Southern",
    group: "region",
  },

  {
    value: "bangkok-metro",
    labelTh: "กรุงเทพและปริมณฑล",
    labelEn: "Bangkok & Metropolitan",
    group: "metro",
  },

  // Northern (9)
  {
    value: "chiang-mai",
    labelTh: "เชียงใหม่",
    labelEn: "Chiang Mai",
    group: "north",
  },
  {
    value: "chiang-rai",
    labelTh: "เชียงราย",
    labelEn: "Chiang Rai",
    group: "north",
  },
  { value: "lampang", labelTh: "ลำปาง", labelEn: "Lampang", group: "north" },
  { value: "lamphun", labelTh: "ลำพูน", labelEn: "Lamphun", group: "north" },
  {
    value: "mae-hong-son",
    labelTh: "แม่ฮ่องสอน",
    labelEn: "Mae Hong Son",
    group: "north",
  },
  { value: "nan", labelTh: "น่าน", labelEn: "Nan", group: "north" },
  { value: "phayao", labelTh: "พะเยา", labelEn: "Phayao", group: "north" },
  { value: "phrae", labelTh: "แพร่", labelEn: "Phrae", group: "north" },
  {
    value: "uttaradit",
    labelTh: "อุตรดิตถ์",
    labelEn: "Uttaradit",
    group: "north",
  },

  // Northeastern / Isan (20)
  {
    value: "amnat-charoen",
    labelTh: "อำนาจเจริญ",
    labelEn: "Amnat Charoen",
    group: "northeast",
  },
  {
    value: "bueng-kan",
    labelTh: "บึงกาฬ",
    labelEn: "Bueng Kan",
    group: "northeast",
  },
  {
    value: "buriram",
    labelTh: "บุรีรัมย์",
    labelEn: "Buriram",
    group: "northeast",
  },
  {
    value: "chaiyaphum",
    labelTh: "ชัยภูมิ",
    labelEn: "Chaiyaphum",
    group: "northeast",
  },
  {
    value: "kalasin",
    labelTh: "กาฬสินธุ์",
    labelEn: "Kalasin",
    group: "northeast",
  },
  {
    value: "khon-kaen",
    labelTh: "ขอนแก่น",
    labelEn: "Khon Kaen",
    group: "northeast",
  },
  { value: "loei", labelTh: "เลย", labelEn: "Loei", group: "northeast" },
  {
    value: "maha-sarakham",
    labelTh: "มหาสารคาม",
    labelEn: "Maha Sarakham",
    group: "northeast",
  },
  {
    value: "mukdahan",
    labelTh: "มุกดาหาร",
    labelEn: "Mukdahan",
    group: "northeast",
  },
  {
    value: "nakhon-phanom",
    labelTh: "นครพนม",
    labelEn: "Nakhon Phanom",
    group: "northeast",
  },
  {
    value: "nakhon-ratchasima",
    labelTh: "นครราชสีมา",
    labelEn: "Nakhon Ratchasima",
    group: "northeast",
  },
  {
    value: "nong-bua-lamphu",
    labelTh: "หนองบัวลำภู",
    labelEn: "Nong Bua Lamphu",
    group: "northeast",
  },
  {
    value: "nong-khai",
    labelTh: "หนองคาย",
    labelEn: "Nong Khai",
    group: "northeast",
  },
  {
    value: "roi-et",
    labelTh: "ร้อยเอ็ด",
    labelEn: "Roi Et",
    group: "northeast",
  },
  {
    value: "sakon-nakhon",
    labelTh: "สกลนคร",
    labelEn: "Sakon Nakhon",
    group: "northeast",
  },
  {
    value: "si-sa-ket",
    labelTh: "ศรีสะเกษ",
    labelEn: "Si Sa Ket",
    group: "northeast",
  },
  { value: "surin", labelTh: "สุรินทร์", labelEn: "Surin", group: "northeast" },
  {
    value: "ubon-ratchathani",
    labelTh: "อุบลราชธานี",
    labelEn: "Ubon Ratchathani",
    group: "northeast",
  },
  {
    value: "udon-thani",
    labelTh: "อุดรธานี",
    labelEn: "Udon Thani",
    group: "northeast",
  },
  {
    value: "yasothon",
    labelTh: "ยโสธร",
    labelEn: "Yasothon",
    group: "northeast",
  },

  // Central + West + lower north (27, includes Bangkok metro provinces individually)
  {
    value: "bangkok",
    labelTh: "กรุงเทพมหานคร",
    labelEn: "Bangkok",
    group: "central",
  },
  {
    value: "nonthaburi",
    labelTh: "นนทบุรี",
    labelEn: "Nonthaburi",
    group: "central",
  },
  {
    value: "pathum-thani",
    labelTh: "ปทุมธานี",
    labelEn: "Pathum Thani",
    group: "central",
  },
  {
    value: "samut-prakan",
    labelTh: "สมุทรปราการ",
    labelEn: "Samut Prakan",
    group: "central",
  },
  {
    value: "samut-sakhon",
    labelTh: "สมุทรสาคร",
    labelEn: "Samut Sakhon",
    group: "central",
  },
  {
    value: "nakhon-pathom",
    labelTh: "นครปฐม",
    labelEn: "Nakhon Pathom",
    group: "central",
  },
  {
    value: "ang-thong",
    labelTh: "อ่างทอง",
    labelEn: "Ang Thong",
    group: "central",
  },
  {
    value: "ayutthaya",
    labelTh: "พระนครศรีอยุธยา",
    labelEn: "Phra Nakhon Si Ayutthaya",
    group: "central",
  },
  {
    value: "chai-nat",
    labelTh: "ชัยนาท",
    labelEn: "Chai Nat",
    group: "central",
  },
  {
    value: "kamphaeng-phet",
    labelTh: "กำแพงเพชร",
    labelEn: "Kamphaeng Phet",
    group: "central",
  },
  {
    value: "lop-buri",
    labelTh: "ลพบุรี",
    labelEn: "Lop Buri",
    group: "central",
  },
  {
    value: "nakhon-nayok",
    labelTh: "นครนายก",
    labelEn: "Nakhon Nayok",
    group: "central",
  },
  {
    value: "nakhon-sawan",
    labelTh: "นครสวรรค์",
    labelEn: "Nakhon Sawan",
    group: "central",
  },
  {
    value: "phetchabun",
    labelTh: "เพชรบูรณ์",
    labelEn: "Phetchabun",
    group: "central",
  },
  { value: "phichit", labelTh: "พิจิตร", labelEn: "Phichit", group: "central" },
  {
    value: "phitsanulok",
    labelTh: "พิษณุโลก",
    labelEn: "Phitsanulok",
    group: "central",
  },
  {
    value: "saraburi",
    labelTh: "สระบุรี",
    labelEn: "Saraburi",
    group: "central",
  },
  {
    value: "sing-buri",
    labelTh: "สิงห์บุรี",
    labelEn: "Sing Buri",
    group: "central",
  },
  {
    value: "sukhothai",
    labelTh: "สุโขทัย",
    labelEn: "Sukhothai",
    group: "central",
  },
  {
    value: "suphan-buri",
    labelTh: "สุพรรณบุรี",
    labelEn: "Suphan Buri",
    group: "central",
  },
  {
    value: "samut-songkhram",
    labelTh: "สมุทรสงคราม",
    labelEn: "Samut Songkhram",
    group: "central",
  },
  { value: "tak", labelTh: "ตาก", labelEn: "Tak", group: "central" },
  {
    value: "uthai-thani",
    labelTh: "อุทัยธานี",
    labelEn: "Uthai Thani",
    group: "central",
  },
  {
    value: "kanchanaburi",
    labelTh: "กาญจนบุรี",
    labelEn: "Kanchanaburi",
    group: "central",
  },
  {
    value: "phetchaburi",
    labelTh: "เพชรบุรี",
    labelEn: "Phetchaburi",
    group: "central",
  },
  {
    value: "prachuap-khiri-khan",
    labelTh: "ประจวบคีรีขันธ์",
    labelEn: "Prachuap Khiri Khan",
    group: "central",
  },
  {
    value: "ratchaburi",
    labelTh: "ราชบุรี",
    labelEn: "Ratchaburi",
    group: "central",
  },

  // Eastern (7)
  {
    value: "chachoengsao",
    labelTh: "ฉะเชิงเทรา",
    labelEn: "Chachoengsao",
    group: "east",
  },
  {
    value: "chanthaburi",
    labelTh: "จันทบุรี",
    labelEn: "Chanthaburi",
    group: "east",
  },
  { value: "chonburi", labelTh: "ชลบุรี", labelEn: "Chonburi", group: "east" },
  {
    value: "prachinburi",
    labelTh: "ปราจีนบุรี",
    labelEn: "Prachinburi",
    group: "east",
  },
  { value: "rayong", labelTh: "ระยอง", labelEn: "Rayong", group: "east" },
  { value: "sa-kaeo", labelTh: "สระแก้ว", labelEn: "Sa Kaeo", group: "east" },
  { value: "trat", labelTh: "ตราด", labelEn: "Trat", group: "east" },

  // Southern (14)
  { value: "chumphon", labelTh: "ชุมพร", labelEn: "Chumphon", group: "south" },
  { value: "krabi", labelTh: "กระบี่", labelEn: "Krabi", group: "south" },
  {
    value: "nakhon-si-thammarat",
    labelTh: "นครศรีธรรมราช",
    labelEn: "Nakhon Si Thammarat",
    group: "south",
  },
  {
    value: "narathiwat",
    labelTh: "นราธิวาส",
    labelEn: "Narathiwat",
    group: "south",
  },
  { value: "pattani", labelTh: "ปัตตานี", labelEn: "Pattani", group: "south" },
  {
    value: "phang-nga",
    labelTh: "พังงา",
    labelEn: "Phang Nga",
    group: "south",
  },
  {
    value: "phatthalung",
    labelTh: "พัทลุง",
    labelEn: "Phatthalung",
    group: "south",
  },
  { value: "phuket", labelTh: "ภูเก็ต", labelEn: "Phuket", group: "south" },
  { value: "ranong", labelTh: "ระนอง", labelEn: "Ranong", group: "south" },
  { value: "satun", labelTh: "สตูล", labelEn: "Satun", group: "south" },
  { value: "songkhla", labelTh: "สงขลา", labelEn: "Songkhla", group: "south" },
  {
    value: "surat-thani",
    labelTh: "สุราษฎร์ธานี",
    labelEn: "Surat Thani",
    group: "south",
  },
  { value: "trang", labelTh: "ตรัง", labelEn: "Trang", group: "south" },
  { value: "yala", labelTh: "ยะลา", labelEn: "Yala", group: "south" },
];

export const SERVICE_AREA_VALUES = new Set(
  SERVICE_AREA_OPTIONS.map((option) => option.value),
);

export function isServiceAreaValue(value: unknown): value is string {
  return typeof value === "string" && SERVICE_AREA_VALUES.has(value);
}
