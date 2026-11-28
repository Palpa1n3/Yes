/** The central engine for each message: one place that works out how to answer it, from
 *  everything Alton knows. It decides which model answers (shared/model-pick.ts), adds a
 *  check-first note when the answer depends on facts that change (shared/confidence.ts), and
 *  brings in what Alton knows about anyone or anything the message mentions (shared/knowledge.ts).
 *  The "right now" picture and who's who come with every message too (shared/context.ts).
 *  Pure; tested in tests/brain.test.ts. */
import { checkFirstNote } from './confidence';
import { factsAbout, findMentions, type KnowledgeGraph } from './knowledge';
import { pickModel } from './model-pick';
import type { AiModel } from './types';

export interface MessageBrief {
  model: AiModel;
  /** Why that model (for the logs). */
  modelWhy: string;
  /** Extra notes for answering this one message. */
  notes: string[];
}

export function messageBrief(o: {
  text: string;
  attachments?: Array<{ kind: string }>;
  model: { chosen: AiModel; auto: boolean; top: AiModel; saver: boolean };
  graph?: KnowledgeGraph | null;
}): MessageBrief {
  const pick = pickModel({ text: o.text, attachments: o.attachments ?? [], ...o.model });
  const notes: string[] = [];
  const check = checkFirstNote(o.text);
  if (check) notes.push(check);
  if (o.graph) {
    const g = o.graph;
    const facts = findMentions(g, o.text)
      .slice(0, 3)
      .flatMap((e) => factsAbout(g, e.id).slice(0, 4));
    if (facts.length)
      notes.push(`What you know about who/what this message mentions: ${facts.join('; ')}.`);
  }
  return { model: pick.model, modelWhy: pick.why, notes };
}
