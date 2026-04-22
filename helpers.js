// Feature: video-feedback-optimization
// Shared helper functions extracted for testability.

/**
 * Splits `text` into an array of strings each ≤ maxLen characters.
 * Splitting happens only at \n boundaries.
 * A single line longer than maxLen is emitted as its own chunk.
 *
 * @param {string} text
 * @param {number} maxLen  default 4000
 * @returns {string[]}
 */
export function chunkMessage(text, maxLen = 4000) {
  if (text.length <= maxLen) return [text];

  const lines = text.split("\n");
  const chunks = [];
  let current = "";

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Reconstruct the segment including the newline separator (except for the last line)
    const segment = i < lines.length - 1 ? line + "\n" : line;

    if (current.length + segment.length <= maxLen) {
      current += segment;
    } else {
      // Flush current chunk if non-empty
      if (current.length > 0) {
        chunks.push(current);
        current = "";
      }
      // If the segment itself exceeds maxLen, emit it as its own chunk
      if (segment.length > maxLen) {
        chunks.push(segment);
      } else {
        current = segment;
      }
    }
  }

  if (current.length > 0) {
    chunks.push(current);
  }

  return chunks;
}

/**
 * Sends each chunk as a separate WhatsApp message via safeSend.
 *
 * @param {object}   sock
 * @param {string}   jid
 * @param {string[]} chunks
 * @param {string[]} [mentions]
 * @param {Function} safeSendFn  — injected safeSend (allows testing without a real socket)
 */
export async function sendChunks(sock, jid, chunks, mentions = [], safeSendFn) {
  for (const chunk of chunks) {
    await safeSendFn(sock, jid, { text: chunk, mentions });
  }
}
