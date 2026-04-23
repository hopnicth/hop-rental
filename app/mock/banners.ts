import type { BannerSlide } from "~/types/banner";

/**
 * Mock banner slides
 *
 * TODO: Replace with useFetch() / API call when Admin dashboard is ready.
 * Images use picsum.photos as placeholders (16:9-ish ratio, 1200×400).
 */
export const mockBannerSlides: BannerSlide[] = [
  {
    id: "banner-1",
    title: {
      th: "เครื่องมือพร้อมเช่า พร้อมส่งงานทันที",
      en: "Rental-ready tools for immediate deployment",
      cn: "随时可租的工具，随时投入工作",
      jp: "すぐに現場投入できるレンタル工具",
    },
    subtitle: {
      th: "คัดชุดเครื่องมือเช่าที่ใช้งานจริงในโรงงานและหน้างาน พร้อมรายละเอียดครบก่อนตัดสินใจ",
      en: "Explore practical rental-ready tool sets for factories and field teams with clear commercial details.",
      cn: "浏览适用于工厂与现场团队的实用租赁工具组合，并查看清晰的商业信息。",
      jp: "工場や現場向けに実用的なレンタル工具セットを、分かりやすい条件付きでご案内します。",
    },
    ctaLabel: {
      th: "ดูชุดเครื่องมือเช่า",
      en: "Browse rental sets",
      cn: "查看租赁套装",
      jp: "レンタルセットを見る",
    },
    imageUrl: "https://picsum.photos/seed/hop-home-banner1/1400/900",
    mobileImageUrl:
      "https://picsum.photos/seed/hop-home-banner1-mobile/900/1200",
    linkUrl: "/product-rental",
    linkTarget: "_self",
    sortOrder: 1,
    isActive: true,
  },
  {
    id: "banner-2",
    title: {
      th: "สินค้าเด่นและวัสดุพร้อมขายในที่เดียว",
      en: "Recommended sale items in one place",
      cn: "热门推荐商品一站查看",
      jp: "おすすめ販売商品をひとまとめに",
    },
    subtitle: {
      th: "รวมสินค้าขายที่ทีมงานคัดมาให้ พร้อมราคาและข้อมูลที่อ่านง่ายสำหรับการตัดสินใจเร็วขึ้น",
      en: "See curated sale products with clear pricing and concise information for faster purchasing decisions.",
      cn: "查看精选销售商品，价格清晰、信息简洁，帮助更快做出采购决定。",
      jp: "価格と要点を整理した厳選販売商品で、より早い購買判断を支援します。",
    },
    ctaLabel: {
      th: "ดูสินค้าทั้งหมด",
      en: "View all products",
      cn: "查看全部商品",
      jp: "すべての商品を見る",
    },
    imageUrl: "https://picsum.photos/seed/hop-home-banner2/1400/900",
    mobileImageUrl:
      "https://picsum.photos/seed/hop-home-banner2-mobile/900/1200",
    linkUrl: "/product-all",
    linkTarget: "_self",
    sortOrder: 2,
    isActive: true,
  },
  {
    id: "banner-3",
    title: {
      th: "บริการวิศวกรรมและงานสนับสนุนการผลิต",
      en: "Engineering and production support services",
      cn: "工程与生产支持服务",
      jp: "エンジニアリング・生産支援サービス",
    },
    subtitle: {
      th: "จากงานเขียนแบบจนถึงการให้คำปรึกษาและรับเหมาในโรงงาน เรามีทีมช่วยขับเคลื่อนโครงการให้เดินต่อได้",
      en: "From engineering design to consulting and factory contracting, our team helps keep your projects moving.",
      cn: "从工程设计到咨询与工厂承包，我们帮助您的项目持续推进。",
      jp: "設計からコンサルティング、工場内請負まで、プロジェクト推進を支援します。",
    },
    ctaLabel: {
      th: "ดูบริการของเรา",
      en: "Explore services",
      cn: "查看我们的服务",
      jp: "サービスを見る",
    },
    imageUrl: "https://picsum.photos/seed/hop-home-banner3/1400/900",
    mobileImageUrl:
      "https://picsum.photos/seed/hop-home-banner3-mobile/900/1200",
    linkUrl: "/services/engineering-design",
    linkTarget: "_self",
    sortOrder: 3,
    isActive: true,
  },
];
