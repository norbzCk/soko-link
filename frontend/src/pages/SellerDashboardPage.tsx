import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { 
  TrendingUp, 
  TrendingDown, 
  DollarSign, 
  ShoppingBag, 
  Clock, 
  CheckCircle2, 
  Truck, 
  AlertTriangle,
  RefreshCcw,
  ChevronRight,
  Package,
  Calendar,
  Layers,
  Activity,
  ArrowUpRight,
  ArrowDownRight,
  BarChart3,
  Trophy,
  Percent,
  Users
} from "lucide-react";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  Legend
} from "recharts";
import { apiRequest } from "../lib/http";
import type { Order, SellerDashboardOverview } from "../types/domain";
import { env } from "../config/env";

interface RevenueRow {
  date: string;
  revenue: number;
}

interface ProductRevenueRow {
  product: string;
  revenue: number;
}

interface DemandRow {
  category: string;
  units: number;
}

interface SellerAnalyticsResponse {
  range_days: number;
  revenue_timeline: RevenueRow[];
  revenue_by_product: ProductRevenueRow[];
  demand_by_category: DemandRow[];
  graphs: {
    revenueByProduct: string | null;
    revenueOverTime: string | null;
  };
}

interface MarketShareData {
  category: string;
  region: string;
  seller_revenue: number;
  total_category_revenue: number;
  market_share_percent: number;
  rank: number;
  total_sellers: number;
  percentile: number;
}

function formatMoney(value?: number) {
  return `TZS ${Number(value || 0).toLocaleString()}`;
}

function compactMoney(value?: number) {
  return `TZS ${Number(value || 0).toLocaleString(undefined, {
    notation: "compact",
    maximumFractionDigits: 1,
  })}`;
}

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1
    }
  }
};

const itemVariants = {
  hidden: { y: 20, opacity: 0 },
  visible: { y: 0, opacity: 1 }
};

export function SellerDashboardPage() {
   const [overview, setOverview] = useState<SellerDashboardOverview | null>(null);
   const [analytics, setAnalytics] = useState<SellerAnalyticsResponse | null>(null);
   const [recentOrders, setRecentOrders] = useState<Order[]>([]);
   const [marketShare, setMarketShare] = useState<MarketShareData | null>(null);
   const [rangeDays, setRangeDays] = useState(30);
   const [error, setError] = useState("");
   const [loading, setLoading] = useState(true);
   const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    void load(true);
  }, [rangeDays]);

   async function load(initialLoad = false) {
     if (initialLoad) setLoading(true);
     if (!initialLoad) setRefreshing(true);
     setError("");

     try {
       const [overviewData, analyticsData, orderData, marketShareData] = await Promise.all([
         apiRequest<SellerDashboardOverview>("/business/dashboard/overview"),
         apiRequest<SellerAnalyticsResponse>(`/business/analytics?range_days=${rangeDays}`),
         apiRequest<{ items: Order[] }>("/business/orders"),
         apiRequest<MarketShareData>("/business/market-share"),
       ]);

       setOverview(overviewData);
       setAnalytics(analyticsData);
       setRecentOrders((orderData.items || []).slice(0, 8));
       setMarketShare(marketShareData);
     } catch (err) {
       setError(err instanceof Error ? err.message : "Failed to load seller dashboard");
     } finally {
       setLoading(false);
       setRefreshing(false);
     }
   }

const stats = useMemo(() => {
  if (!overview) return [];

  const totalProducts = overview.inventory.total_products || 0;
  const lowStock = overview.inventory.low_stock || 0;
  const outOfStock = overview.inventory.out_of_stock || 0;

  const inventoryHealth =
    totalProducts > 0
      ? Math.round(((totalProducts - (lowStock + outOfStock)) / totalProducts) * 100)
      : 0;

  return [
    {
      label: "Today's Revenue",
      value: formatMoney(overview.summary.revenue_today),
      icon: DollarSign,
      color: "text-emerald-500",
      bg: "bg-emerald-500/10",
      trend: "+12.5%",
      isPositive: true
    },

    {
      label: "Avg Order Value",
      value: formatMoney(overview.summary.orders_total > 0 ? overview.summary.revenue_total / overview.summary.orders_total : 0),
      icon: BarChart3,
      color: "text-purple-500",
      bg: "bg-purple-500/10",
      trend: "+5.4%",
      isPositive: true
    },

    {
      label: "Active Orders",
      value: overview.summary.orders_pending,
      icon: Clock,
      color: "text-amber-500",
      bg: "bg-amber-500/10",
      trend: "Stable",
      isPositive: true
    },

    {
      label: "Total Sales",
      value: overview.summary.orders_total,
      icon: ShoppingBag,
      color: "text-brand",
      bg: "bg-brand/10",
      trend: "+8.2%",
      isPositive: true
    },

    {
      label: "Completed Orders",
      value: overview.summary.orders_completed,
      icon: CheckCircle2,
      color: "text-emerald-600",
      bg: "bg-emerald-600/10",
      trend: "+6.1%",
      isPositive: true
    },

    {
      label: "Pending Deliveries",
      value: overview.summary.ongoing_deliveries,
      icon: Truck,
      color: "text-orange-500",
      bg: "bg-orange-500/10",
      trend: "Watch",
      isPositive: false
    },

    {
      label: "Inventory Health",
      value: `${inventoryHealth}%`,
      icon: Layers,
      color: "text-blue-500",
      bg: "bg-blue-500/10",
      trend: inventoryHealth > 70 ? "Healthy" : "Risk",
      isPositive: inventoryHealth > 70
    },

    {
      label: "Low Stock Items",
      value: lowStock,
      icon: AlertTriangle,
      color: "text-yellow-500",
      bg: "bg-yellow-500/10",
      trend: lowStock > 0 ? "Attention" : "Good",
      isPositive: lowStock === 0
    }
  ];
}, [overview]);

  function resolveGraphUrl(path?: string | null) {
    if (!path) return "";
    return `${env.apiBase}${path}?t=${Date.now()}`;
  }

  if (loading) {
    return (
      <div className="h-96 flex flex-col items-center justify-center gap-6">
        <div className="w-16 h-16 border-4 border-brand/10 border-t-brand rounded-full animate-spin" />
        <p className="font-black text-[10px] uppercase tracking-[0.3em] text-text-muted animate-pulse">Synchronizing Business Intelligence...</p>
      </div>
    );
  }

  return (
    <motion.div 
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="space-y-10 max-w-7xl mx-auto"
    >
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-8">
        <div className="space-y-2">
          <span className="text-[10px] font-black uppercase tracking-[0.4em] text-brand">Merchant Command Center</span>
          <h1 className="text-4xl font-display font-black text-text tracking-tight">Business Operations</h1>
          <p className="text-text-muted font-medium text-lg">Real-time performance metrics and predictive analytics.</p>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-3 bg-surface border border-border p-1 rounded-2xl shadow-sm">
            {[7, 30, 90].map(d => (
              <button
                key={d}
                onClick={() => setRangeDays(d)}
                className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${rangeDays === d ? 'bg-brand text-white shadow-lg' : 'text-text-muted hover:text-text'}`}
              >
                {d}D
              </button>
            ))}
          </div>
          <button 
            onClick={() => void load()}
            disabled={refreshing}
            className="h-12 px-6 flex items-center gap-3 rounded-2xl bg-surface-soft border border-border text-text font-black text-xs uppercase tracking-widest hover:bg-surface-strong transition-all disabled:opacity-50 active:scale-95"
          >
            <RefreshCcw size={16} className={refreshing ? "animate-spin" : ""} />
            {refreshing ? "Syncing..." : "Sync Network"}
          </button>
        </div>
      </div>

      {error && <div className="p-5 bg-danger/10 text-danger rounded-[2rem] font-bold border border-danger/20 animate-soft-enter">{error}</div>}

       {/* Stats Grid */}
       <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
         {stats.map((stat, i) => (
           <motion.article 
             key={stat.label}
             variants={itemVariants}
             className="stat-card group"
           >
             <div className="flex items-center justify-between">
               <span>{stat.label}</span>
               <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${stat.bg} ${stat.color} group-hover:scale-110 transition-transform`}>
                 <stat.icon size={20} />
               </div>
             </div>
             <div className="flex items-end justify-between gap-4 mt-2">
               <strong className="text-3xl font-display font-black text-text leading-none">{stat.value}</strong>
               <div className={`flex items-center gap-1 text-[10px] font-black uppercase ${stat.isPositive ? 'text-emerald-500' : 'text-danger'}`}>
                 {stat.isPositive ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                 {stat.trend}
               </div>
             </div>
           </motion.article>
         ))}
       </div>
       
       {/* Market Share Section */}
       {marketShare && (
         <motion.article 
           variants={itemVariants}
           className="glass-card p-8 space-y-6"
         >
           <div className="flex items-center justify-between">
             <div className="space-y-1">
               <h3 className="text-xl font-display font-black text-text tracking-tight flex items-center gap-2">
                 <BarChart3 size={20} className="text-brand" />
                 Market Share Analysis
               </h3>
               <p className="text-sm text-text-muted font-medium mt-1">Your position in the {marketShare.category} market in {marketShare.region}</p>
             </div>
             <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-brand/5 border border-brand/10 text-brand font-black text-xs tracking-widest uppercase">
               {marketShare.market_share_percent >= 10 ? <TrendingUp size={16} className="text-emerald-500" /> : <TrendingDown size={16} className="text-danger" />}
               Top {marketShare.percentile >= 50 ? `${marketShare.percentile.toFixed(0)}%` : 'Bottom 50%'}
             </div>
           </div>
           
           <div className="grid grid-cols-2 gap-6">
             <div className="space-y-4">
               <div className="flex items-center gap-3 p-4 rounded-xl bg-surface-soft/30 border border-border">
                 <ShoppingBag size={20} className="text-brand" />
                 <div>
                   <p className="text-[9px] font-black text-text-muted uppercase tracking-widest">Your Revenue</p>
                   <strong className="text-sm font-black text-text">{compactMoney(marketShare.seller_revenue)}</strong>
                 </div>
               </div>
               <div className="flex items-center gap-3 p-4 rounded-xl bg-surface-soft/30 border border-border">
                 <Users size={20} className="text-blue-500" />
                 <div>
                   <p className="text-[9px] font-black text-text-muted uppercase tracking-widest">Total Market</p>
                   <strong className="text-sm font-black text-text">{compactMoney(marketShare.total_category_revenue)}</strong>
                 </div>
               </div>
             </div>
             
             <div className="space-y-4">
               <div className="flex items-center gap-3 p-4 rounded-xl bg-surface-soft/30 border border-border">
                 <Trophy size={20} className="text-amber-500" />
                 <div>
                   <p className="text-[9px] font-black text-text-muted uppercase tracking-widest">Your Rank</p>
                   <strong className="text-sm font-black text-text">#{marketShare.rank} of {marketShare.total_sellers}</strong>
                 </div>
               </div>
               <div className="flex items-center gap-3 p-4 rounded-xl bg-surface-soft/30 border border-border">
                 <Percent size={20} className="text-green-500" />
                 <div>
                   <p className="text-[9px] font-black text-text-muted uppercase tracking-widest">Market Share</p>
                   <strong className="text-sm font-black text-text">{marketShare.market_share_percent}%</strong>
                 </div>
               </div>
             </div>
           </div>
           
           <div className="pt-4 border-t border-border">
             <div className="flex justify-between">
               <span className="text-[9px] font-black text-text-muted uppercase tracking-widest">Performance Insight</span>
               {marketShare.market_share_percent >= 20 ? (
                 <span className="text-xs font-bold text-emerald-500">Strong market position - consider expanding inventory</span>
               ) : marketShare.market_share_percent >= 5 ? (
                 <span className="text-xs font-bold text-amber-500">Growing presence - focus on customer retention</span>
               ) : (
                 <span className="text-xs font-bold text-blue-500">Emerging player - increase marketing efforts</span>
               )}
             </div>
           </div>
         </motion.article>
       )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
        {/* Revenue Growth - Main Chart Area */}
        <motion.article 
          variants={itemVariants}
          className="lg:col-span-2 glass-card p-10 flex flex-col space-y-10"
        >
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div>
              <h3 className="text-2xl font-display font-black text-text tracking-tight">Revenue Trajectory</h3>
              <p className="text-sm text-text-muted font-medium mt-1">Growth progression for the selected protocol cycle.</p>
            </div>
            <div className="flex items-center gap-3 px-4 py-2 rounded-xl bg-brand/5 border border-brand/10 text-brand font-black text-xs tracking-widest uppercase">
              <Activity size={16} />
              Live Performance
            </div>
          </div>
          
          <div className="aspect-[21/9] w-full rounded-2xl overflow-hidden bg-surface-soft/50 border border-border flex items-center justify-center">
            <div className="aspect-[21/9] w-full rounded-2xl overflow-hidden bg-surface-soft/50 border border-border p-4">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={analytics?.revenue_timeline || []}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                  
                  <XAxis 
                    dataKey="date"
                    tickFormatter={(value) =>
                      new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric" })
                    }
                  />

                  <YAxis 
                    tickFormatter={(value) => `TZS ${value / 1000}K`}
                  />

                  <Tooltip 
                    formatter={(value) => formatMoney(value as number | undefined)}
                    labelFormatter={(label) =>
                      new Date(label).toLocaleDateString()
                    }
                  />

                  <Line
                    type="monotone"
                    dataKey="revenue"
                    strokeWidth={3}
                    dot={false}
                    activeDot={{ r: 6 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {analytics?.revenue_timeline.slice(-4).map(item => (
              <div key={item.date} className="p-4 rounded-xl bg-surface-soft border border-border">
                <span className="text-[9px] font-black text-text-muted uppercase tracking-widest block mb-1">{new Date(item.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
                <strong className="text-sm font-black text-text">{compactMoney(item.revenue)}</strong>
              </div>
            ))}
          </div>
        </motion.article>

        {/* Inventory Overview */}
        <motion.article 
          variants={itemVariants}
          className="glass-card p-10 flex flex-col"
        >
          <div className="mb-10">
            <h3 className="text-2xl font-display font-black text-text tracking-tight">System Alerts</h3>
            <p className="text-sm text-text-muted font-medium mt-1">Stock-out predictions and risk vectors.</p>
          </div>

          <div className="space-y-6 flex-1">
            {overview?.inventory?.alerts?.slice(0, 6)?.map((alert, i) => (
              <div key={i} className="flex items-center gap-5 group cursor-pointer p-1 rounded-2xl hover:bg-surface-soft transition-colors">
                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 border-2 ${alert.current_stock === 0 ? 'bg-danger/10 border-danger/10 text-danger' : 'bg-amber-500/10 border-amber-500/10 text-amber-500'}`}>
                  <AlertTriangle size={24} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-black text-text truncate group-hover:text-brand transition-colors">{alert.product_name}</p>
                  <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-text-muted mt-1">
                    {alert.current_stock} Units • Limit {alert.low_stock_threshold}
                  </p>
                </div>
                <ChevronRight size={16} className="text-text-muted opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all" />
              </div>
            ))}
            {(!overview?.inventory?.alerts?.length) && (
              <div className="h-full flex flex-col items-center justify-center text-center space-y-6 opacity-30 py-10">
                <div className="w-20 h-20 rounded-[2.5rem] bg-surface-soft flex items-center justify-center border-2 border-dashed border-border text-emerald-500">
                  <CheckCircle2 size={40} />
                </div>
                <p className="text-sm font-black uppercase tracking-[0.2em]">Inventory Optimized</p>
              </div>
            )}
          </div>

          <button className="w-full mt-10 py-5 rounded-[1.75rem] bg-surface-soft border border-border text-[10px] font-black uppercase tracking-[0.3em] text-text hover:bg-surface-strong transition-all shadow-sm active:scale-95">
            Detailed Inventory Report
          </button>
        </motion.article>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
        {/* Recent Orders */}
        <motion.article 
          variants={itemVariants}
          className="glass-card overflow-hidden"
        >
          <div className="p-10 border-b border-border bg-surface-soft/30 flex items-center justify-between">
            <div>
              <h3 className="text-2xl font-display font-black text-text tracking-tight">Recent Ledger</h3>
              <p className="text-sm text-text-muted font-medium">Real-time marketplace transactions.</p>
            </div>
            <span className="text-[10px] font-black uppercase tracking-[0.3em] text-brand bg-brand/10 px-4 py-2 rounded-full border border-brand/20">Active Node</span>
          </div>
          <div className="divide-y divide-border">
            {recentOrders.map((order) => (
              <div key={order.id} className="p-8 flex items-center justify-between group hover:bg-surface-soft/60 transition-all cursor-pointer">
                <div className="flex items-center gap-6">
                  <div className="w-14 h-14 rounded-2xl bg-surface-soft flex items-center justify-center text-text-muted group-hover:bg-brand group-hover:text-white transition-all shadow-inner border border-border">
                    <ShoppingBag size={24} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-lg font-display font-black text-text truncate group-hover:text-brand transition-colors">{order.product}</p>
                     <p className="text-[10px] font-bold text-text-muted uppercase tracking-widest mt-1">
                       {order.order_date ? new Date(order.order_date).toLocaleDateString() : '—'} • {order.quantity} Units
                     </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xl font-display font-black text-text">{formatMoney(order.total)}</p>
                  <span className={`text-[10px] font-black uppercase tracking-widest mt-2 inline-block px-3 py-1 rounded-lg ${order.status === 'delivered' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-amber-500/10 text-amber-500'}`}>
                    {order.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
          <div className="p-8 bg-surface-soft/30 border-t border-border text-center">
            <button className="text-[10px] font-black uppercase tracking-[0.3em] text-brand hover:text-brand-strong transition-all flex items-center justify-center mx-auto gap-2 group">
              View Full Transactional Ledger
              <ChevronRight size={14} className="group-hover:translate-x-1 transition-transform" />
            </button>
          </div>
        </motion.article>

        {/* Top Products - Trend Graph */}
        <motion.article 
          variants={itemVariants}
          className="glass-card p-10 space-y-10"
        >
          <div>
            <h3 className="text-2xl font-display font-black text-text tracking-tight">Product Performance</h3>
            <p className="text-sm text-text-muted font-medium mt-1">Market leaders by revenue generation.</p>
          </div>

          <div className="aspect-[4/3] w-full rounded-2xl overflow-hidden bg-surface-soft/50 border border-border flex items-center justify-center">
            <div className="aspect-[4/3] w-full rounded-2xl overflow-hidden bg-surface-soft/50 border border-border p-4">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={analytics?.revenue_by_product || []}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.2} />

                  <XAxis dataKey="product" />
                  
                  <YAxis tickFormatter={(value) => `TZS ${value / 1000}K`} />

                  <Tooltip formatter={(value) => formatMoney(value as number)} />

                  <Bar dataKey="revenue" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="glass-card p-10 space-y-6">
            <h3 className="text-xl font-display font-black text-text tracking-tight">Demand Distribution</h3>

            <div className="h-80 rounded-2xl overflow-hidden bg-surface-soft/50 border border-border">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={analytics?.demand_by_category || []}
                    dataKey="units"
                    nameKey="category"
                    outerRadius={100}
                    label
                  >
                    {(analytics?.demand_by_category || []).map((_, index) => (
                      <Cell key={index} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="pt-10 border-t border-border flex items-center justify-between">
            <div className="flex flex-col">
              <span className="text-[9px] font-black uppercase tracking-widest text-text-muted">Protocol State</span>
              <span className="text-xs font-bold text-emerald-500">Live Growth Sync</span>
            </div>
            <TrendingUp size={20} className="text-emerald-500" />
          </div>
        </motion.article>
      </div>
    </motion.div>
  );
}
