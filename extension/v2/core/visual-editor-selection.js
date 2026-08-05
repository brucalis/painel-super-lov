export const VISUAL_SELECTION_KEY = 'slv2_visual_selection';

export function sanitizeVisualSelection(input = {}) {
  return {
    projectId: input.projectId || null,
    url: String(input.url || '').slice(0, 2000),
    tagName: String(input.tagName || '').toLowerCase().slice(0, 40),
    id: String(input.id || '').slice(0, 160),
    classes: Array.isArray(input.classes) ? input.classes.slice(0, 12).map(String) : [],
    text: String(input.text || '').replace(/\s+/g, ' ').trim().slice(0, 500),
    selector: String(input.selector || '').slice(0, 1000),
    ariaLabel: String(input.ariaLabel || '').slice(0, 240),
    role: String(input.role || '').slice(0, 80),
    rect: input.rect && typeof input.rect === 'object' ? {
      x: Number(input.rect.x) || 0, y: Number(input.rect.y) || 0,
      width: Number(input.rect.width) || 0, height: Number(input.rect.height) || 0
    } : null,
    capturedAt: input.capturedAt || new Date().toISOString()
  };
}

export function visualSelectionSummary(selection) {
  if (!selection?.selector) return '';
  const parts = [`Elemento selecionado: ${selection.selector}`];
  if (selection.text) parts.push(`Texto visível: “${selection.text}”`);
  if (selection.ariaLabel) parts.push(`Rótulo: ${selection.ariaLabel}`);
  parts.push('Aplique a alteração solicitada especificamente a este elemento ou ao componente que o renderiza, preservando o restante da página.');
  return parts.join('\n');
}
