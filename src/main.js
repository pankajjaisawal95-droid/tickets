import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
console.log('Loading environment variables from:', resolve(__dirname, '../.env'));  
dotenv.config({ path: resolve(__dirname, '../.env') });

import('./server.js');