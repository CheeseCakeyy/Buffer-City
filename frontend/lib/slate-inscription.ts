// Keep complete Unicode names, wrapping only when they need more than one line.
// Text is laid out in the stone's own coordinate system, not the screen glyph grid.
export function inscriptionLines(name: string): string[] {
  const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
  const letters = Array.from(segmenter.segment(name), item => item.segment);
  const lines: string[] = [];
  while (letters.length) {
    if (letters.length <= 14) { lines.push(letters.join('')); break; }
    let split = Math.ceil(letters.length / 2);
    for (let i = 14; i >= 5; i--) if (letters[i] === ' ') { split = i; break; }
    lines.push(letters.splice(0, split).join(''));
    if (letters[0] === ' ') letters.shift();
  }
  return lines;
}
