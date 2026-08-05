globalThis.addEventListener('superlovable:attachments-consumed', () => {
  const list = document.querySelector('#attachmentList');
  if (list) {
    list.innerHTML = '';
    list.hidden = true;
  }
  const button = document.querySelector('#attachButton');
  if (button) button.setAttribute('title', 'Anexar arquivos');
});
