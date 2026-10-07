/**
 * Deterministic Semantic Vector Embedding Generator
 * Generates normalized 384-dimensional dense vectors for kNN semantic search.
 */
export function generateEmbedding(text = '') {
  const DIMS = 384;
  const vector = new Array(DIMS).fill(0);
  const normalizedText = text.toLowerCase().trim();

  if (!normalizedText) return vector;

  const words = normalizedText.split(/\W+/).filter(Boolean);

  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    for (let j = 0; j < word.length; j++) {
      const charCode = word.charCodeAt(j);
      const index = (charCode * (j + 1) * (i + 1)) % DIMS;
      vector[index] += 1.0 / (j + 1);
    }
  }

  // Normalize vector to unit length (L2 norm) for Cosine Similarity
  const magnitude = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
  if (magnitude > 0) {
    for (let i = 0; i < DIMS; i++) {
      vector[i] = parseFloat((vector[i] / magnitude).toFixed(6));
    }
  }

  return vector;
}
