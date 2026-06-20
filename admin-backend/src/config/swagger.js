
import swaggerAutogen from 'swagger-autogen';

const PORT = process.env.PORT || 5320;
const BASE_URL = process.env.BASE_URL || 'https://ticket.sanskargroup.in';
const API_BASE = `${BASE_URL}:${PORT}/api`;

const swaggerAutogenInstance = swaggerAutogen({
  openapi: '3.0.0'
});

const doc = {
  info: {
    title: 'Sea-Sanskar Api',
    description: 'District level event organizer & ticket booking APIs',
  },
  servers: [
    {
      url: `${API_BASE}/auth`,
      description: 'Auth APIs'
    },
    {
      url: `${API_BASE}/event`,
      description: 'Event APIs'
    },
    {
      url: `${API_BASE}/payment`,
      description: 'Payment APIs'
    },
    {
      url: `${API_BASE}/home`,
      description: 'Home APIs'
    }, 
    {
      url: `${API_BASE}/order`,
      description: 'Order APIs'
    },
    {
      url: `${API_BASE}/qrscan`,
      description: 'qrscan APIs'
    },
     {
      url: `${API_BASE}/ticket`,
      description: 'Ticket APIs'
    }
  ],
  components: {
    securitySchemes: {
      apiKeyAuth: {
        type: 'apiKey',
        in: 'header',
        name: 'x-access-token',
        description: 'Access token'
      },
    }
  },

  // 🔐 GLOBAL HEADER (sab APIs me apply hoga)
  security: [
    { apiKeyAuth: [] }
  ],
};


const outputFile = './swagger-output.json';
const endpointsFiles = [
  '../routes/auth.routes.js',
  '../routes/event.routes.js',
  '../routes/payment.routes.js',
   '../routes/home.routes.js',
  '../routes/order.routes.js',
  '../routes/qrscan.routes.js',
  '../routes/ticket.routes.js'
];

swaggerAutogenInstance(outputFile, endpointsFiles, doc);
