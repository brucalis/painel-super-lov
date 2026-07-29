// i18n.js — textos centralizados (pt, en, es)
(function () {
  const DICT = {
    pt: {
      tab_prompt: 'Prompt', tab_queue: 'Fila', tab_history: 'Histórico',
      tab_tools: 'Ferramentas', tab_settings: 'Configurações',
      quick_actions: 'Atalhos rápidos', send_now: 'Enviar agora', add_queue: 'Adicionar à fila',
      improve: 'Melhorar prompt', model: 'Modelo', record: 'Gravar áudio', attach: 'Anexar arquivo',
      shield: 'Escudo', details: 'Detalhes', retry: 'Tentar novamente',
      st_synced: 'Projeto sincronizado', st_preparing: 'Preparando', st_sending: 'Enviando',
      st_waiting: 'Aguardando', st_uploading: 'Upload em andamento', st_done: 'Concluído',
      st_failed: 'Falhou', st_paused: 'Fila pausada', st_nosession: 'Sem sessão', st_noproject: 'Sem projeto',
      err_generic: 'Não foi possível concluir a operação.',
      err_session: 'Sua sessão pode ter expirado.',
      err_project: 'Abra um projeto da Lovable para continuar.',
      err_file: 'O arquivo não foi aceito.',
      err_queue: 'A fila foi pausada devido a um erro.',
      err_unavailable: 'Esta função não está disponível na integração atual.',
      err_retry: 'Tente novamente ou consulte os detalhes.',
      mic_denied: 'Permissão de microfone não concedida.',
      transcribe_missing: 'A transcrição precisa ser conectada a um serviço compatível.',
      audio_format: 'Este formato de áudio não foi aceito pela integração atual.',
      files_unavailable: 'Não foi possível obter os arquivos deste projeto com a integração atual.',
      wm_none: 'Não foi encontrada uma marca d’água que possa ser removida por esta ferramenta.',
      wm_notice: 'Esta ação só pode remover elementos do seu próprio projeto quando a plataforma e a sua conta permitirem.',
    },
    en: {
      tab_prompt: 'Prompt', tab_queue: 'Queue', tab_history: 'History',
      tab_tools: 'Tools', tab_settings: 'Settings',
      quick_actions: 'Quick actions', send_now: 'Send now', add_queue: 'Add to queue',
      improve: 'Improve prompt', model: 'Model', record: 'Record audio', attach: 'Attach file',
      shield: 'Shield', details: 'Details', retry: 'Retry',
      st_synced: 'Project synced', st_preparing: 'Preparing', st_sending: 'Sending',
      st_waiting: 'Waiting', st_uploading: 'Uploading', st_done: 'Done',
      st_failed: 'Failed', st_paused: 'Queue paused', st_nosession: 'No session', st_noproject: 'No project',
      err_generic: 'The operation could not be completed.',
      err_session: 'Your session may have expired.',
      err_project: 'Open a Lovable project to continue.',
      err_file: 'The file was not accepted.',
      err_queue: 'The queue was paused because of an error.',
      err_unavailable: 'This feature is not available in the current integration.',
      err_retry: 'Try again or check the details.',
      mic_denied: 'Microphone permission was not granted.',
      transcribe_missing: 'Transcription must be connected to a compatible service.',
      audio_format: 'This audio format was not accepted by the current integration.',
      files_unavailable: 'Could not fetch this project files with the current integration.',
      wm_none: 'No watermark that this tool can remove was found.',
      wm_notice: 'This action can only remove elements of your own project when the platform and your account allow it.',
    },
    es: {
      tab_prompt: 'Prompt', tab_queue: 'Cola', tab_history: 'Historial',
      tab_tools: 'Herramientas', tab_settings: 'Ajustes',
      quick_actions: 'Atajos rápidos', send_now: 'Enviar ahora', add_queue: 'Añadir a la cola',
      improve: 'Mejorar prompt', model: 'Modelo', record: 'Grabar audio', attach: 'Adjuntar archivo',
      shield: 'Escudo', details: 'Detalles', retry: 'Reintentar',
      st_synced: 'Proyecto sincronizado', st_preparing: 'Preparando', st_sending: 'Enviando',
      st_waiting: 'Esperando', st_uploading: 'Subiendo', st_done: 'Completado',
      st_failed: 'Falló', st_paused: 'Cola pausada', st_nosession: 'Sin sesión', st_noproject: 'Sin proyecto',
      err_generic: 'No se pudo completar la operación.',
      err_session: 'Tu sesión puede haber expirado.',
      err_project: 'Abre un proyecto de Lovable para continuar.',
      err_file: 'El archivo no fue aceptado.',
      err_queue: 'La cola se pausó por un error.',
      err_unavailable: 'Esta función no está disponible en la integración actual.',
      err_retry: 'Inténtalo de nuevo o consulta los detalles.',
      mic_denied: 'Permiso de micrófono no concedido.',
      transcribe_missing: 'La transcripción debe conectarse a un servicio compatible.',
      audio_format: 'Este formato de audio no fue aceptado por la integración actual.',
      files_unavailable: 'No se pudieron obtener los archivos del proyecto con la integración actual.',
      wm_none: 'No se encontró una marca de agua que esta herramienta pueda eliminar.',
      wm_notice: 'Esta acción solo puede eliminar elementos de tu propio proyecto cuando la plataforma y tu cuenta lo permitan.',
    },
  };

  let lang = 'pt';
  window.I18n = {
    set(l) { if (DICT[l]) lang = l; },
    get lang() { return lang; },
    t(key) { return (DICT[lang] && DICT[lang][key]) || DICT.pt[key] || key; },
    apply(root = document) {
      root.querySelectorAll('[data-i18n]').forEach((el) => {
        el.textContent = window.I18n.t(el.dataset.i18n);
      });
      root.querySelectorAll('[data-i18n-label]').forEach((el) => {
        el.setAttribute('aria-label', window.I18n.t(el.dataset.i18nLabel));
      });
    },
  };
})();
