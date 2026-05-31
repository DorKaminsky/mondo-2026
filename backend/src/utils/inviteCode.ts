import { query } from '../db/pool';

// Unambiguous alphabet — no 0/O, 1/I, etc.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 6;

function randomCode(): string {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return code;
}

/**
 * Generate a unique invite code that doesn't collide with any existing league.
 * Retries up to 10 times before giving up (collision odds are vanishingly small).
 */
export async function generateInviteCode(): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = randomCode();
    const { rows } = await query('SELECT id FROM leagues WHERE invite_code = $1', [code]);
    if (rows.length === 0) return code;
  }
  throw new Error('Could not generate unique invite code after 10 attempts');
}
