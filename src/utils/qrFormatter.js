

export const formatQrDetail = (qrCode, rows) => {
  if (!rows.length) return [];

  const eventData = {
    eventId: rows[0].eventId,
    banner_url: null,
    description: null,
    venue: null,
    start_datetime: null,
    end_datetime: null,
    qrCode: qrCode,
    ticketDetail: []
  };

  rows.forEach(row => {
    eventData.ticketDetail.push({
      ticketId: row.ticket_type_id,   // ticket type id
      name: `Type ${row.ticket_type_id}`,
      image: null,
      available_ticket: row.available_ticket,   // ✅ correct field
      used_ticket: row.used_ticket              // ✅ correct field
    });
  });

  return [eventData];
};
export const formatMyTickets = (rows) => {
  const ticketsMap = {};

  rows.forEach((row) => {

    if (!ticketsMap[row.ticket_id]) {
      ticketsMap[row.ticket_id] = {
        ticket_id: row.ticket_id,
        order_id: row.order_id,
        event_name: row.event_name,
        start_datetime: row.start_datetime,
        end_datetime: row.end_datetime,
        venue: row.venue,
        image: row.image,
        qr_hash: row.qr_hash,
        status: row.status,
        qr_code : row.qr_code,
        order_status: row.order_status,
        // refundable only when paid through an order (used by the confirm modal)
        refund_amount: row.order_status === 'PAID' ? Number(row.order_total || 0) : 0,
        // actual refund (for cancelled tickets)
        refund_status: row.refund_status || null,
        refunded_amount: row.refunded_amount != null ? Number(row.refunded_amount) : null,
        // 🔥 total counts
        available_ticket: 0,
        used_ticket: 0,

        ticketDetail: []
      };
    }

    /* ➕ Add ticket type */
    ticketsMap[row.ticket_id].ticketDetail.push({
      ticketTypeId: row.ticket_type_id,
      name: row.ticket_type_name,
      image: row.ticket_type_image,
      price: row.ticket_type_price,
      available_ticket: row.available_ticket,
      used_ticket: row.used_ticket,
      seating_mode: row.seating_mode,
      seats: row.seats || null
    });

    /* ➕ Calculate totals */
    ticketsMap[row.ticket_id].available_ticket += Number(row.available_ticket);
    ticketsMap[row.ticket_id].used_ticket += Number(row.used_ticket);

  });

  /* 🔒 Decide cancellability (mirrors backend cancel rules) */
  const cutoffMs = Number(process.env.REFUND_CUTOFF_HOURS || 0) * 3600 * 1000;
  const now = Date.now();

  return Object.values(ticketsMap).map((t) => {
    let cancellable = true;
    let reason = null;

    if (t.status !== "BOOKED") {
      cancellable = false;
      reason = "Ticket is not active";
    } else if (t.used_ticket > 0) {
      cancellable = false;
      reason = "Already checked in — cannot cancel";
    } else if (t.start_datetime && now > new Date(t.start_datetime).getTime() - cutoffMs) {
      cancellable = false;
      reason = "Cancellation window has closed";
    }

    return { ...t, cancellable, non_cancellable_reason: reason };
  });
};
