/**
 * Transcribe an audio buffer using OpenAI Whisper API.
 * Returns null if no API key is available or transcription fails.
 * The OPENAI_API_KEY env var is used by default; pass apiKey to override.
 */
export async function transcribeAudio(
  audioBuffer: Buffer,
  filename: string,
  apiKey?: string,
): Promise<string | null> {
  const key = apiKey ?? process.env.OPENAI_API_KEY;
  if (!key) return null;

  try {
    const form = new FormData();
    // Node 18+ has native FormData + Blob
    const blob = new Blob([audioBuffer]);
    form.append('file', blob, filename);
    form.append('model', 'whisper-1');

    const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}` },
      body: form,
    });

    if (!res.ok) return null;
    const data = await res.json() as { text?: string };
    return data.text?.trim() || null;
  } catch {
    return null;
  }
}
