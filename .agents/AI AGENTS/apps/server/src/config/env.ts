import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const currentFile = fileURLToPath(import.meta.url);
const currentDir = path.dirname(currentFile);
const repoRoot = path.resolve(currentDir, '../../../..');
const rootEnvPath = path.resolve(repoRoot, '.env');
const serverEnvPath = path.resolve(repoRoot, 'apps/server/.env');

for (const candidate of [rootEnvPath, serverEnvPath]) {
  dotenv.config({ path: candidate, override: false });
}

export const env = {
  openRouterApiKey: (process.env.OPENROUTER_API_KEY ?? '').trim(),
  openRouterModel: (process.env.OPENROUTER_MODEL ?? 'nex-agi/nex-n2.5-pro:free').trim(),
  port: Number(process.env.PORT ?? 4000),
  localAgentUrl: process.env.LOCAL_AGENT_URL ?? 'http://localhost:3001',
  localAgentToken: process.env.LOCAL_AGENT_TOKEN ?? ''
};
