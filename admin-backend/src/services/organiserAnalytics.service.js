import pool from "../config/database.js";
import { getScanAnalyticsService } from "./adminTicket.service.js";

/**
 * Per-event analytics for the organiser dashboard: ticket sales + revenue merged
 * with scan/attendance figures. Reuses the admin scan analytics
 * (getScanAnalyticsService → booked/used/available per type) and adds a sales
 * query over PAID orders. Ownership is enforced by route middleware.
 */
export const getEventAnalyticsService = async (eventId) => {
  // Headline sales totals (PAID orders only).
  const [[sales]] = await pool.query(
    `SELECT COALESCE(SUM(o.total_price), 0) AS gross_revenue,
            COUNT(DISTINCT o.id)            AS paid_orders,
            COALESCE(SUM(oi.quantity), 0)   AS tickets_sold
     FROM orders o
     LEFT JOIN order_items oi ON oi.order_id = o.id
     WHERE o.event_id = ? AND o.status = 'PAID'`,
    [eventId]
  );

  // Distinct attendees (non-cancelled tickets).
  const [[att]] = await pool.query(
    `SELECT COUNT(DISTINCT t.user_id) AS total_attendees
     FROM tickets t WHERE t.event_id = ? AND t.status <> 'CANCELLED'`,
    [eventId]
  );

  // Sales per ticket type (PAID).
  const [salesByType] = await pool.query(
    `SELECT tt.id AS ticket_type_id, tt.name AS ticket_type_name, tt.price, tt.total_quantity,
            COALESCE(SUM(oi.quantity), 0)   AS sold,
            COALESCE(SUM(oi.line_total), 0) AS revenue
     FROM ticket_types tt
     LEFT JOIN order_items oi ON oi.ticket_type_id = tt.id
     LEFT JOIN orders o ON o.id = oi.order_id AND o.status = 'PAID'
     WHERE tt.event_id = ? AND tt.status = 1
     GROUP BY tt.id, tt.name, tt.price, tt.total_quantity
     ORDER BY tt.id ASC`,
    [eventId]
  );

  // Scan/attendance per type (booked / used / available) + total scans.
  const scan = await getScanAnalyticsService(eventId);
  const scanByType = new Map(scan.byType.map((r) => [Number(r.ticket_type_id), r]));

  const byType = salesByType.map((s) => {
    const sc = scanByType.get(Number(s.ticket_type_id)) || {};
    return {
      ticket_type_id: s.ticket_type_id,
      name: s.ticket_type_name,
      price: Number(s.price),
      total_quantity: s.total_quantity,
      sold: Number(s.sold),
      revenue: Number(s.revenue),
      booked: Number(sc.booked || 0),
      checked_in: Number(sc.used || 0),
      remaining: Number(sc.available || 0)
    };
  });

  return {
    summary: {
      gross_revenue: Number(sales.gross_revenue),
      tickets_sold: Number(sales.tickets_sold),
      paid_orders: Number(sales.paid_orders),
      total_attendees: Number(att.total_attendees),
      total_scans: Number(scan.totalScans)
    },
    byType
  };
};
