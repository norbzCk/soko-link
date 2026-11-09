import type { BusinessProfile } from "./domain";

export type SellerProductStatus = "draft" | "pending" | "approved" | "rejected" | "archived";

export interface SellerProduct {
  id: number;
  name: string;
  category: string;
  price: number;
  stock: number;
  reserved_stock: number;
  available_stock: number;
  low_stock_threshold: number;
  is_low_stock: boolean;
  description?: string | null;
  image_url?: string | null;
  unit?: string | null;
  variants?: Array<Record<string, unknown>>;
  specifications?: Record<string, unknown>;
  status: SellerProductStatus;
  moderation_reason?: string | null;
  is_active: boolean;
  rating_avg: number;
  rating_count: number;
  submitted_at?: string | null;
  approved_at?: string | null;
  archived_at?: string | null;
}

export interface InventoryMovement {
  id: number;
  product_id: number;
  movement_type: string;
  quantity_delta: number;
  balance_after: number;
  reason?: string | null;
  reference_type?: string | null;
  reference_id?: number | null;
  actor_type: string;
  created_at?: string | null;
}

export interface SellerOrder {
  id: number;
  order_date?: string | null;
  product?: string | null;
  category?: string | null;
  quantity?: number | null;
  unit_price: number;
  total: number;
  status: string;
  status_reason?: string | null;
  customer_id?: number | null;
  customer_name?: string | null;
  customer_email?: string | null;
  customer_phone?: string | null;
  delivery_address?: string | null;
  delivery_phone?: string | null;
  delivery_notes?: string | null;
  delivery_method?: string | null;
  product_id?: number | null;
  payment_status?: string | null;
  payment_method?: string | null;
  delivery_id?: number | null;
  delivery_status?: string | null;
  logistics_id?: number | null;
  logistics_name?: string | null;
  priority?: string;
  items?: Array<{
    id: number;
    product_id?: number | null;
    product_name: string;
    quantity: number;
    unit_price: number;
    total_amount: number;
    status: string;
  }>;
  status_history?: Array<{
    status: string;
    reason?: string | null;
    actor_type: string;
    created_at?: string | null;
  }>;
  thread_id?: number | null;
}

export interface SellerDashboard {
  business: BusinessProfile;
  summary: {
    revenue_today: number;
    revenue_week: number;
    revenue_month: number;
    revenue_total: number;
    orders_total: number;
    orders_pending: number;
    orders_completed: number;
    orders_cancelled: number;
    average_rating?: number | null;
    rating_count: number;
    unread_notifications: number;
    pending_rfqs: number;
    pending_products: number;
    open_disputes: number;
    my_active_quotations: number;
  };
  finance: SellerFinance;
  inventory: {
    total_products: number;
    total_value: number;
    out_of_stock: number;
    low_stock: number;
    alerts: Array<{ product_id: number; product_name: string; current_stock: number; low_stock_threshold: number }>;
  };
  recent_orders: SellerOrder[];
  actions: Array<{ id: string; label: string; href: string }>;
}

export interface SellerFinance {
  currency: string;
  gross_revenue: number;
  platform_fee_percent: number;
  platform_fee: number;
  net_revenue: number;
  pending_settlement: number;
  refunds_pending: number;
  available_for_payout: number;
  pending_payouts: number;
  paid_out: number;
  successful_orders: number;
  paid_transactions: number;
  payout_account?: SellerPayoutAccount | null;
  minimum_payout_amount?: number;
  recent_payouts?: SellerPayout[];
  can_request_payout?: boolean;
}

export interface SellerPayoutAccount {
  id: number;
  method: string;
  account_name: string;
  account_number_masked: string;
  status: string;
  rejection_reason?: string | null;
  verified_at?: string | null;
  updated_at?: string | null;
}

export interface SellerPayout {
  id: number;
  amount: number;
  currency: string;
  status: string;
  method?: string | null;
  destination_label?: string | null;
  reference?: string | null;
  note?: string | null;
  rejection_reason?: string | null;
  requested_at?: string | null;
  processed_at?: string | null;
}

export interface SellerRfq {
  id: number;
  company_name: string;
  contact_name: string;
  product_interest: string;
  category?: string | null;
  quantity: number;
  target_budget?: string | null;
  notes?: string | null;
  deadline?: string | null;
  status: string;
  created_at?: string | null;
  quotation_count: number;
  my_quotation?: SellerQuotation | null;
}

export interface SellerQuotation {
  id: number;
  rfq_id: number;
  unit_price: number;
  total_price: number;
  currency: string;
  lead_time_days?: number | null;
  valid_until?: string | null;
  notes?: string | null;
  status: string;
  version: number;
  submitted_at?: string | null;
  withdrawn_at?: string | null;
  accepted_at?: string | null;
  updated_at?: string | null;
  rfq?: SellerRfq | null;
}

export interface SellerPromotion {
  id: number;
  product_id: number;
  product_name?: string | null;
  name: string;
  discount_type: "percent" | "fixed" | string;
  discount_value: number;
  starts_at?: string | null;
  ends_at?: string | null;
  status: string;
  stored_status: string;
  rejection_reason?: string | null;
  promotional_price?: number | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface SellerReview {
  sale_id: number;
  product?: string | null;
  category?: string | null;
  rating: number;
  rated_at?: string | null;
  customer_id?: number | null;
  order_date?: string | null;
  reply?: { id: number; message: string; created_at?: string | null; updated_at?: string | null } | null;
  reports: Array<{ id: number; reason: string; status: string; created_at?: string | null }>;
}

export interface SellerReviewResponse {
  summary: {
    average_rating?: number | null;
    total_reviews: number;
    distribution: Record<string, number>;
  };
  items: SellerReview[];
}

export interface SellerAnalytics {
  range_days: number;
  summary: {
    revenue: number;
    orders: number;
    paid_orders: number;
    cancelled_orders: number;
    average_order_value: number;
    fulfilment_rate: number;
    cancellation_rate: number;
    average_rating?: number | null;
    new_customers: number;
    returning_customers: number;
  };
  revenue_timeline: Array<{ date: string; orders: number; units: number; revenue: number }>;
  top_products: Array<{ product: string; orders: number; units: number; revenue: number }>;
  slow_moving_products: Array<{ product: string; orders: number; units: number; revenue: number }>;
  quotation_activity: { submitted: number; accepted: number; withdrawn: number };
  notes: string[];
}

export interface SellerCustomer {
  buyer_id: number;
  name: string;
  phone?: string | null;
  email?: string | null;
  orders: number;
  completed_orders: number;
  total_spent: number;
  last_order_at?: string | null;
  average_rating?: number | null;
  thread_id?: number | null;
}

export interface SellerThread {
  id: number;
  sale_id?: number | null;
  order_id?: number | null;
  subject?: string | null;
  buyer_id?: number | null;
  last_message?: string | null;
  last_message_at?: string | null;
}

export interface SellerMessage {
  id: number;
  sender_type: string;
  sender_id: number;
  sender_name: string;
  sender_role: string;
  text: string;
  created_at?: string | null;
}

export interface SellerDispute {
  id: number;
  sale_id: number;
  product?: string | null;
  buyer_id: number;
  status: string;
  resolution_details?: string | null;
  message_count: number;
  created_at?: string | null;
  resolved_at?: string | null;
}

export interface SellerSettings {
  business: BusinessProfile;
  payout_account?: SellerPayoutAccount | null;
  security: {
    mfa_status: string;
    password_changed_supported: boolean;
    session_management_supported: boolean;
    note: string;
  };
  sessions: Array<{ id: number; active_role?: string | null; created_at?: string | null; expires_at?: string | null }>;
  verification: {
    status?: string | null;
    documents: Array<{
      id: number;
      document_type?: string | null;
      status: string;
      submitted_at?: string | null;
      reviewed_at?: string | null;
    }>;
  };
}
