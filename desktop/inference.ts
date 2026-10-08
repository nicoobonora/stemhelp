import { tutorInstructions, buildInput, type Message } from './context.js';
import type { Course } from './store.js';

export async function consumeEvents(body: ReadableStream<Uint8Array>, onDelta: (text: string) => void): Promise<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '', text = '', completed = false;
  function event(raw: string) {
    const data = raw.split('\n').filter(l => l.startsWith('data:')).map(l => l.slice(5).trimStart()).join('\n');
    if (!data || data === '[DONE]') return;
    const item = JSON.parse(data);
    if (item.type === 'response.output_text.delta') { text += item.delta; onDelta(item.delta); }
    if (item.type === 'response.completed') {
      if (item.response?.status && item.response.status !== 'completed') throw new Error('Risposta non completata.');
      completed = true;
    }
    if (['response.failed', 'response.incomplete', 'error'].includes(item.type)) {
      const code = item.response?.error?.code || item.error?.code || item.code;
      if (['subscription_sharing_usage_limit_exceeded', 'subscription_sharing_usage_unavailable'].includes(code)) {
        throw new Error('Disponibilità del piano esaurita o non disponibile. Controlla i limiti nelle impostazioni ChatGPT.');
      }
      throw new Error('Il servizio non ha completato la risposta. Riprova o controlla il tuo accesso.');
    }
  }
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      buffer = buffer.replace(/\r\n/g, '\n');
      let boundary: number;
      while ((boundary = buffer.indexOf('\n\n')) >= 0) { event(buffer.slice(0, boundary)); buffer = buffer.slice(boundary + 2); }
    }
    buffer += decoder.decode();
    if (buffer.trim()) event(buffer);
    if (!completed || !text.trim()) throw new Error('Risposta interrotta o vuota. Non aggiunta alla conversazione.');
    return text;
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}
export async function ask(token: string, model: string, course: Course, history: Message[], page: string, question: string, onDelta: (text: string) => void, signal: AbortSignal) {
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, instructions: tutorInstructions, input: buildInput(course, history, page, question), store: false, stream: true }), signal
  });
  if (!response.ok || !response.body) throw new Error(response.status === 429 ? 'Limite di utilizzo raggiunto. Controlla la disponibilità del piano.' : `Richiesta AI non riuscita (${response.status}). Verifica accesso e modello.`);
  return consumeEvents(response.body, onDelta);
}

export async function complete(token: string, model: string, instructions: string, input: unknown[], onDelta: (text:string)=>void, signal:AbortSignal):Promise<string> {
  const response = await fetch('https://api.openai.com/v1/responses', {
    method:'POST', headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},
    body:JSON.stringify({model,instructions,input,store:false,stream:true}),signal
  });
  if(!response.ok || !response.body){
    if(response.status===429)throw new Error('Limite del piano raggiunto. Controlla Utilizzo nelle impostazioni.');
    if(response.status===401)throw new Error('Sessione ChatGPT scaduta. Accedi nuovamente dalle impostazioni.');
    if(response.status===403)throw new Error('Modello o utilizzo del piano non autorizzato. Verifica i permessi ChatGPT.');
    throw new Error(`Il servizio AI non ha accettato la richiesta (${response.status}). Prova un altro modello o ripeti l’accesso.`);
  }
  return consumeEvents(response.body,onDelta);
}
