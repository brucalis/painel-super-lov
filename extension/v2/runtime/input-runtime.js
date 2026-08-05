import { addAttachmentFiles, attachmentSummary, getStagedAttachments, removeStagedAttachment } from '../core/attachment-store.js';
import { AudioRecorder } from '../core/audio-recorder.js';
import { transcribeAudio } from '../core/transcription-adapter.js';

const $ = (selector, root = document) => root.querySelector(selector);
const recorder = new AudioRecorder();
let timerId = null;

function ensureUi() {
  const composer = $('#composerCard');
  if (!composer || $('#attachmentInput')) return;

  const input = document.createElement('input');
  input.type = 'file';
  input.id = 'attachmentInput';
  input.multiple = true;
  input.hidden = true;
  input.accept = '.png,.jpg,.jpeg,.webp,.gif,.svg,.pdf,.txt,.md,.json,.csv,.html,.css,.js,.jsx,.ts,.tsx,.xml,.yaml,.yml,.log';
  composer.appendChild(input);

  const list = document.createElement('div');
  list.id = 'attachmentList';
  list.className = 'attachment-list';
  composer.insertBefore(list, $('.composer-toolbar', composer));

  const dialog = document.createElement('dialog');
  dialog.id = 'audioDialog';
  dialog.className = 'audio-dialog task-dialog';
  dialog.innerHTML = `
    <div class="audio-panel">
      <div class="dialog-heading"><div><p class="eyebrow">ÁUDIO</p><h2>Grave seu comando</h2></div><button type="button" id="audioClose" class="dialog-close">×</button></div>
      <div class="audio-visual"><span class="audio-dot"></span><strong id="audioState">Pronto para gravar</strong><time id="audioTimer">00:00</time></div>
      <p id="audioFeedback">Na primeira utilização, o Chrome solicitará permissão para acessar o microfone.</p>
      <div class="audio-actions">
        <button type="button" class="primary-action" id="audioStart">Iniciar gravação</button>
        <button type="button" class="quiet-action" id="audioPause" disabled>Pausar</button>
        <button type="button" class="quiet-action" id="audioFinish" disabled>Finalizar e transcrever</button>
        <button type="button" class="quiet-action danger-text" id="audioCancel">Cancelar</button>
      </div>
    </div>`;
  document.body.appendChild(dialog);
}

function formatTime(ms) {
  const total = Math.floor(ms / 1000);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

function startTimer() {
  clearInterval(timerId);
  timerId = setInterval(() => {
    $('#audioTimer').textContent = formatTime(recorder.durationMs());
  }, 250);
}

function stopTimer() {
  clearInterval(timerId);
  timerId = null;
}

async function renderAttachments() {
  const list = $('#attachmentList');
  if (!list) return;
  const attachments = await getStagedAttachments();
  list.innerHTML = attachments.map((item) => `
    <div class="attachment-chip" data-attachment-id="${item.id}">
      <span>${attachmentSummary(item)}</span>
      <button type="button" aria-label="Remover ${item.name}" data-remove-attachment>×</button>
    </div>`).join('');
  list.hidden = attachments.length === 0;
  $('#attachButton')?.setAttribute('title', attachments.length ? `${attachments.length} anexo(s) selecionado(s)` : 'Anexar arquivos');
}

async function handleFiles(files) {
  const feedback = $('#taskFeedback');
  try {
    await addAttachmentFiles(files);
    await renderAttachments();
    feedback.textContent = 'Arquivos anexados. Eles serão vinculados à próxima tarefa.';
  } catch (error) {
    feedback.textContent = error.message;
  }
}

async function startRecording() {
  const feedback = $('#audioFeedback');
  try {
    await recorder.start();
    $('#audioState').textContent = 'Gravando…';
    $('#audioStart').disabled = true;
    $('#audioPause').disabled = false;
    $('#audioFinish').disabled = false;
    feedback.textContent = 'Fale normalmente. Você poderá revisar a transcrição antes de planejar.';
    startTimer();
  } catch (error) {
    feedback.textContent = error?.name === 'NotAllowedError'
      ? 'O acesso ao microfone foi negado. Abra as permissões da extensão no Chrome e permita o microfone.'
      : error.message;
  }
}

function pauseOrResume() {
  const button = $('#audioPause');
  if (recorder.state === 'recording') {
    recorder.pause();
    button.textContent = 'Continuar';
    $('#audioState').textContent = 'Gravação pausada';
  } else if (recorder.state === 'paused') {
    recorder.resume();
    button.textContent = 'Pausar';
    $('#audioState').textContent = 'Gravando…';
  }
}

async function finishRecording() {
  const feedback = $('#audioFeedback');
  $('#audioFinish').disabled = true;
  $('#audioPause').disabled = true;
  feedback.textContent = 'Preparando e transcrevendo o áudio…';
  try {
    const recording = await recorder.stop();
    stopTimer();
    const result = await transcribeAudio(recording);
    const input = $('#taskInput');
    const text = String(result.text || '').trim();
    input.value = input.value.trim() ? `${input.value.trim()}\n\n${text}` : text;
    $('#taskFeedback').textContent = result.simulated
      ? 'Transcrição simulada adicionada. Revise o texto antes de planejar.'
      : 'Áudio transcrito. Revise o texto antes de planejar.';
    $('#audioDialog').close();
    input.focus();
  } catch (error) {
    feedback.textContent = error.message;
    $('#audioFinish').disabled = false;
  }
}

function resetAudioUi() {
  stopTimer();
  recorder.cancel();
  $('#audioTimer').textContent = '00:00';
  $('#audioState').textContent = 'Pronto para gravar';
  $('#audioStart').disabled = false;
  $('#audioPause').disabled = true;
  $('#audioPause').textContent = 'Pausar';
  $('#audioFinish').disabled = true;
  $('#audioFeedback').textContent = 'Na primeira utilização, o Chrome solicitará permissão para acessar o microfone.';
}

function wire() {
  $('#attachButton')?.addEventListener('click', () => $('#attachmentInput').click());
  $('#attachmentInput')?.addEventListener('change', async (event) => {
    await handleFiles(event.target.files);
    event.target.value = '';
  });
  $('#attachmentList')?.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-remove-attachment]');
    if (!button) return;
    const chip = button.closest('[data-attachment-id]');
    await removeStagedAttachment(chip.dataset.attachmentId);
    await renderAttachments();
  });
  $('#recordButton')?.addEventListener('click', () => $('#audioDialog').showModal());
  $('#audioStart')?.addEventListener('click', startRecording);
  $('#audioPause')?.addEventListener('click', pauseOrResume);
  $('#audioFinish')?.addEventListener('click', finishRecording);
  $('#audioCancel')?.addEventListener('click', () => { resetAudioUi(); $('#audioDialog').close(); });
  $('#audioClose')?.addEventListener('click', () => { resetAudioUi(); $('#audioDialog').close(); });
  $('#audioDialog')?.addEventListener('cancel', (event) => { event.preventDefault(); resetAudioUi(); $('#audioDialog').close(); });
}

ensureUi();
wire();
await renderAttachments();
