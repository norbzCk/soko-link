import React, { createContext, useContext, useEffect, useState } from "react";
import { useAuth } from "./AuthContext";

export interface CartItem {
  id: number;
  name: string;
  price: number;
  image_url?: string;
  qty: number;
  seller_id?: number | null;
  seller_name?: string | null;
  seller_area?: string | null;
  seller_region?: string | null;
}

interface CartContextType {
  cart: CartItem[];
  isOpen: boolean;
  addToCart: (product: {
    id: number;
    name: string;
    price: number;
    image_url?: string;
    seller_id?: number | null;
    seller_name?: string | null;
    seller_area?: string | null;
    seller_region?: string | null;
  }) => void;
  removeFromCart: (productId: number) => void;
  updateQuantity: (productId: number, qty: number) => void;
  clearCart: () => void;
  cartCount: number;
  cartTotal: number;
  setIsOpen: (open: boolean) => void;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [cart, setCart] = useState<CartItem[]>([]);
  const [isOpen, setIsOpen] = useState(false);

  const guestCartKey = "cart_items_guest";
  const cartKey = user ? `cart_items_${user.id}` : "cart_items_guest";

  function parseCartItems(raw: string | null): CartItem[] {
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw) as CartItem[];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function mergeCartItems(base: CartItem[], incoming: CartItem[]) {
    const merged = new Map<number, CartItem>();

    for (const item of base) {
      merged.set(item.id, item);
    }

    for (const item of incoming) {
      const existing = merged.get(item.id);
      if (existing) {
        merged.set(item.id, { ...existing, qty: existing.qty + item.qty });
      } else {
        merged.set(item.id, item);
      }
    }

    return Array.from(merged.values());
  }

  useEffect(() => {
    const savedUserCart = parseCartItems(localStorage.getItem(cartKey));

    if (user) {
      const savedGuestCart = parseCartItems(localStorage.getItem(guestCartKey));
      const merged = mergeCartItems(savedUserCart, savedGuestCart);
      setCart(merged);
      localStorage.setItem(cartKey, JSON.stringify(merged));
      if (savedGuestCart.length) {
        localStorage.removeItem(guestCartKey);
      }
      return;
    }

    setCart(savedUserCart);
  }, [cartKey]);

  useEffect(() => {
    localStorage.setItem(cartKey, JSON.stringify(cart));
  }, [cart, cartKey]);

  const addToCart = (product: {
    id: number;
    name: string;
    price: number;
    image_url?: string;
    seller_id?: number | null;
    seller_name?: string | null;
    seller_area?: string | null;
    seller_region?: string | null;
  }) => {
    setCart((prev) => {
      const existing = prev.find((item) => item.id === product.id);
      if (existing) {
        return prev.map((item) =>
          item.id === product.id ? { ...item, qty: item.qty + 1 } : item
        );
      }
      return [...prev, { ...product, qty: 1 }];
    });
  };

  const removeFromCart = (productId: number) => {
    setCart((prev) => prev.filter((item) => item.id !== productId));
  };

  const updateQuantity = (productId: number, qty: number) => {
    if (qty <= 0) {
      setCart((prev) => prev.filter((item) => item.id !== productId));
      return;
    }
    setCart((prev) => prev.map((item) => (item.id === productId ? { ...item, qty } : item)));
  };

  const clearCart = () => setCart([]);

  const cartCount = cart.reduce((sum, item) => sum + item.qty, 0);
  const cartTotal = cart.reduce((sum, item) => sum + item.price * item.qty, 0);

  return (
    <CartContext.Provider value={{ cart, isOpen, addToCart, removeFromCart, updateQuantity, clearCart, cartCount, cartTotal, setIsOpen }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const context = useContext(CartContext);
  if (context === undefined) {
    throw new Error("useCart must be used within a CartProvider");
  }
  return context;
}
