import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../features/auth/AuthContext";
import { env } from "../config/env";
import { apiRequest } from "../lib/http";
import { Pie } from "react-chartjs-2";
import {
  Chart as ChartJS,
  ArcElement,
  Tooltip,
  Legend,
} from 'chart.js';
import type { DashboardAnalytics, DashboardChartPoint } from "../types/domain";

ChartJS.register(ArcElement, Tooltip, Legend);

const CHART_WIDTH = 920;
const CHART_HEIGHT = 280;
const CHART_PADDING = 32;

const emptyAnalytics: DashboardAnalytics = {
  cards: [],
  revenueByProduct: [],
  revenueOverTime: [],
  recentSales: [],
};

function formatMoney(value?: number) {
  return `TZS ${Number(value || 0).toLocaleString()}`;
}

function formatCompactMoney(value?: number) {
  return `TZS ${Number(value || 0).toLocaleString(undefined, {
    notation: "compact",
    maximumFractionDigits: 1,
  })}`;
}

function formatDateLabel(value?: string | null) {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function resolveGraphUrl(path?: string | null) {
  if (!path) return "";
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  if (path.startsWith("/")) return `${env.apiBase}${path}`;
  return `${env.apiBase}/${path.replace(/^\/+/, "")}`;
}

function buildVerticalBarChart(points: DashboardChartPoint[]) {
  const values = points.map((point) => Number(point.value || 0));
  const safeValues = values.length ? values : [0];
  const max = Math.max(...safeValues);
  const range = max || 1;
  const innerWidth = CHART_WIDTH - CHART_PADDING * 2;
  const innerHeight = CHART_HEIGHT - CHART_PADDING * 2;
  const barWidth = Math.max(20, (innerWidth / safeValues.length) * 0.8);
  const barSpacing = Math.max(5, (innerWidth / safeValues.length) * 0.2);

  const bars = safeValues.map((value, index) => {
    const x = CHART_PADDING + index * (barWidth + barSpacing);
    const barHeight = (value / range) * innerHeight;
    const y = CHART_PADDING + innerHeight - barHeight;
    return { x, y, width: barWidth, height: barHeight, value };
  });

  return { bars, max, range };
}

export function AdminDashboardPage() {
  const { user } = useAuth();
  const [analytics, setAnalytics] = useState<DashboardAnalytics>(emptyAnalytics);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function load() {
      try {
        const data = await apiRequest<DashboardAnalytics>("/dashboard/analytics");
        if (mounted) {
          setAnalytics({
            cards: data.cards || [],
            revenueByProduct: data.revenueByProduct || [],
            revenueOverTime: data.revenueOverTime || [],
            recentSales: data.recentSales || [],
            peakPeriods: data.peakPeriods,
            customerPatterns: data.customerPatterns,
            orderStatusBreakdown: data.orderStatusBreakdown || { Pending: 0, Completed: 0, Cancelled: 0 },
          });
        }
      } catch (err) {
        if (mounted) setError(err instanceof Error ? err.message : "Failed to load dashboard");
      } finally {
        if (mounted) setLoading(false);
      }
    }

    void load();
    return () => {
      mounted = false;
    };
  }, []);

   const revenueTrendChart = useMemo(() => buildVerticalBarChart(analytics.revenueOverTime), [analytics.revenueOverTime]);
   const productRevenueChart = useMemo(() => buildVerticalBarChart(analytics.revenueByProduct), [analytics.revenueByProduct]);
   const maxProductRevenue = useMemo(
     () => Math.max(...analytics.revenueByProduct.map((item) => Number(item.value || 0)), 1),
     [analytics.revenueByProduct],
   );
   const revenueTimeGraphUrl = resolveGraphUrl(analytics.graphs?.revenueOverTime);
   const revenueProductGraphUrl = resolveGraphUrl(analytics.graphs?.revenueByProduct);

   // Order status breakdown for pie chart
   const orderStatusBreakdownData = useMemo(() => {
     const breakdown = analytics.orderStatusBreakdown || { Pending: 0, Completed: 0, Cancelled: 0 };
     const labels = Object.keys(breakdown);
     const data = Object.values(breakdown);
     const colors = [
       '#f97316', // orange - pending
       '#22c55e', // green - completed
       '#ef4444', // red - cancelled
     ];
     return {
       labels,
       datasets: [{
         data,
         backgroundColor: colors.slice(0, labels.length),
         borderColor: colors.slice(0, labels.length).map(c => c.replace('0.8', '1')), // not needed but ok
         borderWidth: 2,
       }],
     };
   }, [analytics.orderStatusBreakdown]);

   const orderStatusPieOptions = {
     responsive: true,
     plugins: {
       legend: {
         position: 'right' as const,
         labels: {
           padding: 20,
           usePointStyle: true,
           font: { size: 12 },
         },
       },
       tooltip: {
         callbacks: {
           label: (context: any) => {
             const label = context.label || '';
             const value = context.parsed || 0;
             const total = context.dataset.data.reduce((a: number, b: number) => a + b, 0);
             const percentage = total > 0 ? Math.round((value / total) * 100) : 0;
             return `${label}: ${value} orders (${percentage}%)`;
           },
         },
       },
     },
   };

  if (user?.role === "user") {
    return (
      <section className="p-6">
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 mb-2">Dashboard</p>
        <h1 className="text-2xl font-display font-bold text-slate-900 dark:text-white">Customer accounts use the customer dashboard.</h1>
      </section>
    );
  }

  if (user?.role === "logistics") {
    return (
      <section className="p-6">
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 mb-2">dashboard</p>
        <h1 className="text-2xl font-display font-bold text-slate-900 dark:text-white">Logistics accounts use the logistics dashboard.</h1>
      </section>
    );
  }

  return (
    <div className="space-y-6 animate-soft-enter">
      {/* Hero Section */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 p-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">business workspace</p>
            <h1 className="text-3xl font-display font-black text-slate-900 dark:text-white tracking-tight mt-1">business overview</h1>
            <p className="text-slate-500 dark:text-slate-400 mt-1">live totals and trends from your recorded sales.</p>
          </div>
          <button
            className="px-4 py-2 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-medium text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
            onClick={() => window.open(`${env.apiBase}/dashboard/export-sales`, "_blank")}
          >
            export report (csv)
          </button>
        </div>
      </div>

      {error ? <div className="p-4 bg-red-50 text-red-700 rounded-xl font-bold flex items-center gap-3 border border-red-100">{error}</div> : null}
      {loading ? <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 p-6">loading dashboard...</div> : null}

      {!loading ? (
        <>
          {/* Stats Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {analytics.cards.map((card) => (
              <article key={card.id} className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 p-6 space-y-2">
                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">{card.label}</span>
                <strong className="text-2xl font-display font-black text-slate-900 dark:text-white">{card.display}</strong>
                <p className="text-sm text-slate-500 dark:text-slate-400">{card.subtitle}</p>
              </article>
            ))}
          </div>

          {/* Charts Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Revenue Over Time */}
            <article className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 p-6">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3 mb-6">
                <div>
                  <h2 className="text-xl font-display font-bold text-slate-900 dark:text-white">revenue over time</h2>
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    {analytics.revenueOverTime.length
                      ? `maximum: ${formatCompactMoney(revenueTrendChart.max)}`
                      : "no revenue trend available yet."}
                  </p>
                </div>
                <span className="text-xs font-bold text-slate-500 dark:text-slate-400">{analytics.revenueOverTime.length} points</span>
              </div>
              {revenueTimeGraphUrl ? (
                <div className="rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700">
                  <img src={revenueTimeGraphUrl} alt="Revenue over time graph" className="w-full h-auto" />
                </div>
              ) : (
                <div className="relative rounded-xl overflow-hidden bg-slate-50 dark:bg-slate-900/50">
                  <svg viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`} role="img" aria-label="Revenue over time" className="w-full h-auto">
                    <defs>
                      <linearGradient id="adminRevenueGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#16a34a" stopOpacity="0.8" />
                        <stop offset="100%" stopColor="#16a34a" stopOpacity="0.4" />
                      </linearGradient>
                    </defs>
                    {/* Grid lines */}
                    <line x1={CHART_PADDING} y1={CHART_PADDING} x2={CHART_PADDING} y2={CHART_HEIGHT - CHART_PADDING} stroke="rgba(19, 33, 42, 0.12)" strokeWidth="1" />
                    <line x1={CHART_PADDING} y1={CHART_HEIGHT - CHART_PADDING} x2={CHART_WIDTH - CHART_PADDING} y2={CHART_HEIGHT - CHART_PADDING} stroke="rgba(19, 33, 42, 0.12)" strokeWidth="1" />
                    
                    {/* Bars */}
                    {revenueTrendChart.bars.map((bar, index) => (
                      <rect
                        key={`bar-${index}`}
                        x={bar.x}
                        y={bar.y}
                        width={bar.width}
                        height={bar.height}
                        fill="url(#adminRevenueGradient)"
                        rx="2"
                        ry="2"
                      />
                    ))}
                    
                    {/* Value labels on top of bars */}
                    {revenueTrendChart.bars.map((bar, index) => (
                      <text
                        key={`label-${index}`}
                        x={bar.x + bar.width / 2}
                        y={bar.y - 5}
                        textAnchor="middle"
                        fontSize="10"
                        fill="#166534"
                        fontWeight="600"
                      >
                        {formatCompactMoney(bar.value)}
                      </text>
                    ))}
                  </svg>
                </div>
              )}
              <div className="flex justify-between mt-2 text-xs text-slate-500 dark:text-slate-400">
                {(analytics.revenueOverTime.length ? analytics.revenueOverTime : [{ label: "", value: 0 }]).slice(0, 7).map((point, index) => (
                  <span key={`${point.label}-${index}`}>{formatDateLabel(point.label)}</span>
                ))}
              </div>
            </article>

            {/* Revenue by Product */}
            <article className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 p-6">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3 mb-6">
                <div>
                  <h2 className="text-xl font-display font-bold text-slate-900 dark:text-white">revenue by product</h2>
                  <p className="text-sm text-slate-500 dark:text-slate-400">top products by earned revenue</p>
                </div>
                <span className="text-xs font-bold text-slate-500 dark:text-slate-400">{analytics.revenueByProduct.length} products</span>
              </div>
              {revenueProductGraphUrl ? (
                <div className="rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700">
                  <img src={revenueProductGraphUrl} alt="Revenue by product graph" className="w-full h-auto" />
                </div>
               ) : productRevenueChart && productRevenueChart.bars.length ? (
                 <div>
                   <div className="rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700">
                     <svg viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`} role="img" aria-label="Revenue by product" className="w-full h-auto">
                       <defs>
                         <linearGradient id="productRevenueGradient" x1="0" y1="0" x2="0" y2="1">
                           <stop offset="0%" stopColor="#16a34a" stopOpacity="0.8" />
                           <stop offset="100%" stopColor="#16a34a" stopOpacity="0.4" />
                         </linearGradient>
                       </defs>
                       {/* Grid lines */}
                       <line x1={CHART_PADDING} y1={CHART_PADDING} x2={CHART_PADDING} y2={CHART_HEIGHT - CHART_PADDING} stroke="rgba(19, 33, 42, 0.12)" strokeWidth="1" />
                       <line x1={CHART_PADDING} y1={CHART_HEIGHT - CHART_PADDING} x2={CHART_WIDTH - CHART_PADDING} y2={CHART_HEIGHT - CHART_PADDING} stroke="rgba(19, 33, 42, 0.12)" strokeWidth="1" />
                       {/* Bars */}
                       {productRevenueChart.bars.map((bar, index) => (
                         <rect
                           key={`bar-${index}`}
                           x={bar.x}
                           y={bar.y}
                           width={bar.width}
                           height={bar.height}
                           fill="url(#productRevenueGradient)"
                           rx="2"
                           ry="2"
                         />
                       ))}
                       {/* Value labels on top */}
                       {productRevenueChart.bars.map((bar, index) => (
                         <text
                           key={`label-${index}`}
                           x={bar.x + bar.width / 2}
                           y={bar.y - 5}
                           textAnchor="middle"
                           fontSize="10"
                           fill="#166534"
                           fontWeight="600"
                         >
                           {formatCompactMoney(bar.value)}
                         </text>
                       ))}
                     </svg>
                   </div>
                   <div className="flex justify-between mt-2 text-xs text-slate-500 dark:text-slate-400">
                     {analytics.revenueByProduct.map((point, index) => (
                       <span key={`${point.label}-${index}`} className="truncate" title={point.label}>{point.label}</span>
                     ))}
                   </div>
                 </div>
               ) : (
                 <p className="text-sm text-slate-500 dark:text-slate-400">no product revenue data yet.</p>
               )}
               </article>
               {/* Order Status Breakdown */}
               <article className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 p-6">
                 <div className="mb-6">
                   <h2 className="text-xl font-display font-bold text-slate-900 dark:text-white">Order Status Breakdown</h2>
                   <p className="text-sm text-slate-500 dark:text-slate-400">distribution of orders by fulfillment stage.</p>
                 </div>
                 <div className="flex justify-center">
                   <div className="w-full max-w-xs">
                     {(() => {
                       const total = orderStatusBreakdownData.datasets[0].data.reduce((a: number, b: number) => a + b, 0);
                       return total > 0 ? <Pie data={orderStatusBreakdownData} options={orderStatusPieOptions} /> : <p className="text-sm text-slate-500 dark:text-slate-400 text-center">No data available.</p>;
                     })()}
                   </div>
                 </div>
               </article>
             </div>

          {/* Recent Sales Table */}
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
            <div className="p-6 border-b border-slate-200 dark:border-slate-700 flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
              <div>
                <h2 className="text-xl font-display font-bold text-slate-900 dark:text-white">recent sales</h2>
                <p className="text-sm text-slate-500 dark:text-slate-400">latest sales recorded by the business.</p>
              </div>
              <span className="text-xs font-bold text-slate-500 dark:text-slate-400">{analytics.recentSales.length} records</span>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700">
                <thead className="bg-slate-50 dark:bg-slate-900/50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">date</th>
                    <th className="px-6 py-3 text-left text-xs font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">product</th>
                    <th className="px-6 py-3 text-left text-xs font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">category</th>
                    <th className="px-6 py-3 text-left text-xs font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">quantity</th>
                    <th className="px-6 py-3 text-left text-xs font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">revenue</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                  {!analytics.recentSales.length ? <tr><td colSpan={5} className="px-6 py-8 text-center text-sm text-slate-500 italic">no recent sales yet.</td></tr> : null}
                  {analytics.recentSales.map((sale, index) => (
                    <tr key={`${sale.date || "sale"}-${index}`} className="hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors">
                      <td className="px-6 py-4 text-sm text-slate-900 dark:text-slate-100 whitespace-nowrap">{formatDateLabel(sale.date)}</td>
                      <td className="px-6 py-4 text-sm text-slate-900 dark:text-slate-100">{sale.product || "-"}</td>
                      <td className="px-6 py-4 text-sm text-slate-500 dark:text-slate-400">{sale.category || "-"}</td>
                      <td className="px-6 py-4 text-sm text-slate-900 dark:text-slate-100">{sale.quantity || 0}</td>
                      <td className="px-6 py-4 text-sm font-bold text-slate-900 dark:text-white">{formatMoney(sale.revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

           {/* Secondary Charts Grid */}
           <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Peak Sales by Day */}
            {analytics.peakPeriods && (
              <article className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 p-6">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3 mb-6">
                  <div>
                    <h2 className="text-xl font-display font-bold text-slate-900 dark:text-white">peak sales by day</h2>
                    <p className="text-sm text-slate-500 dark:text-slate-400">orders distributed across days of week.</p>
                  </div>
                </div>
                <div className="space-y-3">
                  {Object.entries(analytics.peakPeriods.day_of_week).map(([day, stats]) => (
                    <div key={day} className="space-y-2">
                      <div className="flex justify-between items-center text-sm">
                        <strong className="text-slate-900 dark:text-white capitalize">{day}</strong>
                        <span className="text-slate-600 dark:text-slate-300">{stats.orders} orders</span>
                      </div>
                      <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2 overflow-hidden">
                        <div
                          className="h-full bg-brand rounded-full transition-all duration-300"
                          style={{ width: `${Math.min(100, (stats.orders / (analytics.cards.find(c => c.id === 'total_orders')?.value || 1)) * 100)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </article>
            )}

            {/* Customer Loyalty */}
            {analytics.customerPatterns && (
              <article className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 p-6">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3 mb-6">
                  <div>
                    <h2 className="text-xl font-display font-bold text-slate-900 dark:text-white">customer loyalty</h2>
                    <p className="text-sm text-slate-500 dark:text-slate-400">repeat purchase rate and top customers.</p>
                  </div>
                  <span className="text-xs font-bold text-slate-500 dark:text-slate-400">{analytics.customerPatterns.repeat_purchase_rate_percent}% repeat rate</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700">
                    <thead className="bg-slate-50 dark:bg-slate-900/50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">customer</th>
                        <th className="px-4 py-3 text-left text-xs font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">orders</th>
                        <th className="px-4 py-3 text-left text-xs font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">total spent</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                      {analytics.customerPatterns.top_customers.map((c) => (
                        <tr key={c.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors">
                          <td className="px-4 py-3 text-sm text-slate-900 dark:text-slate-100">{c.name}</td>
                          <td className="px-4 py-3 text-sm text-slate-900 dark:text-slate-100">{c.orders}</td>
                          <td className="px-4 py-3 text-sm font-bold text-slate-900 dark:text-white">{formatMoney(c.total_spent)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </article>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}
