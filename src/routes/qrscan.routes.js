import { Router } from 'express';
import { accessTokenHeader } from '../constent/constent.js';
import { requireHeaders } from "../middlewares/requireHeaders.js"
import { validate } from "../validations/validate.middleware.js";
import { qrCodeValidation } from "../validations/auth.validation.js";
import { qrScan ,scannedTicket} from "../controllers/qrscan.controller.js"
import { authenticate } from "../middlewares/auth.middleware.js";
const router = Router();
router.post('/qrscan-validator', requireHeaders([accessTokenHeader]), validate(qrCodeValidation), qrScan);
router.post('/ticket-scan', requireHeaders([accessTokenHeader]), validate( {
    required: [
        "eventId",
        "qrCode"
    ]
}),authenticate, scannedTicket);



export default router;