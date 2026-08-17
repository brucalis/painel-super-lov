// Super Lovable 32.0.23
// Replaces the legacy remote sender with the authenticated Lovable composer.
(() => {
  const visible = (element) => {
    if (!element) return false;
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
  };

  const findComposer = () => {
    const candidates = [
      ...document.querySelectorAll("textarea"),
      ...document.querySelectorAll('[contenteditable="true"]'),
      ...document.querySelectorAll('[role="textbox"]'),
    ].filter(visible);
    return candidates.find((element) => {
      const hint = [
        element.getAttribute("placeholder"),
        element.getAttribute("aria-label"),
        element.getAttribute("data-placeholder"),
      ].filter(Boolean).join(" ").toLowerCase();
      return /ask|message|prompt|chat|lovable|pergunte|mensagem|comando/.test(hint);
    }) || candidates[candidates.length - 1] || null;
  };

  const fillComposer = (composer, message) => {
    composer.focus();
    if (composer instanceof HTMLTextAreaElement || composer instanceof HTMLInputElement) {
      const prototype = composer instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
      if (setter) setter.call(composer, message);
      else composer.value = message;
    } else {
      composer.textContent = "";
      try { document.execCommand("insertText", false, message); }
      catch (_) { composer.textContent = message; }
    }
    composer.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: message }));
    composer.dispatchEvent(new Event("change", { bubbles: true }));
  };

  const clickSend = async (composer) => {
    await new Promise((resolve) => setTimeout(resolve, 300));
    const scope = composer.closest("form") || composer.parentElement?.parentElement || document;
    const button = [...scope.querySelectorAll("button")].filter(visible).find((candidate) => {
      if (candidate.disabled) return false;
      const label = [candidate.getAttribute("aria-label"), candidate.getAttribute("title"), candidate.textContent]
        .filter(Boolean).join(" ").trim().toLowerCase();
      return candidate.type === "submit" || /send|submit|enviar/.test(label);
    });
    if (button) button.click();
    else {
      composer.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", bubbles: true, cancelable: true }));
      composer.dispatchEvent(new KeyboardEvent("keyup", { key: "Enter", code: "Enter", bubbles: true }));
    }
  };

  globalThis.sendPromptNativeViaBackground = async (message, _planMode, attachedFilesSnapshot) => {
    const attachments = Array.isArray(attachedFilesSnapshot) ? attachedFilesSnapshot : [];
    if (attachments.length) {
      throw new Error("Para anexar arquivos nesta versão, adicione-os primeiro no chat da Lovable e depois envie o comando pela Super Lovable.");
    }
    const prompt = String(message || "").trim();
    if (!prompt) throw new Error("Digite um comando antes de enviar.");
    const composer = findComposer();
    if (!composer) throw new Error("Campo de comando da Lovable não encontrado. Recarregue o projeto e tente novamente.");
    fillComposer(composer, prompt);
    await clickSend(composer);
    return { success: true, method: "lovable_composer" };
  };
})();
