import './preview-diff-runtime.js';
import { sanitizeVisualSelection, visualSelectionSummary } from '../core/visual-editor-selection.js';
const $=s=>document.querySelector(s);let selection=null;
function send(message){return new Promise(resolve=>chrome.runtime.sendMessage(message,r=>resolve(r||{})));}
async function activeLovableTab(){const tabs=await chrome.tabs.query({active:true,currentWindow:true});const tab=tabs[0];return tab&&/^https:\/\/([^.]+\.)?lovable\.dev\//.test(tab.url||'')?tab:null;}
function render(){const card=$('#visualSelectionCard');if(!card)return;card.hidden=!selection;if(!selection)return;$('#visualSelectionName').textContent=selection.selector||selection.tagName||'Elemento';$('#visualSelectionText').textContent=selection.text?selection.text.slice(0,120):'Elemento sem texto visível';}
async function load(){const r=await send({action:'SLV2_GET_VISUAL_SELECTION'});selection=r.selection?sanitizeVisualSelection(r.selection):null;render();}
$('#visualPickButton')?.addEventListener('click',async()=>{const tab=await activeLovableTab();if(!tab){$('#taskFeedback').textContent='Abra o projeto da Lovable na aba ativa para selecionar um elemento.';return;}chrome.tabs.sendMessage(tab.id,{action:'SLV2_START_VISUAL_PICKER'},()=>{if(chrome.runtime.lastError){$('#taskFeedback').textContent='Recarregue a página da Lovable uma vez para ativar o editor visual.';return;}$('#taskFeedback').textContent='Clique no elemento da página que deseja alterar. Pressione Esc para cancelar.';window.close();});});
$('#visualClearButton')?.addEventListener('click',async()=>{selection=null;await send({action:'SLV2_CLEAR_VISUAL_SELECTION'});render();});
chrome.runtime.onMessage.addListener(msg=>{if(msg?.action==='SLV2_VISUAL_SELECTION_UPDATED'){selection=sanitizeVisualSelection(msg.selection||{});render();}});
window.addEventListener('superlovable:before-plan',e=>{if(!selection)return;const input=$('#taskInput');const context=visualSelectionSummary(selection);if(input&&context&&!input.value.includes('Elemento selecionado:'))input.value=`${input.value.trim()}\n\n${context}`.trim();if(e.detail)e.detail.visualSelection=selection;});
load();
