// Bertha puts finished writing (texts, emails, posts, cover letters) between two lines of "---".
export interface MessageParts { before: string; draft: string | null; after: string }

const DRAFT = /(^|\n)[ \t]*-{3,}[ \t]*\n([\s\S]*?)\n[ \t]*-{3,}[ \t]*(?=\n|$)/;

export function splitDraft(content: string): MessageParts {
  const match = DRAFT.exec(content);
  if (!match || !match[2].trim()) return { before: content, draft: null, after: "" };
  return {
    before: content.slice(0, match.index).trim(),
    draft: match[2].trim(),
    after: content.slice(match.index + match[0].length).trim(),
  };
}

// What to copy: the draft alone when there is one, otherwise the whole reply.
export const copyText = (content: string) => splitDraft(content).draft ?? content;

// What to say out loud: never read a whole email or cover letter aloud.
export function spokenText(content: string) {
  const { before, draft, after } = splitDraft(content);
  if (!draft) return content.replace(/^[ \t]*-{3,}[ \t]*$/gm, "");
  return [before, "I've written it out below so you can copy it.", after].filter(Boolean).join(" ");
}

export async function copyToClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Older browsers / non-secure contexts
    const area = document.createElement("textarea");
    area.value = text;
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    area.remove();
    return ok;
  }
}
