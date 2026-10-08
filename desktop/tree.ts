import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Topic, Document, SourceRef } from './types.js';
const ref = z.object({ documentId: z.string().min(1), from: z.number().int().positive(), to: z.number().int().positive() });
export const topicSchema = z.object({
  id: z.string().min(1).max(100), parentId: z.string().nullable(), title: z.string().trim().min(1).max(250), description: z.string().max(12000),
  origin: z.enum(['program','slides','proposal']), parts: z.array(z.object({id:z.string().min(1),label:z.string().trim().min(1).max(1000),checked:z.boolean()})).max(100),
  sources: z.array(ref).max(100)
});
export function checkSources(refs: SourceRef[], documents: Document[]) {
  for (const r of refs) {
    const d = documents.find(d => d.id === r.documentId);
    if (!d || r.from > r.to || r.to > d.pages) throw new Error('Riferimento a un materiale o a una pagina non valido.');
  }
}
export function validateTree(raw: unknown, documents: Document[]): Topic[] {
  const nodes = z.array(topicSchema).max(500).parse(raw);
  const ids = new Set(nodes.map(n => n.id));
  if (ids.size !== nodes.length) throw new Error('Argomenti con identificativi duplicati.');
  for (const node of nodes) {
    checkSources(node.sources, documents);
    if (new Set(node.parts.map(p => p.id)).size !== node.parts.length) throw new Error('Parti duplicate.');
    let parent = node.parentId; const seen = new Set([node.id]); let depth = 0;
    while (parent) {
      if (!ids.has(parent) || seen.has(parent) || ++depth > 8) throw new Error('Gerarchia non valida: nodo mancante, ciclo o profondità eccessiva.');
      seen.add(parent); parent = nodes.find(n => n.id === parent)!.parentId;
    }
  }
  return nodes;
}
export function prepareGeneratedTree(raw: unknown, current: Topic[], documents: Document[]) {
  const parsed = z.array(z.object({ key: z.string().min(1), parentKey: z.string().nullable(), existingId: z.string().nullable(),
    title: z.string(), description: z.string(), origin: z.enum(['program','slides','proposal']), parts: z.array(z.string()).min(1), sources: z.array(ref) })).min(1).max(300).parse(raw);
  if (new Set(parsed.map(n=>n.key)).size !== parsed.length) throw new Error('Chiavi duplicate nella proposta.');
  const used = new Set<string>();
  const mapping = new Map(parsed.map(n => {
    const old = current.find(c => c.id === n.existingId && c.title.trim().toLowerCase() === n.title.trim().toLowerCase());
    const id = old && !used.has(old.id) ? old.id : randomUUID(); used.add(id); return [n.key, id];
  }));
  return validateTree(parsed.map(n => {
    const id = mapping.get(n.key)!; const old = current.find(c=>c.id===id);
    return { id, parentId: n.parentKey ? mapping.get(n.parentKey) ?? 'missing-parent' : null, title: n.title, description:n.description, origin:n.origin,
      parts:n.parts.map(label => { const prior=old?.parts.find(p=>p.label.trim().toLowerCase()===label.trim().toLowerCase()); return prior ? {...prior,label} : {id:randomUUID(),label,checked:false}; }), sources:n.sources };
  }), documents);
}
export function descendants(tree: Topic[], id: string) {
  const ids = new Set([id]);
  for (let pass=0;pass<tree.length;pass++) for (const n of tree) if (n.parentId && ids.has(n.parentId)) ids.add(n.id);
  return tree.filter(n=>ids.has(n.id));
}
