export type Product = {
  id: string;
  name: string;
  category: string;
  description: string;
  details: string[];
  price: number;
  image: string;
  imageAlt: string;
  tag: string;
  stock: "In stock" | "Low stock";
};

export const products: Product[] = [
  {
    id: "wildflower-tea",
    name: "Wildflower Evening Tea",
    category: "Herbal tea",
    description: "A gentle floral blend for slow evenings and a little room to breathe.",
    details: ["Chamomile", "Lemon balm", "Dried rose"],
    price: 680,
    image: "https://images.unsplash.com/photo-1544787219-7f47ccb76574?auto=format&fit=crop&w=1000&q=85",
    imageAlt: "Loose herbal tea and a ceramic cup on a wooden table",
    tag: "Small batch",
    stock: "In stock",
  },
  {
    id: "rosewater-cleanser",
    name: "Rosewater Daily Cleanser",
    category: "Skin care",
    description: "A simple, rinse-clean face wash with a soft botanical scent.",
    details: ["Rose water", "Oat extract", "Plant-derived cleanser"],
    price: 920,
    image: "https://images.unsplash.com/photo-1608248543803-ba4f8c70ae0b?auto=format&fit=crop&w=1000&q=85",
    imageAlt: "Minimal glass skincare bottle with botanical ingredients",
    tag: "Gentle daily care",
    stock: "In stock",
  },
  {
    id: "calendula-balm",
    name: "Calendula Hand Balm",
    category: "Skin care",
    description: "A rich, pocket-sized balm made for hands that do a lot.",
    details: ["Calendula-infused oil", "Shea butter", "Beeswax"],
    price: 540,
    image: "https://images.unsplash.com/photo-1608571423902-eed4a5ad8108?auto=format&fit=crop&w=1000&q=85",
    imageAlt: "Amber botanical oil bottles arranged on a light surface",
    tag: "Pocket size",
    stock: "Low stock",
  },
  {
    id: "mint-tea",
    name: "Garden Mint Loose Leaf",
    category: "Herbal tea",
    description: "Bright, fragrant mint leaves to steep hot or pour over ice.",
    details: ["Dried spearmint", "Whole leaf blend", "No added flavouring"],
    price: 460,
    image: "https://images.unsplash.com/photo-1571934811356-5cc061b6821f?auto=format&fit=crop&w=1000&q=85",
    imageAlt: "Fresh mint leaves beside a clear glass of tea",
    tag: "Garden picked",
    stock: "In stock",
  },
  {
    id: "citrus-body-oil",
    name: "Citrus & Seed Body Oil",
    category: "Body care",
    description: "A light after-bath oil with a fresh citrus peel aroma.",
    details: ["Sunflower seed oil", "Jojoba oil", "Sweet orange peel"],
    price: 1100,
    image: "https://images.unsplash.com/photo-1601049541289-9b1b7bbbfe19?auto=format&fit=crop&w=1000&q=85",
    imageAlt: "Skincare oil bottle with green leaves in soft daylight",
    tag: "Botanical blend",
    stock: "In stock",
  },
  {
    id: "oat-soap",
    name: "Oat Milk Soap Bar",
    category: "Bath & body",
    description: "A creamy, unscented bar with a softly textured finish.",
    details: ["Oat milk", "Olive oil", "Coconut oil"],
    price: 390,
    image: "https://images.unsplash.com/photo-1600428853876-fb5a850b444f?auto=format&fit=crop&w=1000&q=85",
    imageAlt: "Handmade soap bars arranged with natural ingredients",
    tag: "Unscented",
    stock: "In stock",
  },
  {
    id: "ginger-tea",
    name: "Ginger & Lemongrass Tea",
    category: "Herbal tea",
    description: "A bright, warming cup with citrusy lemongrass notes.",
    details: ["Dried ginger", "Lemongrass", "Lime leaf"],
    price: 520,
    image: "https://images.unsplash.com/photo-1597481499750-3e6b22637e12?auto=format&fit=crop&w=1000&q=85",
    imageAlt: "Herbal tea leaves and spices arranged for steeping",
    tag: "Customer favourite",
    stock: "In stock",
  },
  {
    id: "lavender-pillow-mist",
    name: "Lavender Linen Mist",
    category: "Home rituals",
    description: "A light botanical mist for linens, made with a soft lavender note.",
    details: ["Lavender hydrosol", "Distilled water", "Reusable glass bottle"],
    price: 760,
    image: "https://images.unsplash.com/photo-1608571423902-eed4a5ad8108?auto=format&fit=crop&w=1000&q=85",
    imageAlt: "Amber glass bottles for botanical home care",
    tag: "Home ritual",
    stock: "Low stock",
  },
];
