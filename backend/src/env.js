import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootEnv = path.resolve(__dirname, '../../.env');
const backendEnv = path.resolve(__dirname, '../.env');

// Load root .env first. Keep backend/.env as an optional override for advanced setups.
dotenv.config({ path: rootEnv });
dotenv.config({ path: backendEnv, override: true });
