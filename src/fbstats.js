// Registro das ações no Facebook (assistir/curtir/comentar) + limites diários por perfil.
import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR } from './config.js';

const FILE = path.join(DATA_DIR, 'fb-actions.jsonl');
const read = () => { try { return fs.readFileSync(FILE, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)); } catch { return []; } };
const actions = read();

/** tipo: watch | like | comment | like_falhou | comment_falhou */
export function logAction(a) {
  const rec = { ts: Date.now(), ...a };
  actions.push(rec);
  fs.appendFile(FILE, JSON.stringify(rec) + '\n', () => {});
}
export const allActions = () => actions;
export const countSince = (profileId, type, sinceMs) => actions.filter((a) => a.profileId === profileId && a.type === type && a.ts >= sinceMs).length;
export const usedComments = (profileId, sinceMs) => new Set(actions.filter((a) => a.profileId === profileId && (a.type === 'comment' || a.type === 'comment_falhou') && a.ts >= sinceMs).map((a) => a.text));
