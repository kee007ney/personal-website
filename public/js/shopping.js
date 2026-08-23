const API = "/api/shopping";
const listCollator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });
const state = {
  listItems: [], catalog: [], selectedCatalogItem: null, historyQuery: "", historyScrollY: 0,
  recommendedItems: [],
  user: null, socket: null, reconnectTimer: null, reconnectAttempts: 0, authenticated: false,
  listSort: {
    list: { key: null, direction: "asc" },
    cart: { key: null, direction: "asc" },
  },
};

const $ = selector => document.querySelector(selector);
const elements = {
  loginView: $("#login-view"), registerView: $("#register-view"), setupView: $("#setup-view"), appView: $("#app-view"),
  loginForm: $("#login-form"), loginError: $("#login-error"), registerForm: $("#register-form"), registerError: $("#register-error"),
  setupForm: $("#setup-form"), setupError: $("#setup-error"), showRegister: $("#show-register-button"), showLogin: $("#show-login-button"),
  logout: $("#logout-button"), accountNav: $(".account-nav"), currentUser: $("#current-user"), liveStatus: $("#live-status"),
  listTab: $("#list-tab"), historyTab: $("#history-tab"), listPanel: $("#list-panel"),
  historyPanel: $("#history-panel"), addForm: $("#add-item-form"), itemName: $("#item-name"), quantity: $("#item-quantity"),
  suggestions: $("#suggestions"), listBody: $("#shopping-list-body"), cartBody: $("#cart-body"),
  listEmpty: $("#shopping-list-empty"), cartEmpty: $("#cart-empty"), listCount: $("#shopping-count"), cartCount: $("#cart-count"),
  listMessage: $("#list-message"), finish: $("#finish-shopping-button"), categoryToggle: $("#category-toggle"), copyList: $("#copy-list-button"),
  sortButtons: [...document.querySelectorAll(".sort-button[data-table][data-sort]")],
  recommendationList: $("#recommendation-list"), recommendationEmpty: $("#recommendation-empty"),
  listTables: $("#list-tables"), historySearch: $("#history-search"), clearSearch: $("#clear-search-button"),
  historyResults: $("#history-results"), historyDetail: $("#history-detail"), historyBack: $("#history-back-button"),
  historyMessage: $("#history-message"), catalogDialog: $("#catalog-dialog"), manageCatalog: $("#manage-catalog-button"),
  closeCatalog: $("#close-catalog-button"), catalogForm: $("#catalog-form"), catalogId: $("#catalog-id"),
  catalogName: $("#catalog-name"), catalogCategories: $("#catalog-categories"), catalogSave: $("#catalog-save-button"),
  catalogCancel: $("#catalog-cancel-button"), catalogFilter: $("#catalog-filter"), catalogBody: $("#catalog-body"),
  catalogMessage: $("#catalog-message"), manageHousehold: $("#manage-household-button"), householdDialog: $("#household-dialog"),
  closeHousehold: $("#close-household-button"), memberList: $("#member-list"), createInvite: $("#create-invite-button"),
  inviteResult: $("#invite-result"), generatedInvite: $("#generated-invite"), copyInvite: $("#copy-invite-button"),
  householdMessage: $("#household-message"),
};

document.addEventListener("DOMContentLoaded", initialize);

async function initialize() {
  bindEvents();
  syncCategoryControl();
  try {
    const result = await api("/session");
    if (result.setupRequired) showAuthView("setup");
    else if (result.authenticated) await enterApp(result.user);
    else showAuthView("login");
  } catch (error) {
    showMessage(elements.loginError, error.message, true);
  }
}

function bindEvents() {
  elements.loginForm.addEventListener("submit", handleLogin);
  elements.registerForm.addEventListener("submit", handleRegister);
  elements.setupForm.addEventListener("submit", handleSetup);
  elements.showRegister.addEventListener("click", () => showAuthView("register"));
  elements.showLogin.addEventListener("click", () => showAuthView("login"));
  elements.logout.addEventListener("click", handleLogout);
  elements.listTab.addEventListener("click", () => switchTab("list"));
  elements.historyTab.addEventListener("click", () => switchTab("history"));
  elements.addForm.addEventListener("submit", addItem);
  elements.itemName.addEventListener("input", debounce(loadSuggestions, 150));
  elements.itemName.addEventListener("keydown", handleSuggestionKeys);
  document.addEventListener("click", event => { if (!event.target.closest(".autocomplete-field")) closeSuggestions(); });
  elements.finish.addEventListener("click", finishShopping);
  elements.categoryToggle.addEventListener("click", toggleCategories);
  elements.copyList.addEventListener("click", copyShoppingList);
  elements.sortButtons.forEach(button => button.addEventListener("click", sortListTable));
  window.addEventListener("resize", debounce(syncCategoryControl, 120));
  elements.historySearch.addEventListener("input", debounce(searchHistory, 180));
  elements.clearSearch.addEventListener("click", clearHistorySearch);
  elements.historyBack.addEventListener("click", closeHistoryDetail);
  elements.manageCatalog.addEventListener("click", openCatalog);
  elements.closeCatalog.addEventListener("click", () => elements.catalogDialog.close());
  elements.catalogForm.addEventListener("submit", saveCatalogItem);
  elements.catalogCancel.addEventListener("click", resetCatalogForm);
  elements.catalogFilter.addEventListener("input", renderCatalog);
  elements.catalogDialog.addEventListener("click", event => {
    if (event.target === elements.catalogDialog) elements.catalogDialog.close();
  });
  elements.manageHousehold.addEventListener("click", openHousehold);
  elements.closeHousehold.addEventListener("click", () => elements.householdDialog.close());
  elements.createInvite.addEventListener("click", createInvitation);
  elements.copyInvite.addEventListener("click", copyInvitation);
  elements.householdDialog.addEventListener("click", event => {
    if (event.target === elements.householdDialog) elements.householdDialog.close();
  });
  document.addEventListener("visibilitychange", () => { if (!document.hidden && state.authenticated && !state.socket) connectLive(); });
}

async function handleLogin(event) {
  event.preventDefault();
  const button = event.submitter;
  setBusy(button, true, "Signing in…");
  showMessage(elements.loginError, "");
  try {
    const form = new FormData(event.currentTarget);
    const result = await api("/login", { method: "POST", body: { username: form.get("username"), password: form.get("password") } });
    event.currentTarget.reset();
    await enterApp(result.user);
  } catch (error) {
    showMessage(elements.loginError, error.message, true);
  } finally { setBusy(button, false); }
}

async function handleRegister(event) {
  event.preventDefault();
  const button = event.submitter;
  setBusy(button, true, "Creating…");
  showMessage(elements.registerError, "");
  try {
    const form = Object.fromEntries(new FormData(event.currentTarget));
    const result = await api("/register", { method: "POST", body: form });
    event.currentTarget.reset();
    await enterApp(result.user);
  } catch (error) { showMessage(elements.registerError, error.message, true); }
  finally { setBusy(button, false); }
}

async function handleSetup(event) {
  event.preventDefault();
  const button = event.submitter;
  setBusy(button, true, "Creating…");
  showMessage(elements.setupError, "");
  try {
    const form = Object.fromEntries(new FormData(event.currentTarget));
    const result = await api("/setup", { method: "POST", body: form });
    event.currentTarget.reset();
    await enterApp(result.user);
  } catch (error) { showMessage(elements.setupError, error.message, true); }
  finally { setBusy(button, false); }
}

async function handleLogout() {
  await api("/logout", { method: "POST" });
  state.listItems = [];
  state.user = null;
  closeLive();
  showAuthView("login");
}

async function enterApp(user) {
  state.user = user;
  state.authenticated = true;
  elements.loginView.hidden = true;
  elements.registerView.hidden = true;
  elements.setupView.hidden = true;
  elements.appView.hidden = false;
  elements.accountNav.hidden = false;
  elements.currentUser.textContent = `${user.displayName} · ${user.householdName}`;
  elements.manageHousehold.hidden = user.role !== "admin";
  await loadList();
  await loadRecommendations();
  connectLive();
}

function showAuthView(view) {
  state.authenticated = false;
  elements.loginView.hidden = view !== "login";
  elements.registerView.hidden = view !== "register";
  elements.setupView.hidden = view !== "setup";
  elements.appView.hidden = true;
  elements.accountNav.hidden = true;
  if (view === "login") $("#username").focus();
  if (view === "register") $("#invite-code").focus();
  if (view === "setup") $("#setup-code").focus();
}

async function switchTab(tab) {
  const history = tab === "history";
  elements.listTab.classList.toggle("is-active", !history);
  elements.historyTab.classList.toggle("is-active", history);
  elements.listTab.setAttribute("aria-selected", String(!history));
  elements.historyTab.setAttribute("aria-selected", String(history));
  elements.listPanel.hidden = history;
  elements.historyPanel.hidden = !history;
  if (history) await searchHistory();
}

async function loadList() {
  const data = await api("/list");
  state.listItems = data.items;
  renderList();
}

async function loadRecommendations() {
  try {
    const data = await api("/suggestions");
    state.recommendedItems = data.items;
    renderRecommendations();
  } catch (error) {
    state.recommendedItems = [];
    renderRecommendations();
    showMessage(elements.listMessage, error.message, true);
  }
}

function renderRecommendations() {
  elements.recommendationList.replaceChildren(...state.recommendedItems.map(item => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "recommendation-button";
    button.textContent = item.name;
    button.setAttribute("aria-label", `Add ${item.name} to Shopping List`);
    button.addEventListener("click", () => addRecommendedItem(item, button));
    return button;
  }));
  elements.recommendationEmpty.hidden = state.recommendedItems.length > 0;
}

async function addRecommendedItem(item, button) {
  setBusy(button, true, "Adding…");
  try {
    const data = await api("/list", { method: "POST", body: {
      name: item.name,
      quantity: "1",
      catalogItemId: item.catalogItemId,
    } });
    const index = state.listItems.findIndex(listItem => listItem.id === data.item.id);
    if (index >= 0) state.listItems[index] = data.item;
    else state.listItems.push(data.item);
    state.recommendedItems = state.recommendedItems.filter(suggestion =>
      suggestion.catalogItemId
        ? suggestion.catalogItemId !== item.catalogItemId
        : suggestion.name.toLocaleLowerCase() !== item.name.toLocaleLowerCase()
    );
    renderList();
    renderRecommendations();
    await loadRecommendations();
  } catch (error) {
    showMessage(elements.listMessage, error.message, true);
    setBusy(button, false);
  }
}

function renderList() {
  const list = sortedListItems("list");
  const cart = sortedListItems("cart");
  elements.listBody.replaceChildren(...list.map(renderListRow));
  elements.cartBody.replaceChildren(...cart.map(renderListRow));
  elements.listEmpty.hidden = list.length > 0;
  elements.cartEmpty.hidden = cart.length > 0;
  elements.listCount.textContent = list.length;
  elements.cartCount.textContent = cart.length;
  elements.finish.disabled = cart.length === 0;
  elements.copyList.disabled = list.length === 0;
  syncSortControls();
}

function sortedListItems(table) {
  const items = state.listItems.filter(item => item.state === table);
  const { key, direction } = state.listSort[table];
  if (!key) return items;
  const multiplier = direction === "asc" ? 1 : -1;
  return items
    .map((item, index) => ({ item, index }))
    .sort((left, right) => {
      const comparison = listCollator.compare(sortValue(left.item, key), sortValue(right.item, key));
      return comparison ? comparison * multiplier : left.index - right.index;
    })
    .map(entry => entry.item);
}

function sortValue(item, key) {
  if (key === "category") return item.categories.join(", ");
  return String(item[key] || "");
}

function sortListTable(event) {
  const { table, sort: key } = event.currentTarget.dataset;
  const current = state.listSort[table];
  state.listSort[table] = {
    key,
    direction: current.key === key && current.direction === "asc" ? "desc" : "asc",
  };
  renderList();
}

function syncSortControls() {
  elements.sortButtons.forEach(button => {
    const { table, sort: key } = button.dataset;
    const activeSort = state.listSort[table];
    const active = activeSort.key === key;
    const direction = active ? activeSort.direction : null;
    const tableName = table === "list" ? "Shopping List" : "In Cart";
    button.closest("th").setAttribute("aria-sort", direction === "asc" ? "ascending" : direction === "desc" ? "descending" : "none");
    button.querySelector(".sort-indicator").textContent = direction === "asc" ? "▲" : direction === "desc" ? "▼" : "↕";
    button.setAttribute("aria-label", active
      ? `Sort ${tableName} by ${key} ${direction === "asc" ? "descending" : "ascending"}`
      : `Sort ${tableName} by ${key}`);
  });
}

async function copyShoppingList() {
  const names = sortedListItems("list").map(item => item.name);
  if (!names.length) return showMessage(elements.listMessage, "There are no Shopping List items to copy.", true);
  try {
    await copyText(names.join("\n"));
    const previous = elements.copyList.textContent;
    elements.copyList.textContent = "Copied";
    showMessage(elements.listMessage, `${names.length} item${names.length === 1 ? "" : "s"} copied.`);
    setTimeout(() => { elements.copyList.textContent = previous; }, 1400);
  } catch {
    showMessage(elements.listMessage, "Copying was blocked by the browser.", true);
  }
}

async function copyText(text) {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text);
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.className = "clipboard-fallback";
  document.body.append(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  textarea.remove();
  if (!copied) throw new Error("Copy command failed");
}

function renderListRow(item) {
  const row = document.createElement("tr");
  row.className = "shopping-row";
  row.tabIndex = 0;
  row.setAttribute("role", "button");
  row.setAttribute("aria-label", `${item.state === "list" ? "Move" : "Return"} ${item.name} ${item.state === "list" ? "to cart" : "to shopping list"}`);
  const quantityControl = item.state === "list"
    ? `<button class="edit-quantity" type="button" aria-label="Edit quantity for ${escapeAttribute(item.name)}"><span>${escapeHtml(item.quantity)}</span><span class="edit-quantity-icon" aria-hidden="true">✎</span></button>`
    : escapeHtml(item.quantity);
  row.innerHTML = `
    <td class="item-name-cell"><div class="item-name-wrap"><span>${escapeHtml(item.name)}</span><button class="remove-item" type="button" aria-label="Remove ${escapeHtml(item.name)}">×</button></div></td>
    <td class="quantity-cell">${quantityControl}</td>
    <td class="category-column">${renderTags(item.categories)}</td>`;
  row.addEventListener("click", event => {
    if (event.target.closest(".remove-item")) removeListItem(item.id);
    else if (event.target.closest(".edit-quantity")) editListItemQuantity(item, event.target.closest(".edit-quantity"));
    else if (event.target.closest(".quantity-input")) return;
    else if (row.classList.contains("is-editing-quantity")) return;
    else moveListItem(item);
  });
  row.addEventListener("keydown", event => {
    if (event.target !== row) return;
    if (event.key === "Enter" || event.key === " ") { event.preventDefault(); moveListItem(item); }
  });
  return row;
}

function editListItemQuantity(item, button) {
  const row = button.closest("tr");
  row.classList.add("is-editing-quantity");
  const input = document.createElement("input");
  input.type = "text";
  input.className = "quantity-input";
  input.value = item.quantity;
  input.maxLength = 40;
  input.setAttribute("aria-label", `Quantity for ${item.name}`);
  button.replaceWith(input);
  input.focus();
  input.select();

  let settled = false;
  const finish = async save => {
    if (settled) return;
    settled = true;
    const quantity = input.value.trim();
    if (!save || quantity === item.quantity) return renderList();
    if (!quantity) {
      renderList();
      return showMessage(elements.listMessage, "Quantity is required.", true);
    }

    input.disabled = true;
    try {
      const data = await api(`/list/${item.id}`, { method: "PUT", body: { quantity } });
      const index = state.listItems.findIndex(listItem => listItem.id === item.id);
      if (index >= 0) state.listItems[index] = data.item;
      renderList();
    } catch (error) {
      renderList();
      showMessage(elements.listMessage, error.message, true);
    }
  };

  input.addEventListener("click", event => event.stopPropagation());
  input.addEventListener("blur", () => finish(true));
  input.addEventListener("keydown", event => {
    event.stopPropagation();
    if (event.key === "Enter") {
      event.preventDefault();
      input.blur();
    } else if (event.key === "Escape") {
      event.preventDefault();
      finish(false);
    }
  });
}

async function moveListItem(item) {
  const nextState = item.state === "list" ? "cart" : "list";
  item.state = nextState;
  renderList();
  try { await api(`/list/${item.id}`, { method: "PUT", body: { state: nextState } }); }
  catch (error) { item.state = nextState === "list" ? "cart" : "list"; renderList(); showMessage(elements.listMessage, error.message, true); }
}

async function removeListItem(id) {
  const item = state.listItems.find(entry => entry.id === id);
  if (!item || !confirm(`Remove “${item.name}” from the current list?`)) return;
  await api(`/list/${id}`, { method: "DELETE" });
  state.listItems = state.listItems.filter(entry => entry.id !== id);
  renderList();
  await loadRecommendations();
}

async function addItem(event) {
  event.preventDefault();
  const button = event.submitter;
  setBusy(button, true, "Adding…");
  try {
    const data = await api("/list", { method: "POST", body: {
      name: elements.itemName.value, quantity: elements.quantity.value,
      catalogItemId: state.selectedCatalogItem?.id || null,
    } });
    const index = state.listItems.findIndex(item => item.id === data.item.id);
    if (index >= 0) state.listItems[index] = data.item; else state.listItems.push(data.item);
    elements.addForm.reset();
    elements.quantity.value = "1";
    state.selectedCatalogItem = null;
    closeSuggestions();
    renderList();
    await loadRecommendations();
    elements.itemName.focus();
  } catch (error) { showMessage(elements.listMessage, error.message, true); }
  finally { setBusy(button, false); }
}

async function loadSuggestions() {
  state.selectedCatalogItem = null;
  const query = elements.itemName.value.trim();
  if (!query) return closeSuggestions();
  const data = await api(`/catalog?q=${encodeURIComponent(query)}`);
  state.catalog = data.items;
  if (!data.items.length) return closeSuggestions();
  elements.suggestions.replaceChildren(...data.items.slice(0, 8).map(item => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "suggestion";
    button.setAttribute("role", "option");
    button.innerHTML = `<span>${escapeHtml(item.name)}</span><small>${escapeHtml(item.categories.join(", "))}</small>`;
    button.addEventListener("click", () => selectSuggestion(item));
    return button;
  }));
  elements.suggestions.hidden = false;
}

function selectSuggestion(item) { state.selectedCatalogItem = item; elements.itemName.value = item.name; closeSuggestions(); elements.quantity.focus(); elements.quantity.select(); }
function closeSuggestions() { elements.suggestions.hidden = true; elements.suggestions.replaceChildren(); }
function handleSuggestionKeys(event) {
  const buttons = [...elements.suggestions.querySelectorAll("button")];
  if (event.key === "ArrowDown" && buttons.length) { event.preventDefault(); buttons[0].focus(); }
  if (event.key === "Escape") closeSuggestions();
}

function toggleCategories() {
  const mobile = matchMedia("(max-width: 640px)").matches;
  const currentlyVisible = mobile ? elements.listTables.classList.contains("categories-visible") : !elements.listTables.classList.contains("categories-hidden");
  const nextVisible = !currentlyVisible;
  if (mobile) elements.listTables.classList.toggle("categories-visible", nextVisible);
  else elements.listTables.classList.toggle("categories-hidden", !nextVisible);
  syncCategoryControl();
}

function syncCategoryControl() {
  const mobile = matchMedia("(max-width: 640px)").matches;
  const visible = mobile ? elements.listTables.classList.contains("categories-visible") : !elements.listTables.classList.contains("categories-hidden");
  elements.categoryToggle.textContent = visible ? "Hide categories" : "Show categories";
  elements.categoryToggle.setAttribute("aria-pressed", String(!visible));
}

async function finishShopping() {
  if (!confirm("Finish this shopping trip and move all In Cart items to Shopping History?")) return;
  setBusy(elements.finish, true, "Finishing…");
  try {
    await api("/finish", { method: "POST" });
    state.listItems = state.listItems.filter(item => item.state !== "cart");
    renderList();
    await loadRecommendations();
    showMessage(elements.listMessage, "Shopping trip saved to history.");
  } catch (error) { showMessage(elements.listMessage, error.message, true); }
  finally { setBusy(elements.finish, false); renderList(); }
}

async function searchHistory() {
  const query = elements.historySearch.value.trim();
  state.historyQuery = query;
  elements.historyDetail.hidden = true;
  elements.historyBack.hidden = true;
  elements.historyResults.hidden = false;
  showMessage(elements.historyMessage, "Loading…");
  try {
    const data = await api(`/history?q=${encodeURIComponent(query)}`);
    renderHistory(data);
    showMessage(elements.historyMessage, data.mode === "search" ? `${data.hits.length} matching record${data.hits.length === 1 ? "" : "s"}` : "");
  } catch (error) { showMessage(elements.historyMessage, error.message, true); }
}

function renderHistory(data) {
  if (data.mode === "search") {
    elements.historyResults.replaceChildren(...data.hits.map(renderSearchHit));
    if (!data.hits.length) elements.historyResults.append(emptyMessage("No shopping records match that search."));
    return;
  }
  elements.historyResults.replaceChildren(...data.trips.map(renderHistoryCard));
  if (!data.trips.length) elements.historyResults.append(emptyMessage("No completed shopping trips yet."));
}

function renderHistoryCard(trip) {
  const card = document.createElement("article");
  card.className = "history-card";
  card.id = `trip-${trip.id}`;
  card.innerHTML = `
    <header class="history-card-header">
      <p class="history-date">${formatDate(trip.purchasedAt)}</p>
      <div class="metadata-editor"><input type="text" value="${escapeAttribute(trip.metadata)}" placeholder="Store or notes…" aria-label="Store or notes for ${formatDate(trip.purchasedAt)}"><button class="button secondary compact-button" type="button">Save</button></div>
    </header>
    <div class="table-scroll"><table class="shopping-table"><thead><tr><th>Name</th><th>Quantity</th><th>Category</th></tr></thead><tbody>${trip.items.map(item => `<tr><td>${escapeHtml(item.name)}</td><td>${escapeHtml(item.quantity)}</td><td>${renderTags(item.categories)}</td></tr>`).join("")}</tbody></table></div>`;
  const input = card.querySelector("input");
  card.querySelector("button").addEventListener("click", async event => {
    setBusy(event.currentTarget, true, "Saving…");
    try { await api(`/history/${trip.id}`, { method: "PUT", body: { metadata: input.value } }); trip.metadata = input.value.trim(); }
    catch (error) { showMessage(elements.historyMessage, error.message, true); }
    finally { setBusy(event.currentTarget, false); }
  });
  return card;
}

function renderSearchHit(hit) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "history-snippet";
  if (hit.type === "item") {
    button.innerHTML = `<span><strong>${escapeHtml(hit.name)}</strong>${hit.categories.length ? ` <span class="history-snippet-meta">${escapeHtml(hit.categories.join(", "))}</span>` : ""}</span><span>Qty: ${escapeHtml(hit.quantity)}</span><time>${formatDate(hit.purchasedAt)}</time>`;
  } else {
    button.innerHTML = `<span><strong>${escapeHtml(hit.metadata)}</strong><br><span class="history-snippet-meta">${hit.itemCount} item${hit.itemCount === 1 ? "" : "s"} purchased</span></span><span></span><time>${formatDate(hit.purchasedAt)}</time>`;
  }
  button.addEventListener("click", () => openHistoryDetail(hit.tripId));
  return button;
}

async function openHistoryDetail(tripId) {
  state.historyScrollY = window.scrollY;
  const data = await api(`/history/${tripId}`);
  elements.historyDetail.replaceChildren(renderHistoryCard(data.trip));
  elements.historyResults.hidden = true;
  elements.historyDetail.hidden = false;
  elements.historyBack.hidden = false;
  elements.historyDetail.scrollIntoView({ behavior: "smooth", block: "start" });
}

function closeHistoryDetail() {
  elements.historyDetail.hidden = true;
  elements.historyBack.hidden = true;
  elements.historyResults.hidden = false;
  window.scrollTo({ top: state.historyScrollY, behavior: "smooth" });
}

function clearHistorySearch() { elements.historySearch.value = ""; elements.historySearch.focus(); searchHistory(); }

async function openCatalog() {
  elements.catalogDialog.showModal();
  showMessage(elements.catalogMessage, "Loading…");
  try { const data = await api("/catalog"); state.catalog = data.items; renderCatalog(); showMessage(elements.catalogMessage, ""); }
  catch (error) { showMessage(elements.catalogMessage, error.message, true); }
}

function renderCatalog() {
  const query = elements.catalogFilter.value.trim().toLocaleLowerCase();
  const items = state.catalog.filter(item => !query || item.name.toLocaleLowerCase().includes(query) || item.categories.some(category => category.toLocaleLowerCase().includes(query)));
  elements.catalogBody.replaceChildren(...items.map(item => {
    const row = document.createElement("tr");
    row.innerHTML = `<td>${escapeHtml(item.name)}</td><td>${escapeHtml(item.categories.join(", "))}</td><td><button class="catalog-action edit" type="button">Edit</button><button class="catalog-action delete" type="button">Delete</button></td>`;
    row.querySelector(".edit").addEventListener("click", () => editCatalogItem(item));
    row.querySelector(".delete").addEventListener("click", () => deleteCatalogItem(item));
    return row;
  }));
}

function editCatalogItem(item) {
  elements.catalogId.value = item.id;
  elements.catalogName.value = item.name;
  elements.catalogCategories.value = item.categories.join(", ");
  elements.catalogSave.textContent = "Save changes";
  elements.catalogCancel.hidden = false;
  elements.catalogName.focus();
}

function resetCatalogForm() { elements.catalogForm.reset(); elements.catalogId.value = ""; elements.catalogSave.textContent = "Add item"; elements.catalogCancel.hidden = true; }

async function saveCatalogItem(event) {
  event.preventDefault();
  const id = elements.catalogId.value;
  setBusy(event.submitter, true, "Saving…");
  try {
    const data = await api(id ? `/catalog/${id}` : "/catalog", { method: id ? "PUT" : "POST", body: { name: elements.catalogName.value, categories: elements.catalogCategories.value } });
    const index = state.catalog.findIndex(item => item.id === data.item.id);
    if (index >= 0) state.catalog[index] = data.item; else state.catalog.push(data.item);
    state.catalog.sort((a, b) => a.name.localeCompare(b.name));
    resetCatalogForm(); renderCatalog(); showMessage(elements.catalogMessage, id ? "Item updated." : "Item added.");
  } catch (error) { showMessage(elements.catalogMessage, error.message, true); }
  finally { setBusy(event.submitter, false); }
}

async function deleteCatalogItem(item) {
  if (!confirm(`Delete “${item.name}” from the autocomplete database? Existing lists and history will be kept.`)) return;
  try { await api(`/catalog/${item.id}`, { method: "DELETE" }); state.catalog = state.catalog.filter(entry => entry.id !== item.id); renderCatalog(); }
  catch (error) { showMessage(elements.catalogMessage, error.message, true); }
}

async function openHousehold() {
  elements.householdDialog.showModal();
  elements.inviteResult.hidden = true;
  showMessage(elements.householdMessage, "Loading…");
  try { await loadMembers(); showMessage(elements.householdMessage, ""); }
  catch (error) { showMessage(elements.householdMessage, error.message, true); }
}

async function loadMembers() {
  const data = await api("/members");
  elements.householdDialog.querySelector("#household-title").textContent = data.household.name;
  elements.memberList.replaceChildren(...data.members.map(member => {
    const row = document.createElement("div");
    row.className = "member-row";
    row.innerHTML = `<div><div class="member-name">${escapeHtml(member.displayName)}</div><div class="member-details">@${escapeHtml(member.username)}</div></div><span class="role-badge">${escapeHtml(member.role)}</span>`;
    return row;
  }));
}

async function createInvitation() {
  setBusy(elements.createInvite, true, "Creating…");
  try {
    const data = await api("/invitations", { method: "POST" });
    elements.generatedInvite.value = data.invitationCode;
    elements.inviteResult.hidden = false;
    elements.generatedInvite.focus();
    elements.generatedInvite.select();
  } catch (error) { showMessage(elements.householdMessage, error.message, true); }
  finally { setBusy(elements.createInvite, false); }
}

async function copyInvitation() {
  try {
    await copyText(elements.generatedInvite.value);
    const previous = elements.copyInvite.textContent;
    elements.copyInvite.textContent = "Copied";
    setTimeout(() => { elements.copyInvite.textContent = previous; }, 1400);
  } catch {
    elements.generatedInvite.select();
    showMessage(elements.householdMessage, "Copy was blocked; the code is selected so you can copy it manually.");
  }
}

function connectLive() {
  if (!state.authenticated || state.socket?.readyState === WebSocket.OPEN || state.socket?.readyState === WebSocket.CONNECTING) return;
  clearTimeout(state.reconnectTimer);
  setLiveStatus("connecting", "Connecting…");
  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  const socket = new WebSocket(`${protocol}//${location.host}${API}/live`);
  state.socket = socket;
  socket.addEventListener("open", () => {
    state.reconnectAttempts = 0;
    setLiveStatus("live", "Live");
  });
  socket.addEventListener("message", event => {
    if (event.data === "pong") return;
    try { handleLiveEvent(JSON.parse(event.data)); } catch {}
  });
  socket.addEventListener("close", () => {
    if (state.socket === socket) state.socket = null;
    if (!state.authenticated) return;
    setLiveStatus("connecting", "Reconnecting…");
    const delay = Math.min(30000, 1000 * (2 ** state.reconnectAttempts++));
    state.reconnectTimer = setTimeout(connectLive, delay);
  });
  socket.addEventListener("error", () => socket.close());
}

function closeLive() {
  clearTimeout(state.reconnectTimer);
  state.reconnectTimer = null;
  if (state.socket) { const socket = state.socket; state.socket = null; socket.close(1000, "Signed out"); }
  setLiveStatus("offline", "Offline");
}

function setLiveStatus(status, label) {
  elements.liveStatus.dataset.state = status;
  elements.liveStatus.textContent = label;
}

async function handleLiveEvent(event) {
  if (!state.authenticated || event.type === "connected") return;
  if (["list_changed", "shopping_finished", "catalog_changed"].includes(event.type)) {
    await loadList();
    await loadRecommendations();
  }
  if (["history_changed", "shopping_finished"].includes(event.type) && !elements.historyPanel.hidden) await searchHistory();
  if (event.type === "catalog_changed" && elements.catalogDialog.open) {
    const data = await api("/catalog"); state.catalog = data.items; renderCatalog();
  }
  if (event.type === "members_changed" && elements.householdDialog.open) await loadMembers();
}

async function api(path, options = {}) {
  const response = await fetch(`${API}${path}`, {
    method: options.method || "GET", credentials: "same-origin",
    headers: options.body ? { "Content-Type": "application/json" } : {},
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  if (response.status === 401 && !["/login", "/register", "/setup", "/session"].includes(path)) {
    closeLive();
    state.user = null;
    showAuthView("login");
  }
  const data = response.status === 204 ? null : await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error || `Request failed (${response.status}).`);
  return data;
}

function renderTags(categories) { return categories?.length ? `<span class="tag-list">${categories.map(category => `<span class="tag">${escapeHtml(category)}</span>`).join("")}</span>` : `<span class="history-snippet-meta">—</span>`; }
function formatDate(value) { return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)); }
function emptyMessage(text) { const p = document.createElement("p"); p.className = "empty-state"; p.textContent = text; return p; }
function showMessage(element, message, error = false) { element.textContent = message; element.hidden = !message; element.classList.toggle("error", error); }
function setBusy(button, busy, label = "Working…") { if (!button) return; if (busy) { button.dataset.label = button.textContent; button.textContent = label; } else if (button.dataset.label) { button.textContent = button.dataset.label; delete button.dataset.label; } button.disabled = busy; }
function debounce(fn, delay) { let timer; return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), delay); }; }
function escapeHtml(value) { return String(value ?? "").replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[character])); }
function escapeAttribute(value) { return escapeHtml(value).replace(/`/g, "&#096;"); }
