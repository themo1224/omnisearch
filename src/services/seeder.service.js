import { esClient } from '../client.js';
import { ALIAS_NAME } from '../config/index-settings.js';
import { generateEmbedding } from './vector.service.js';

export const productsCatalog = [
  {
    id: 'prod-001',
    title: 'Apple iPhone 15 Pro Max',
    description: 'Flagship Apple smartphone with titanium frame, A17 Pro chip, Action button, and 48MP spatial video camera.',
    category: 'Smartphones',
    brand: 'Apple',
    price: 1199.99,
    rating: 4.9,
    in_stock: true,
    tags: ['mobile', 'apple', 'ios', '5g', 'flagship', 'titanium'],
    created_at: '2024-01-15T08:00:00Z',
  },
  {
    id: 'prod-002',
    title: 'Apple MacBook Pro 16-inch M3 Max',
    description: 'Ultimate developer laptop featuring Liquid Retina XDR display, 36GB unified memory, and silent liquid cooling.',
    category: 'Laptops',
    brand: 'Apple',
    price: 3499.00,
    rating: 4.9,
    in_stock: true,
    tags: ['laptop', 'apple', 'macOS', 'm3', 'workstation', 'developer'],
    created_at: '2024-02-01T10:30:00Z',
  },
  {
    id: 'prod-003',
    title: 'Samsung Galaxy S24 Ultra',
    description: 'AI-driven flagship Android phone with S Pen, 200MP Quad Telephoto camera, and Gorilla Armor glass.',
    category: 'Smartphones',
    brand: 'Samsung',
    price: 1299.99,
    rating: 4.7,
    in_stock: true,
    tags: ['mobile', 'samsung', 'android', 'ai', '5g'],
    created_at: '2024-02-10T11:00:00Z',
  },
  {
    id: 'prod-004',
    title: 'Sony WH-1000XM5 Noise Canceling Headphones',
    description: 'Industry-leading noise cancellation over-ear wireless headphones with Auto NC Optimizer and 30hr battery.',
    category: 'Audio',
    brand: 'Sony',
    price: 398.00,
    rating: 4.6,
    in_stock: true,
    tags: ['audio', 'headphones', 'bluetooth', 'noise-canceling', 'wireless'],
    created_at: '2024-03-01T14:20:00Z',
  },
  {
    id: 'prod-005',
    title: 'Apple AirPods Pro 2nd Gen USB-C',
    description: 'Active Noise Cancellation, Adaptive Audio, Spatial Audio, and USB-C MagSafe charging case.',
    category: 'Audio',
    brand: 'Apple',
    price: 249.00,
    rating: 4.8,
    in_stock: true,
    tags: ['audio', 'earbuds', 'apple', 'wireless', 'noise-canceling'],
    created_at: '2024-03-12T09:15:00Z',
  },
  {
    id: 'prod-006',
    title: 'Dell XPS 15 OLED Developer Edition',
    description: 'Premium Windows workstation with 13th Gen Intel i7, 3.5K OLED touch screen, and NVIDIA RTX graphics.',
    category: 'Laptops',
    brand: 'Dell',
    price: 1899.99,
    rating: 4.4,
    in_stock: false,
    tags: ['laptop', 'dell', 'windows', 'intel', 'oled'],
    created_at: '2024-03-18T16:00:00Z',
  },
  {
    id: 'prod-007',
    title: 'Logitech MX Master 3S Ergonomic Mouse',
    description: 'Quiet Click wireless performance mouse with 8K DPI laser tracking and MagSpeed electromagnetic scroll wheel.',
    category: 'Accessories',
    brand: 'Logitech',
    price: 99.99,
    rating: 4.8,
    in_stock: true,
    tags: ['accessories', 'mouse', 'ergonomic', 'wireless', 'productivity'],
    created_at: '2024-03-25T12:00:00Z',
  },
  {
    id: 'prod-008',
    title: 'Keychron Q1 Pro Mechanical Keyboard',
    description: 'Full aluminum wireless mechanical keyboard with double-gasket design, QMK/VIA support, and hot-swappable switches.',
    category: 'Accessories',
    brand: 'Keychron',
    price: 199.00,
    rating: 4.8,
    in_stock: true,
    tags: ['accessories', 'keyboard', 'mechanical', 'custom', 'wireless'],
    created_at: '2024-04-05T13:45:00Z',
  },
  {
    id: 'prod-009',
    title: 'LG UltraFine 27-inch 4K USB-C Monitor',
    description: 'UHD IPS display with HDR10, 96% DCI-P3 color gamut, and 60W USB Type-C power delivery.',
    category: 'Monitors',
    brand: 'LG',
    price: 449.99,
    rating: 4.3,
    in_stock: true,
    tags: ['monitor', 'lg', '4k', 'display', 'usb-c'],
    created_at: '2024-04-12T15:10:00Z',
  },
  {
    id: 'prod-010',
    title: 'Sony PlayStation 5 Slim Console',
    description: 'Next-generation 4K gaming console with ultra-fast 1TB SSD, Ray Tracing, and DualSense haptic feedback.',
    category: 'Gaming',
    brand: 'Sony',
    price: 499.99,
    rating: 4.9,
    in_stock: true,
    tags: ['gaming', 'sony', 'playstation', 'console', '4k'],
    created_at: '2024-04-20T17:30:00Z',
  },
  {
    id: 'prod-011',
    title: 'ASUS ROG Zephyrus G14 Gaming Laptop',
    description: 'Compact 14-inch OLED gaming laptop with AMD Ryzen 9, RTX 4070, and 120Hz refresh rate.',
    category: 'Laptops',
    brand: 'ASUS',
    price: 1599.99,
    rating: 4.7,
    in_stock: true,
    tags: ['laptop', 'asus', 'gaming', 'oled', 'amd'],
    created_at: '2024-05-01T10:00:00Z',
  },
  {
    id: 'prod-012',
    title: 'Bose QuietComfort Ultra Earbuds',
    description: 'World-class noise cancelling earbuds with spatial immersive audio and custom calibration.',
    category: 'Audio',
    brand: 'Bose',
    price: 299.00,
    rating: 4.6,
    in_stock: true,
    tags: ['audio', 'earbuds', 'bose', 'wireless', 'noise-canceling'],
    created_at: '2024-05-10T11:20:00Z',
  }
];

export async function seedProductsCatalog() {
  console.log(` Seeding ${productsCatalog.length} catalog items into alias "${ALIAS_NAME}"...`);

  const operations = productsCatalog.flatMap((doc) => {
    // Generate 384-dim dense vector embedding for hybrid kNN search
    const vectorText = `${doc.title} ${doc.description} ${doc.category} ${doc.tags.join(' ')}`;
    const embedding = generateEmbedding(vectorText);

    const fullDoc = {
      ...doc,
      vector_embedding: embedding,
    };

    return [
      { index: { _index: ALIAS_NAME, _id: doc.id } },
      fullDoc,
    ];
  });

  const bulkResponse = await esClient.bulk({
    refresh: true,
    operations,
  });

  if (bulkResponse.errors) {
    console.error('Bulk seeding errors:', bulkResponse.items);
  } else {
    console.log(` Catalog successfully seeded with dense vector embeddings!`);
  }
}
