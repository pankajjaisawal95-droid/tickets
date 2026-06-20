import { getHomePage} from "../controllers/home.controller.js";
// import { accessTokenHeader } from "../constent/constent.js";
// import { requireHeaders } from "../middlewares/requireHeaders.js";
// import { authenticate } from "../middlewares/auth.middleware.js";
// import { validate } from "../validations/validateArray.middleware.js";
import { Router } from 'express';
const router = Router();
router.get('/home-data',  getHomePage);//requireHeaders([accessTokenHeader]), authenticate, validate(orderValidation),

export default router;