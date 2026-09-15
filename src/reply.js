// reply.js — the last gate before anything leaves the machine, and the first
// gate after anything comes back. Both are pure, so both are tested.

/**
 * Remove every key that could carry what the person typed.
 * The harvester already refuses to read values; this is belt and braces,
 * because it sits on the wire and the harvester does not.
 */
export function stripValues(field) {
  const { value, values, textContent, defaultValue, ...safe } = field || {};
  return safe;
}

/**
 * A model that returns prose where JSON was asked for is a normal Tuesday.
 * Degrade to something the panel can still render rather than throwing.
 */
export function parseAgentReply(raw, fields = []) {
  const fenced = String(raw ?? '').match(/```(?:json)?\s*([\s\S]*?)```/);
  const text = (fenced ? fenced[1] : String(raw ?? '')).trim();
  try {
    const parsed = JSON.parse(text);
    const known = new Set(fields.map((f) => f.ref));
    return {
      summary: typeof parsed.summary === 'string' ? parsed.summary : '',
      // Drop explanations for fields that do not exist. A hallucinated ref
      // would otherwise render as a card pointing at nothing on the page.
      fields: Array.isArray(parsed.fields) ? parsed.fields.filter((f) => known.has(f?.ref)) : [],
    };
  } catch {
    return { summary: text.slice(0, 300), fields: [], degraded: true };
  }
}
