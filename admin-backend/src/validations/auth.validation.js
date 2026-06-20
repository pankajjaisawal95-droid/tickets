export const loginValidation = {
    required: [
        "mobile",
        "otp",
        "deviceName",
        "deviceId"
    ],
    String: ["mobile"],
    minDigits: {
        mobile: 10,
        otp: 4
    }

};

export const otpValidation = {
    required: ["mobile"],
    String: ["mobile"],
    minDigits: {
        mobile: 10
    }
};
export const orderValidation = {
    required: ["eventId", "tickets"],
    integers: ["eventId"],
    array: {
      tickets: {
        // `quantity` is not required: SEATED ticket types send `seatIds` instead
        // and the server derives the quantity from the seat count. The pricing
        // engine is authoritative and rejects a line that has neither.
        required: ["ticketTypeId"],
        integers: ["ticketTypeId", "quantity"]
      }
    }
  };
export const ticketValidation = {
    required: [
        "eventId",
        "ticketType",
        "price",
        "quantity"
    ]
};
export const paymentValidation = {
    required: [
        "orderId",
        "gateway"
    ]
};
export const qrCodeValidation = {
    required: [
        "qrCode"
    ],
    String: ["qrCode"]
};


