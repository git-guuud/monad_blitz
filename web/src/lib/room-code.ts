/// The design puts a four-digit room code on the screen, and players type it to
/// join. On chain a round is just a quiz id, so the code is a reversible
/// scramble of it — not a lookup table, so nothing has to be stored anywhere and
/// any client can derive one from the other.
///
/// A plain `1000 + quizId` would be guessable, and consecutive rounds would sit
/// next to each other; multiplying by an odd constant modulo 9000 spreads them
/// across the space while staying a bijection.
const SPREAD = 3719; // coprime with 9000, so the map is one-to-one
const INVERSE = 8879; // SPREAD * INVERSE ≡ 1 (mod 9000)
const SPAN = 9000;

export function roomCodeFor(quizId: number): string {
  return String(1000 + ((quizId % SPAN) * SPREAD) % SPAN);
}

export function quizIdFromCode(code: string): number | null {
  if (!/^\d{4}$/.test(code)) return null;
  const n = Number(code) - 1000;
  if (n < 0 || n >= SPAN) return null;
  return (n * INVERSE) % SPAN;
}
