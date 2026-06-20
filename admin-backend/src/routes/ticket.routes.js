  import { Router } from 'express';
 import { getMyTickets , cancelTicket , updateTicketStatus,freeTicket  } from '../controllers/ticket.controller.js' ;
 import { accessTokenHeader  } from '../constent/constent.js' ;
 import { requireHeaders  } from '../middlewares/requireHeaders.js' ;
 import { authenticate  } from '../middlewares/auth.middleware.js' ;
  import { validateFreeTicket  } from '../middlewares/freeTicket.validation.js';
// import { validate  } from '../validations/validate.middleware.js' ;
// import { ticketValidation  } from '../validations/ticket.validation.js' ;
const router = Router();
router.get('/my-ticket', requireHeaders([accessTokenHeader]), authenticate,  getMyTickets) ;
router.post('/cancle-ticket', requireHeaders([accessTokenHeader]), authenticate, cancelTicket) ;
router.post('/update-status', requireHeaders([accessTokenHeader]), authenticate,updateTicketStatus)
router.post('/free-ticket',requireHeaders([accessTokenHeader]), authenticate, validateFreeTicket, freeTicket);
export default router;