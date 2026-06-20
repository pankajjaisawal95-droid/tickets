
export const validateFreeTicket = (req, res, next) => {
  let { ticket_type_id, event_id, available_ticket } = req.body;

  if (!ticket_type_id || !event_id) {
    return res.status(400).json({
      success: false,
      message: "ticket_type_id and event_id are required"
    });
  }

  // 🔥 If blank → default 1
  if (
    available_ticket === undefined ||
    available_ticket === null ||
    available_ticket === ""
  ) {
    req.body.available_ticket = 1;
  } else if (isNaN(available_ticket) || Number(available_ticket) <= 0) {
    return res.status(400).json({
      success: false,
      message: "available_ticket must be a positive number"
    });
  } else {
    req.body.available_ticket = Number(available_ticket);
  }

  next();
};