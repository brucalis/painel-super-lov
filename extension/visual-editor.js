// Superlovable visual editor — executes only allowlisted, reversible DOM operations.
(() => {
  if (globalThis.__superlovableVisualEditorLoaded) return;
  globalThis.__superlovableVisualEditorLoaded = true;
  let selecting = false;
  let hovered = null;
  const undoStack = [];

  const eligible = (el) => el instanceof HTMLElement && !el.closest("#ql-floating, #ts-sidebar-overlay, [data-superlovable-ui]");
  const describe = (el) => {
    const style = getComputedStyle(el);
    return {
      tag: el.tagName.toLowerCase(),
      id: el.id || "",
      classes: [...el.classList].slice(0, 8),
      text: String(el.innerText || el.textContent || "").trim().slice(0, 1_500),
      ariaLabel: el.getAttribute("aria-label") || "",
      imageSrc: el instanceof HTMLImageElement ? el.currentSrc || el.src : "",
      styles: {
        color: style.color, backgroundColor: style.backgroundColor, fontSize: style.fontSize,
        fontWeight: style.fontWeight, textAlign: style.textAlign, borderRadius: style.borderRadius,
        padding: style.padding, margin: style.margin, width: style.width, minHeight: style.minHeight,
      },
    };
  };
  const clearHover = () => {
    if (hovered) { hovered.style.outline = hovered.dataset.slOldOutline || ""; delete hovered.dataset.slOldOutline; }
    hovered = null;
  };
  const stopSelecting = () => { selecting = false; clearHover(); document.removeEventListener("mousemove", onMove, true); document.removeEventListener("click", onClick, true); };
  function onMove(event) {
    const target = event.target;
    if (!eligible(target) || target === hovered) return;
    clearHover(); hovered = target; hovered.dataset.slOldOutline = hovered.style.outline || "";
    hovered.style.outline = "3px solid #ec4899";
  }
  function onClick(event) {
    if (!selecting || !eligible(event.target)) return;
    event.preventDefault(); event.stopImmediatePropagation();
    const element = event.target;
    stopSelecting();
    chrome.storage.local.set({ sl_visual_context: describe(element), sl_visual_selected_at: Date.now() });
  }
  function applyOperations(operations) {
    const element = globalThis.__superlovableSelectedElement;
    if (!element || !element.isConnected) throw new Error("O elemento selecionado não está mais disponível. Selecione-o novamente.");
    const snapshot = { element, text: element.textContent, display: element.style.display, src: element instanceof HTMLImageElement ? element.src : null, styles: {} };
    for (const op of operations || []) {
      if (op.type === "replace_text") element.textContent = String(op.value || "");
      else if (op.type === "hide_element") element.style.display = op.value ? "none" : snapshot.display;
      else if (op.type === "set_image_src" && element instanceof HTMLImageElement && /^https:\/\//i.test(op.value || "")) element.src = op.value;
      else if (op.type === "set_style" && typeof op.property === "string") {
        snapshot.styles[op.property] = element.style[op.property] || "";
        element.style[op.property] = String(op.value || "");
      }
    }
    undoStack.push(snapshot);
    return { applied: operations.length, context: describe(element), persistence: "preview_only" };
  }
  function undo() {
    const snapshot = undoStack.pop();
    if (!snapshot || !snapshot.element?.isConnected) throw new Error("Não há edição visual disponível para desfazer.");
    snapshot.element.textContent = snapshot.text;
    snapshot.element.style.display = snapshot.display;
    if (snapshot.src !== null && snapshot.element instanceof HTMLImageElement) snapshot.element.src = snapshot.src;
    for (const [property, value] of Object.entries(snapshot.styles)) snapshot.element.style[property] = value;
    return { undone: true, context: describe(snapshot.element) };
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.action === "visualStartSelection") {
      stopSelecting(); selecting = true;
      document.addEventListener("mousemove", onMove, true); document.addEventListener("click", onClick, true);
      sendResponse({ ok: true }); return;
    }
    if (message?.action === "visualConfirmSelection") {
      globalThis.__superlovableSelectedElement = hovered || globalThis.__superlovableSelectedElement;
      sendResponse({ ok: Boolean(globalThis.__superlovableSelectedElement) }); return;
    }
    if (message?.action === "visualApply") {
      try {
        const result = { ok: true, ...applyOperations(message.operations) };
        chrome.storage.local.set({ sl_visual_result: { nonce: message.nonce, ...result } });
        sendResponse(result);
      }
      catch (error) { sendResponse({ ok: false, error: error.message }); }
      return;
    }
    if (message?.action === "visualUndo") {
      try {
        const result = { ok: true, ...undo() };
        chrome.storage.local.set({ sl_visual_result: { nonce: message.nonce, ...result } });
        sendResponse(result);
      }
      catch (error) { sendResponse({ ok: false, error: error.message }); }
    }
  });

  // Preserve the exact element reference in this frame after selection.
  const originalOnClick = onClick;
  onClick = function(event) {
    if (selecting && eligible(event.target)) globalThis.__superlovableSelectedElement = event.target;
    return originalOnClick(event);
  };
})();
