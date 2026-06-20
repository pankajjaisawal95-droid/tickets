import pool from "../config/database.js";

/**
 * Aggregated KPIs for the admin dashboard. All money is DECIMAL rupees.
 * Revenue counts only PAID orders; refunds count COMPLETED refunds.
 */
export const getDashboardService = async () => {
  /* headline counters */
  const [[counts]] = await pool.query(
    `SELECT
       (SELECT COUNT(*) FROM events)                              AS total_events,
       (SELECT COUNT(*) FROM events WHERE is_active = 1)          AS active_events,
       (SELECT COUNT(*) FROM events WHERE approval_status = 'PENDING') AS pending_events,
       (SELECT COUNT(*) FROM orders)                             AS total_orders,
       (SELECT COUNT(*) FROM orders WHERE status = 'PAID')       AS paid_orders,
       (SELECT COUNT(*) FROM users)                             AS total_users,
       (SELECT COUNT(*) FROM tickets WHERE status IN ('BOOKED','USED')) AS active_tickets`
  );

  const [[revenue]] = await pool.query(
    `SELECT COALESCE(SUM(total_price), 0) AS gross_revenue
     FROM orders WHERE status = 'PAID'`
  );

  // Ticket counts live in order_items (orders.quantity is often 0).
  const [[ticketsSold]] = await pool.query(
    `SELECT COALESCE(SUM(oi.quantity), 0) AS tickets_sold
     FROM order_items oi
     JOIN orders o ON o.id = oi.order_id
     WHERE o.status = 'PAID'`
  );

  const [[refunds]] = await pool.query(
    `SELECT
       COALESCE(SUM(refund_amount), 0) AS refunds_total,
       COUNT(*)                        AS refunds_count
     FROM refunds WHERE status = 'COMPLETED'`
  );

  const [[today]] = await pool.query(
    `SELECT
       COALESCE(SUM(total_price), 0) AS revenue,
       COUNT(*)                      AS orders
     FROM orders WHERE status = 'PAID' AND DATE(created_at) = CURDATE()`
  );

  /* last-7-days revenue trend (one row per day, PAID only) */
  const [trend] = await pool.query(
    `SELECT DATE(created_at) AS day,
            COALESCE(SUM(total_price), 0) AS revenue,
            COUNT(*) AS orders
     FROM orders
     WHERE status = 'PAID' AND created_at >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)
     GROUP BY DATE(created_at)
     ORDER BY day ASC`
  );

  /* top events by paid revenue */
  const [topEvents] = await pool.query(
    `SELECT o.event_id, e.title,
            COALESCE(SUM(o.total_price), 0) AS revenue,
            COALESCE((SELECT SUM(oi.quantity)
                      FROM order_items oi JOIN orders o2 ON o2.id = oi.order_id
                      WHERE o2.event_id = o.event_id AND o2.status = 'PAID'), 0) AS tickets,
            COUNT(*)                        AS orders
     FROM orders o
     LEFT JOIN events e ON e.id = o.event_id
     WHERE o.status = 'PAID'
     GROUP BY o.event_id, e.title
     ORDER BY revenue DESC
     LIMIT 5`
  );

  return {
    counts,
    revenue: {
      gross: Number(revenue.gross_revenue),
      tickets_sold: Number(ticketsSold.tickets_sold),
      net: Number(revenue.gross_revenue) - Number(refunds.refunds_total)
    },
    refunds: {
      total: Number(refunds.refunds_total),
      count: Number(refunds.refunds_count)
    },
    today: {
      revenue: Number(today.revenue),
      orders: Number(today.orders)
    },
    trend,
    topEvents
  };
};
