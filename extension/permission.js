// permission.js — página dedicada ao pedido de microfone.
// O popup do Chrome não consegue exibir o aviso de permissão; esta página, sim.
(function () {
  const status = document.getElementById('permStatus');
  const btn = document.getElementById('permAsk');

  async function ask() {
    status.textContent = 'Aguardando sua resposta na janela do navegador…';
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop());
      status.textContent = 'Microfone liberado. Você já pode voltar à SUPER LOVABLE e gravar.';
      status.className = 'gate-status show success';
      setTimeout(() => window.close(), 2500);
    } catch (e) {
      status.className = 'gate-status show error';
      status.textContent =
        'O navegador não autorizou o microfone. Clique no ícone de permissões ao lado do endereço e escolha “Permitir”.';
    }
  }

  btn.addEventListener('click', ask);
  ask(); // pede assim que a página abre, dentro do gesto que veio do clique no microfone
})();
