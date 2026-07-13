import { extractTextFromImage } from 'expo-text-extractor';

export async function imageContainsContact(uri: string): Promise<boolean> {
  try {
    const blocks = await extractTextFromImage(uri);
    const raw = blocks.join(' ');
    const stripped = raw.replace(/[\s\-().+]/g, '');
    const hasPhone = /(\+?234|0)[7-9]\d{8}|\d{7,}/.test(stripped);
    const hasHandle = /@\w{2,}/.test(raw);
    return hasPhone || hasHandle;
  } catch {
    return false;
  }
}
