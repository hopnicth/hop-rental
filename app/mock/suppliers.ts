import type { Supplier } from '~/types/supplier';

/**
 * Mock suppliers — ร้านค้า / ผู้จำหน่าย
 *
 * TODO: Replace with useFetch() / API call when Admin dashboard is ready.
 *
 * ชื่อร้านค้าเป็นตัวอย่างสมมุติ — ไม่ใช่ร้านจริง
 */
export const mockSuppliers: Supplier[] = [
  {
    id: 'sup-001',
    name: {
      th: 'ร้านช่างพร้อม',
      en: 'Chang Prom Shop',
      cn: '昌普罗姆店',
      jp: 'チャンプロムショップ',
    },
  },
  {
    id: 'sup-002',
    name: {
      th: 'SK Tool Center',
      en: 'SK Tool Center',
      cn: 'SK工具中心',
      jp: 'SKツールセンター',
    },
  },
  {
    id: 'sup-003',
    name: {
      th: 'บ้านเครื่องมือ',
      en: 'Tool House',
      cn: '工具之家',
      jp: 'ツールハウス',
    },
  },
  {
    id: 'sup-004',
    name: {
      th: 'พี่หนึ่งการช่าง',
      en: 'P-Nueng Hardware',
      cn: '第一五金店',
      jp: 'ピーヌンハードウェア',
    },
  },
  {
    id: 'sup-005',
    name: {
      th: 'โปรเซฟตี้',
      en: 'Pro Safety Supply',
      cn: '专业安全用品',
      jp: 'プロセーフティサプライ',
    },
  },
  {
    id: 'sup-006',
    name: {
      th: 'เมกะทูลส์',
      en: 'Mega Tools',
      cn: '超级工具',
      jp: 'メガツールズ',
    },
  },
];

