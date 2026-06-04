import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Plesk Application Root is the project root, so this is the only .env file.
// Values set in Plesk's Node.js Environment Variables are preserved and take priority.
dotenv.config({ path: path.resolve(__dirname, '../.env'), override: false });
