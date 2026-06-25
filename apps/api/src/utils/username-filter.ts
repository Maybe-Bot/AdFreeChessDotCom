// Slurs only — profanity/cuss words are intentionally not blocked.
// Substring match so "xnwordx" is also caught.
const SLURS = [
  'nigger', 'nigga', 'chink', 'spic', 'spick', 'kike', 'gook', 'wetback',
  'raghead', 'towelhead', 'zipperhead', 'cracker', 'redneck',
  'faggot', 'fagot', 'dyke', 'tranny',
  'retard', 'retarded',
  'cunt',
];

export function containsSlur(username: string): boolean {
  const lower = username.toLowerCase();
  return SLURS.some(slur => lower.includes(slur));
}
