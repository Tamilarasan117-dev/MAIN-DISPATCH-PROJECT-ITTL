import { supabase } from './supabase';

/**
 * Calculates Levenshtein distance between two strings
 * Useful for catching typos like "Transformer bxo" vs "Transformer box"
 */
export function levenshteinDistance(a, b) {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const matrix = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          Math.min(
            matrix[i][j - 1] + 1, // insertion
            matrix[i - 1][j] + 1  // deletion
          )
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

/**
 * Strict validation rules before learning a new item
 */
export function validateMasterItemName(rawName) {
  if (!rawName || typeof rawName !== 'string') return null;

  // 1. Sanitize security risk characters
  let cleanName = rawName.replace(/[<>]/g, '').trim();

  // 2. Length check (must be at least 5 chars to avoid partials like 'bo')
  if (cleanName.length < 5) return null;

  // 3. Reject purely numeric values
  if (/^\d+$/.test(cleanName)) return null;

  // 4. Reject common garbage strings
  if (/^(test|abc|xxx|qwerty|asdf)/i.test(cleanName)) return null;

  // 5. Reject repeated single characters (e.g. "aaaaaa", "bbbbb")
  if (/^(.)\1+$/.test(cleanName)) return null;

  return cleanName;
}

/**
 * Process a batch of items saved from the UI.
 * Extracts descriptions, validates them, and calls the RPC for bulk upsert.
 */
export async function processLearnedItems(itemsArray) {
  if (!itemsArray || !Array.isArray(itemsArray)) return;

  const validNamesToLearn = new Set();

  for (const item of itemsArray) {
    const validName = validateMasterItemName(item.description);
    if (validName) {
      validNamesToLearn.add(validName);
    }
  }

  const namesArray = Array.from(validNamesToLearn);
  
  if (namesArray.length === 0) return;

  try {
    // Fetch existing items to avoid duplicates (case-insensitive)
    const { data: existing } = await supabase
      .from('master_list')
      .select('value')
      .eq('category_key', 'Packing list items');

    const existingLower = new Set((existing || []).map(e => e.value.toLowerCase()));

    const newItems = namesArray
      .filter(name => !existingLower.has(name.toLowerCase()))
      .map(name => ({ category_key: 'Packing list items', value: name }));

    if (newItems.length === 0) return;

    const { error } = await supabase
      .from('master_list')
      .insert(newItems);

    if (error) {
      console.error('Failed to auto-learn packing items:', error);
    }
  } catch (err) {
    console.error('Error during auto-learn execution:', err);
  }
}
