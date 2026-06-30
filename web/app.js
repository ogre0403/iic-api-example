// ---------------------------------------------------------------------------
// Credentials: Token & Project ID are persisted PER SERVER ENVIRONMENT
// (AI-Cloud / AI-Trust / 高安控雲), SHARED across every spec tab (IAM / MCC /
// VPS / VRM). Set AI-Cloud's token once in any tab and it applies to AI-Cloud
// in all tabs; AI-Trust keeps its own separate values.
//
// Because each spec declares the same environment under a slightly different
// URL, credentials are keyed by the server LABEL (the environment name), which
// is the identifier shared across specs — not by the per-spec server id.
//
// The values are auto-injected into Stoplight Elements Try It fields on every
// render / spec switch / server switch.
// ---------------------------------------------------------------------------

// Legacy global keys (read-only fallback for users who saved credentials with
// the original single-value model). We never write these again.
const LEGACY_CRED_KEYS = { token: 'iic_cred_token', projectId: 'iic_cred_project_id' };

function readJSONObject(key) {
  try {
    const v = JSON.parse(localStorage.getItem(key));
    return (v && typeof v === 'object' && !Array.isArray(v)) ? v : {};
  } catch (e) {
    return {};
  }
}

// Per-environment credential storage, shared across all specs:
//   iic_doc_credentials_v3 : { [envKey]: { token, projectId } }
//   iic_active_server_v1   : { [specFile]: serverId }
const CRED_STORE_KEY    = 'iic_doc_credentials_v3';
const ACTIVE_SERVER_KEY = 'iic_active_server_v1';
const _credStore     = readJSONObject(CRED_STORE_KEY);     // envKey -> {token, projectId}
const _activeServers = readJSONObject(ACTIVE_SERVER_KEY);  // spec -> serverId

// Synthetic server id / env key used for specs that declare no OpenAPI
// `servers`; shared by all such specs.
const FALLBACK_SERVER_ID = '__no_server__';

// Read-only legacy values, shown only until a v3 record exists for the env.
const legacyCred = {
  token:     localStorage.getItem(LEGACY_CRED_KEYS.token)     || '',
  projectId: localStorage.getItem(LEGACY_CRED_KEYS.projectId) || '',
};

// The active spec/server selection (drives the Server selector + which env's
// credentials are shown/injected).
let activeSpecFile = null;
let activeServerId = null;

// Servers declared by a spec (from specs.json / __SPECS_LIST__ metadata).
function getServersForSpec(file) {
  const spec = SPECS.find((s) => s.file === file);
  return (spec && Array.isArray(spec.servers)) ? spec.servers : [];
}

// The environment key for a (spec, serverId): the server's LABEL so the same
// environment is shared across specs. Falls back to the url, then to the
// no-server sentinel.
function envKeyForServer(file, serverId) {
  if (!serverId || serverId === FALLBACK_SERVER_ID) return FALLBACK_SERVER_ID;
  const srv = getServersForSpec(file).find((s) => s.id === serverId);
  if (!srv) return FALLBACK_SERVER_ID;
  return srv.label || srv.url || FALLBACK_SERVER_ID;
}

// Resolve the active server id for a spec, validating any saved choice against
// the current metadata. Falls back to the first valid server, or to the
// per-spec fallback id when the spec declares no servers.
function resolveServerId(file) {
  const servers = getServersForSpec(file);
  if (servers.length === 0) return FALLBACK_SERVER_ID;
  const saved = _activeServers[file];
  if (saved && servers.some((s) => s.id === saved)) return saved;
  return servers[0].id;
}

// Make (file, serverId) the active selection and persist the choice (real
// servers only — the fallback id is implicit and not worth storing).
function setActiveServer(file, serverId) {
  activeServerId = serverId;
  if (serverId && serverId !== FALLBACK_SERVER_ID) {
    _activeServers[file] = serverId;
    localStorage.setItem(ACTIVE_SERVER_KEY, JSON.stringify(_activeServers));
  }
}

// Credential record for a given environment key. While no v3 record exists for
// the env we surface the legacy global values; once the user saves (creating a
// record) we read v3 only.
function credForEnvKey(envKey) {
  if (Object.prototype.hasOwnProperty.call(_credStore, envKey)) {
    const rec = _credStore[envKey] || {};
    return { token: rec.token || '', projectId: rec.projectId || '' };
  }
  return { token: legacyCred.token, projectId: legacyCred.projectId };
}

// Credential record for the active environment (the active spec's selected server).
function getCredContext() {
  return credForEnvKey(envKeyForServer(activeSpecFile, activeServerId));
}

// Dispatch a native value-change so React (inside Stoplight Elements) picks it up.
function setNativeInputValue(input, value) {
  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype, 'value'
  );
  if (nativeInputValueSetter && nativeInputValueSetter.set) {
    nativeInputValueSetter.set.call(input, value);
  } else {
    input.value = value;
  }
  input.dispatchEvent(new Event('input',  { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

// Also handle <textarea> (Stoplight sometimes uses one for security values).
function setNativeTextareaValue(ta, value) {
  const nativeSetter = Object.getOwnPropertyDescriptor(
    window.HTMLTextAreaElement.prototype, 'value'
  );
  if (nativeSetter && nativeSetter.set) {
    nativeSetter.set.call(ta, value);
  } else {
    ta.value = value;
  }
  ta.dispatchEvent(new Event('input',  { bubbles: true }));
  ta.dispatchEvent(new Event('change', { bubbles: true }));
}

// Deep-walk el (including shadow roots) and collect all matching inputs/textareas.
function deepQueryAll(el, selector) {
  const results = [];
  function walk(node) {
    if (!node) return;
    if (node.querySelectorAll) {
      node.querySelectorAll(selector).forEach((n) => results.push(n));
    }
    if (node.shadowRoot) walk(node.shadowRoot);
    for (const c of (node.children || [])) walk(c);
  }
  walk(el);
  return results;
}

// Find an input/textarea whose visible label (aria-label, placeholder, or the
// preceding <label> text) contains the given keyword (case-insensitive).
function findInputsByLabel(root, keyword) {
  const kw = keyword.toLowerCase();
  const candidates = deepQueryAll(root, 'input, textarea');
  return candidates.filter((el) => {
    const ariaLabel  = (el.getAttribute('aria-label')  || '').toLowerCase();
    const placeholder = (el.getAttribute('placeholder') || '').toLowerCase();
    const name        = (el.getAttribute('name')        || '').toLowerCase();
    const id          = (el.id                          || '').toLowerCase();
    // Also check associated <label> text.
    let labelText = '';
    if (el.id) {
      // Walk up through shadow roots to find a <label for="...">
      function findLabel(searchRoot, targetId) {
        if (!searchRoot) return null;
        const lbl = searchRoot.querySelector ? searchRoot.querySelector('label[for="' + targetId + '"]') : null;
        if (lbl) return lbl;
        if (searchRoot.shadowRoot) return findLabel(searchRoot.shadowRoot, targetId);
        return null;
      }
      const lbl = findLabel(root, el.id);
      if (lbl) labelText = lbl.textContent.toLowerCase();
    }
    // Stoplight renders the field label as a sibling <label> or a nearby div/span.
    // Fall back to scanning the parent container text.
    let parentText = '';
    const container = el.closest ? el.closest('div, li, section') : null;
    if (container) parentText = container.textContent.toLowerCase();

    return ariaLabel.includes(kw)
      || placeholder.includes(kw)
      || name.includes(kw)
      || id.includes(kw)
      || labelText.includes(kw)
      || parentText.includes(kw);
  });
}

// Set or clear all Try It inputs matching a label keyword to `value`.
// When `value` is empty, fields are cleared so values saved for a previously
// active server never linger after switching to a server with no saved value.
function fillTryItFields(root, keyword, value) {
  const inputs = findInputsByLabel(root, keyword);
  inputs.forEach((inp) => {
    if (inp.value === value) return;             // already correct; don't fight the user
    if (!value && !inp.value) return;            // nothing to clear
    if (inp instanceof HTMLTextAreaElement) {
      setNativeTextareaValue(inp, value);
    } else {
      setNativeInputValue(inp, value);
    }
  });
}

// Apply the ACTIVE server context's credentials into all visible Try It inputs,
// clearing any field whose value is empty for the active server.
function applyCredentialsToTryIt() {
  const root = document.getElementById('api-viewer');
  if (!root) return;

  const cred = getCredContext();

  // --- Bearer token ---
  // Stoplight renders a "token" input (type=password or text) for bearerAuth.
  // It may appear with labels like "token", "bearerAuth", "Authorization", etc.
  fillTryItFields(root, 'token', cred.token);

  // --- project-id ---
  // project-id may appear as a path param, query param or header.
  fillTryItFields(root, 'project', cred.projectId);
}

// ---------------------------------------------------------------------------
// Spec list (single source of truth for the top-bar tabs)
// ---------------------------------------------------------------------------
// Each entry: { file: '<name>.yaml', label: '<TAB TEXT>' }.
//
// In the standalone build, build_standalone.py auto-scans swagger/*.yaml and
// OVERRIDES this array (by injecting `window.__SPECS_LIST__`) so neither this
// file nor index.html needs editing when specs are added/removed.
//
// In the nginx-served site the browser cannot list the swagger/ directory, so
// the spec list is loaded at runtime from specs.json (auto-generated by
// build_standalone.py). DEFAULT_SPECS is only a last-resort fallback if both
// the injected list and specs.json are unavailable.
const DEFAULT_SPECS = [
  { file: 'iam.yaml', label: 'IAM' },
  { file: 'mcc.yaml', label: 'MCC' },
  { file: 'vps.yaml', label: 'VPS' },
  { file: 'vrm.yaml', label: 'VRM' },
];

// The active spec list and default tab are resolved at load time by
// resolveSpecs(); they start as the fallback so any early reference is valid.
let SPECS = DEFAULT_SPECS;
let DEFAULT_SPEC_FILE = (SPECS[0] && SPECS[0].file) || 'iam.yaml';

// Resolve the spec list, preferring (in order):
//   1. window.__SPECS_LIST__  — injected by the standalone build
//   2. specs.json             — fetched in the nginx-served site
//   3. DEFAULT_SPECS          — hard-coded fallback
async function resolveSpecs() {
  if (Array.isArray(window.__SPECS_LIST__) && window.__SPECS_LIST__.length) {
    SPECS = window.__SPECS_LIST__;
  } else {
    try {
      const resp = await fetch('specs.json', { cache: 'no-cache' });
      if (resp.ok) {
        const list = await resp.json();
        if (Array.isArray(list) && list.length) SPECS = list;
      }
    } catch (e) {
      // Offline / file:// / missing specs.json — keep DEFAULT_SPECS.
    }
  }
  DEFAULT_SPEC_FILE = (SPECS[0] && SPECS[0].file) || 'iam.yaml';
}

// Build the top-bar tab buttons from SPECS so the markup is not hard-coded.
function buildTabs() {
  const bar = document.querySelector('.topbar');
  if (!bar) return;
  // Remove any pre-existing tab buttons (none in the new index.html, but be safe).
  bar.querySelectorAll('.tab-btn').forEach((b) => b.remove());
  // Insert tabs before the settings button so they sit right after the title;
  // the button's margin-left:auto keeps it pinned to the far right.
  const settingsBtn = bar.querySelector('#cred-settings-btn');
  SPECS.forEach((spec, i) => {
    const btn = document.createElement('button');
    btn.className = 'tab-btn' + (i === 0 ? ' active' : '');
    btn.textContent = spec.label || spec.file;
    btn.dataset.file = spec.file;
    btn.addEventListener('click', () => switchApi(spec.file, btn));
    if (settingsBtn) {
      bar.insertBefore(btn, settingsBtn);
    } else {
      bar.appendChild(btn);
    }
  });
}

// Collapse state for the first-level groups, persisted per spec switch.
const l1Collapsed = { Admin: true, User: true };

// Key used for storing the collapse state of the current tab.
let _collapseKey = 'iic_collapse_' + (localStorage.getItem('iic_active_tab') || DEFAULT_SPEC_FILE);

function loadCollapseState(tabFile) {
  _collapseKey = 'iic_collapse_' + tabFile;
  try {
    const saved = JSON.parse(localStorage.getItem(_collapseKey));
    if (saved && typeof saved === 'object') {
      l1Collapsed.Admin = saved.Admin !== false;
      l1Collapsed.User  = saved.User  !== false;
      return;
    }
  } catch (e) {}
  // Default: both groups collapsed.
  l1Collapsed.Admin = true;
  l1Collapsed.User  = true;
}

// Expand the L1 group that contains the currently active endpoint (from hash).
// Called after Stoplight finishes rendering so the sidebar rows exist.
function expandGroupForHash() {
  const hash = window.location.hash; // e.g. #/operations/listServers
  if (!hash) return;
  const root = document.getElementById('api-viewer');
  if (!root) return;

  // Find the sidebar row whose href matches the hash.
  const allLinks = root.querySelectorAll('a[href]');
  for (const link of allLinks) {
    const href = link.getAttribute('href') || '';
    if (href === hash || href.endsWith(hash)) {
      // Walk up to find the closest L2 tag item which carries data-l1group.
      let el = link;
      while (el && el !== root) {
        if (el.dataset && el.dataset.l1group) {
          const group = el.dataset.l1group;
          if (l1Collapsed[group]) {
            l1Collapsed[group] = false;
            saveCollapseState();
            // Update the header element to reflect the new state.
            const container = el.parentElement;
            if (container) {
              const header = Array.from(container.children).find(
                (c) => c.classList && c.classList.contains('group-l1-header') && c.dataset.l1group === group
              );
              if (header) header.classList.remove('collapsed');
              applyCollapseState(container);
            }
          }
          return;
        }
        el = el.parentElement;
      }
    }
  }
}

function saveCollapseState() {
  localStorage.setItem(_collapseKey, JSON.stringify({ Admin: l1Collapsed.Admin, User: l1Collapsed.User }));
}

// Apply the two-level grouping to the Stoplight Elements sidebar.
// Level 1: "Admin" / "User" (derived from the tag prefix before the first "/").
// Level 2: the original tag (kept intact, just shown without the prefix).
function applyGrouping() {
  const root = document.getElementById('api-viewer');
  if (!root) return;

  // Find the "Endpoints" label; the tag items are its following siblings.
  const labels = root.querySelectorAll('div');
  let endpointsLabel = null;
  for (const el of labels) {
    if (el.childElementCount === 0 && el.textContent.trim() === 'Endpoints') {
      endpointsLabel = el;
      break;
    }
  }
  if (!endpointsLabel) return;

  const container = endpointsLabel.parentElement;
  if (!container) return;

  // Collect the top-level tag items (those with a title like "Admin/..." or "User/...").
  const tagItems = Array.from(container.children).filter((el) => {
    const title = el.getAttribute && el.getAttribute('title');
    return title && /^(Admin|User)\//.test(title);
  });
  if (tagItems.length === 0) return;

  // Ensure we label and indent all second-level tag items properly.
  decorateChildren(tagItems);

  // Ensure L1 group headers exist and are positioned immediately before the first item of each group.
  ['User', 'Admin'].forEach((groupName) => {
    const first = tagItems.find(
      (el) => (el.getAttribute('title') || '').split('/')[0] === groupName
    );
    if (!first) return;

    let header = container.querySelector(`.group-l1-header[data-l1group="${groupName}"]`);
    if (!header) {
      header = buildHeader(groupName);
    }

    if (first.previousElementSibling !== header) {
      container.insertBefore(header, first);
    }
  });

  applyCollapseState(container);
}

// Relabel each tag item to show only the second-level tag and mark it as a child.
function decorateChildren(tagItems) {
  tagItems.forEach((el) => {
    const title = el.getAttribute('title') || '';
    const group = title.split('/')[0];
    const sub = title.slice(group.length + 1);
    el.classList.add('group-l1-child');
    el.dataset.l1group = group;

    // The visible label is the first inner text div.
    const labelEl = el.querySelector('div');
    if (labelEl && labelEl.textContent.trim() === title) {
      labelEl.textContent = sub;
    }
  });
}

function buildHeader(groupName) {
  const header = document.createElement('div');
  header.className = 'group-l1-header';
  header.dataset.l1group = groupName;
  if (l1Collapsed[groupName]) header.classList.add('collapsed');

  const caret = document.createElement('span');
  caret.className = 'group-l1-caret';
  caret.textContent = '\u25BC'; // ▼

  const label = document.createElement('span');
  label.textContent = groupName;

  header.appendChild(caret);
  header.appendChild(label);

  header.addEventListener('click', () => {
    l1Collapsed[groupName] = !l1Collapsed[groupName];
    header.classList.toggle('collapsed', l1Collapsed[groupName]);
    applyCollapseState(header.parentElement);
    saveCollapseState();
  });

  return header;
}

// Show/hide child items based on the collapse state of each L1 group.
//
// The sidebar is a flat list of rows in document order:
//   [L1 header: User]
//     [L2 tag] [L3 op] [L3 op] ...
//     [L2 tag] [L3 op] ...
//   [L1 header: Admin]
//     [L2 tag] [L3 op] ...
//
// Only the L1 headers and L2 tag items carry a `data-l1group` attribute.
// The L3 operation rows (shown when an L2 tag is expanded) do NOT, so we
// must infer their group from the most recent header / L2 tag we've seen
// while walking the list. Otherwise collapsing an L1 group would leave the
// expanded endpoint rows visible.
function applyCollapseState(container) {
  if (!container) return;
  let currentGroup = null;
  Array.from(container.children).forEach((el) => {
    const isHeader = el.classList && el.classList.contains('group-l1-header');
    const ownGroup = el.dataset && el.dataset.l1group;

    if (isHeader) {
      // Header itself stays visible; it only updates the current group.
      currentGroup = ownGroup;
      return;
    }

    if (ownGroup) {
      // An L2 tag item explicitly tells us which group we're now in.
      currentGroup = ownGroup;
    }

    // Rows before the first header (if any) have no group; leave them alone.
    if (!currentGroup) return;

    el.style.display = l1Collapsed[currentGroup] ? 'none' : '';
  });
}


// Watch the viewer for re-renders (navigation, spec switch) and re-apply grouping.
let observer = null;
function observeViewer() {
  const root = document.getElementById('api-viewer');
  if (!root) return;
  if (observer) observer.disconnect();
  observer = new MutationObserver(() => {
    // Debounce slightly to let Stoplight finish rendering a batch.
    clearTimeout(observeViewer._t);
    observeViewer._t = setTimeout(() => {
      applyGrouping();
      expandGroupForHash();
      // A re-render can change the rendered server control; re-resolve the
      // active server and re-apply its credentials to keep them in sync.
      syncCredentialsWithViewer();
    }, 50);
  });
  observer.observe(root, { childList: true, subtree: true });
  applyGrouping();
  expandGroupForHash();
  // Keep the active server in sync when the user picks a server inside the viewer.
  attachViewerServerSync();
  // Force a Try It credential refresh just before the request is sent, so a
  // fast Send after switching servers still uses the newly selected server.
  attachTryItPreExecuteSync();
  // Resolve the viewer-selected server, then apply its credentials whenever the
  // viewer re-renders (navigation, spec switch, server-control mutation).
  syncCredentialsWithViewer();
}

function switchApi(file, el, restoreHash) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  el.classList.add('active');
  // Persist the selected tab so it survives a page refresh.
  localStorage.setItem('iic_active_tab', file);
  // Switch the credential editing scope to this spec's active server, and
  // refresh the top-bar Server / Token / Project controls accordingly.
  activateSpecContext(file);
  // Load the collapse state for the new tab.
  loadCollapseState(file);

  // Determine which hash to restore BEFORE touching the DOM / hash.
  const hashToRestore = restoreHash !== undefined
    ? restoreHash
    : (localStorage.getItem('iic_hash_' + file) || '');

  // Block hashchange from overwriting saved hashes while we rebuild.
  _switching = true;

  // Remove and recreate the element to force Stoplight Elements to reload the spec.
  const container = document.querySelector('.viewer');
  const old = document.getElementById('api-viewer');
  container.removeChild(old);

  // Clear the hash so Stoplight doesn't carry over the previous page's route.
  history.replaceState(null, '', window.location.pathname + window.location.search);

  const next = document.createElement('elements-api');
  next.id = 'api-viewer';
  next.setAttribute('apiDescriptionUrl', file);
  next.setAttribute('router', 'hash');
  next.setAttribute('layout', 'sidebar');
  next.setAttribute('hideSchemas', 'true');
  next.setAttribute('hideExport', 'true');
  container.appendChild(next);
  observeViewer();

  if (hashToRestore) {
    // Wait until Stoplight has rendered the sidebar (links appear) before
    // navigating, then re-enable hash persistence.
    applyHashWhenReady(next, hashToRestore);
  } else {
    // No hash to restore; re-enable hash persistence after a short settle.
    setTimeout(() => { _switching = false; }, 600);
  }

  setTimeout(fixRightColScroll, 800);
}

// Poll until the elements-api shadow DOM contains sidebar links, then set the hash.
function applyHashWhenReady(apiEl, hash, attempt) {
  attempt = attempt || 0;
  if (attempt > 40) { _switching = false; return; } // give up after ~2 s

  // Check if Stoplight has rendered at least one sidebar link.
  function hasLinks(el) {
    if (!el) return false;
    if (el.querySelectorAll) {
      const links = el.querySelectorAll('a[href]');
      if (links.length > 0) return true;
    }
    if (el.shadowRoot && hasLinks(el.shadowRoot)) return true;
    for (const c of (el.children || [])) { if (hasLinks(c)) return true; }
    return false;
  }

  if (hasLinks(apiEl)) {
    window.location.hash = hash;
    // Keep _switching on a bit longer so the resulting hashchange is ignored.
    setTimeout(() => { _switching = false; }, 300);
  } else {
    setTimeout(() => applyHashWhenReady(apiEl, hash, attempt + 1), 50);
  }
}

// ---- Right-column scroll following ----------------------------------------
// CSS `position: sticky` cannot work here: the sticky element's own height
// (~774px) nearly fills the scroll-container's scrollHeight (~1291px), so
// sticky "bottoms out" almost immediately leaving most of the page unfollowed.
//
// Instead we listen to the Stoplight scroll container and shift the right
// column down via `transform: translateY` to simulate sticky, clamping so
// it never overflows past the bottom of its HttpOperation.

let scrollListenerCleanup = null;

function findScrollContainer(root) {
  function walk(el) {
    if (!el) return null;
    const children = el.shadowRoot
      ? Array.from(el.shadowRoot.children)
      : Array.from(el.children || []);
    for (const child of children) {
      const cs = window.getComputedStyle(child);
      if (cs.overflowY === 'auto' || cs.overflowY === 'scroll') return child;
      const found = walk(child);
      if (found) return found;
    }
    return null;
  }
  return walk(root);
}

function fixRightColScroll() {
  const root = document.getElementById('api-viewer');
  if (!root) return;

  if (scrollListenerCleanup) { scrollListenerCleanup(); scrollListenerCleanup = null; }

  const sc = findScrollContainer(root);
  if (!sc) return;

  function onScroll() {
    const scrollTop = sc.scrollTop;
    const GAP = 24;

    function walkForOps(el) {
      if (!el) return;
      const ops = el.querySelectorAll ? el.querySelectorAll('.HttpOperation') : [];
      for (const op of ops) {
        for (const child of op.children) {
          if (child.classList.contains('sl-flex') && !child.classList.contains('sl-flex-col')) {
            for (const gc of child.children) {
              if (gc.classList.contains('sl-relative')) {
                const opOffsetTop = op.offsetTop;
                const rightH = gc.offsetHeight;
                const leftH  = op.offsetHeight;
                const raw    = scrollTop - opOffsetTop + GAP;
                const max    = Math.max(0, leftH - rightH - GAP);
                const shift  = Math.min(Math.max(raw, 0), max);
                gc.style.transform = `translateY(${shift}px)`;
              }
            }
          }
        }
      }
      if (el.shadowRoot) walkForOps(el.shadowRoot);
      for (const c of (el.children || [])) walkForOps(c);
    }

    walkForOps(root);
  }

  sc.addEventListener('scroll', onScroll, { passive: true });
  onScroll(); // position correctly on initial load / navigation

  scrollListenerCleanup = () => sc.removeEventListener('scroll', onScroll);
}

// ---------------------------------------------------------------------------
// Hash persistence
// ---------------------------------------------------------------------------
// Stoplight Elements uses React Router which calls history.pushState instead
// of setting location.hash directly, so 'hashchange' never fires.
// We use two complementary strategies:
//   1. 'popstate' — catches browser back/forward and some React Router updates
//   2. A polling interval — catches all React Router pushState navigations
//
// _switching is true while we are programmatically restoring a hash so we
// don't accidentally overwrite the just-restored value.
let _switching = false;
let _lastHash  = '';

function persistHash() {
  if (_switching) return;
  const h = window.location.hash;
  if (h && h !== _lastHash) {
    _lastHash = h;
    const currentTab = localStorage.getItem('iic_active_tab') || DEFAULT_SPEC_FILE;
    localStorage.setItem('iic_hash_' + currentTab, h);
    setTimeout(fixRightColScroll, 400);
    // Re-apply the active server's credentials whenever navigation lands on a
    // new operation page; re-resolve the viewer server first so re-entering an
    // operation reuses the matching server's credentials.
    setTimeout(syncCredentialsWithViewer, 800);
    setTimeout(syncCredentialsWithViewer, 1500);
  }
}

// Single combined synchronization pass: resolve the viewer-selected server into
// the active context, then apply that server's credentials to visible Try It
// fields. All render/navigation hooks funnel through here.
function syncCredentialsWithViewer() {
  syncActiveServerFromViewer();
  applyCredentialsToTryIt();
}

// popstate fires on back/forward navigation
window.addEventListener('popstate', persistHash);

// Poll every 300 ms to catch React Router pushState navigations
setInterval(persistHash, 300);

// ---------------------------------------------------------------------------
// Credential settings modal (per-server Token + Project ID)
// ---------------------------------------------------------------------------
// References to the modal controls, resolved once on load.
const _modal = { overlay: null, body: null };

// Switch the credential context to (file, its resolved active server). Called
// whenever the active spec changes. The modal reads the active spec/server on
// open, so there are no persistent topbar controls to refresh here.
function activateSpecContext(file) {
  activeSpecFile = file;
  activeServerId = resolveServerId(file);
}

// Change the active server within the current spec: persist the choice and
// re-apply credentials to any visible Try It fields. No-op if unchanged.
function selectServer(serverId) {
  if (!serverId || serverId === activeServerId) return;
  setActiveServer(activeSpecFile, serverId);
  applyCredentialsToTryIt();
}

// The credential rows the modal should display for the active spec: one per
// declared server, in display order, or a single fallback row when the spec
// declares no servers. Each row carries the server id, a display title/url and
// the env key whose saved values it edits.
function credentialRowsForActiveSpec() {
  const servers = getServersForSpec(activeSpecFile);
  if (servers.length === 0) {
    return [{
      serverId: FALLBACK_SERVER_ID,
      envKey: FALLBACK_SERVER_ID,
      title: 'Default (no declared server)',
      url: '',
    }];
  }
  return servers.map((srv) => ({
    serverId: srv.id,
    envKey: envKeyForServer(activeSpecFile, srv.id),
    title: srv.label || srv.url,
    url: srv.url || '',
  }));
}

// Build the modal body: one editable Token / Project ID block per server row,
// pre-filled from the saved (or legacy fallback) values. The row matching the
// currently active server is marked so the user can tell which one Try It uses.
// Inputs hold the staged draft; nothing is persisted until Save.
function buildModalRows() {
  const body = _modal.body;
  if (!body) return;
  body.innerHTML = '';
  credentialRowsForActiveSpec().forEach((row) => {
    const cred = credForEnvKey(row.envKey);

    const rowEl = document.createElement('div');
    rowEl.className = 'cred-row' + (row.serverId === activeServerId ? ' active' : '');
    rowEl.dataset.envKey = row.envKey;

    const titleEl = document.createElement('div');
    titleEl.className = 'cred-row-title';
    titleEl.textContent = row.title;
    rowEl.appendChild(titleEl);

    if (row.url) {
      const urlEl = document.createElement('div');
      urlEl.className = 'cred-row-url';
      urlEl.textContent = row.url;
      rowEl.appendChild(urlEl);
    }

    rowEl.appendChild(buildModalField('Token', 'token', cred.token, 'eyJhbGciOiJIU***V_adQssw5c'));
    rowEl.appendChild(buildModalField('Project ID', 'projectId', cred.projectId, 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'));

    body.appendChild(rowEl);
  });
}

// Build a single labelled credential field for the modal. `field` is the
// credential key ('token' | 'projectId') stored in dataset for save time.
function buildModalField(labelText, field, value, placeholder) {
  const wrap = document.createElement('div');
  wrap.className = 'cred-field';

  const label = document.createElement('label');
  label.className = 'cred-field-label';
  label.textContent = labelText;

  const input = document.createElement('input');
  input.className = 'cred-field-input';
  input.type = 'text';
  input.value = value || '';
  input.placeholder = placeholder;
  input.autocomplete = 'off';
  input.spellcheck = false;
  input.dataset.field = field;

  label.appendChild(input);
  wrap.appendChild(label);
  return wrap;
}

// Open the modal, building fresh rows from the current persisted values so the
// draft always starts from the saved state.
function openCredModal() {
  if (!_modal.overlay) return;
  // Make sure the active server reflects the viewer before we render rows.
  syncActiveServerFromViewer();
  buildModalRows();
  _modal.overlay.hidden = false;
}

// Close the modal without persisting (Cancel / overlay / Escape). Draft edits
// live only in the inputs, so discarding is just hiding the modal.
function closeCredModal() {
  if (!_modal.overlay) return;
  _modal.overlay.hidden = true;
}

// Persist the staged modal edits back to the existing credential store in one
// batch, writing each server row to its env key independently. Does NOT change
// the active viewer server. Refreshes visible Try It fields when the currently
// active server's saved values changed.
function saveCredModal() {
  const body = _modal.body;
  if (!body) { closeCredModal(); return; }

  const activeEnvKey = envKeyForServer(activeSpecFile, activeServerId);
  let activeChanged = false;

  body.querySelectorAll('.cred-row').forEach((rowEl) => {
    const envKey = rowEl.dataset.envKey;
    if (!envKey) return;
    const before = credForEnvKey(envKey);
    const next = { token: before.token, projectId: before.projectId };
    rowEl.querySelectorAll('input[data-field]').forEach((inp) => {
      next[inp.dataset.field] = inp.value;
    });
    if (next.token === before.token && next.projectId === before.projectId) return;
    _credStore[envKey] = next;
    if (envKey === activeEnvKey) activeChanged = true;
  });

  localStorage.setItem(CRED_STORE_KEY, JSON.stringify(_credStore));
  closeCredModal();

  // Only re-inject when the server the viewer is currently using was edited.
  if (activeChanged) applyCredentialsToTryIt();
}

// Map an arbitrary rendered text blob to one of the active spec's servers.
// Prefers an exact URL match (longest first to disambiguate trailing-slash
// variants), then an exact label match, then a substring fallback. Returns the
// server object or null. Centralized so the matching rules live in one place.
function matchServerFromText(text) {
  const servers = getServersForSpec(activeSpecFile);
  if (!text || servers.length === 0) return null;
  const t = text.trim();
  const byUrlLen = servers.slice().sort((a, b) => (b.url || '').length - (a.url || '').length);
  for (const s of byUrlLen) if (s.url && t === s.url) return s;
  for (const s of servers)  if (s.label && t === s.label) return s;
  for (const s of byUrlLen) if (s.url && t.includes(s.url)) return s;
  for (const s of servers)  if (s.label && t.includes(s.label)) return s;
  return null;
}

// Resolve the server currently selected inside the Stoplight viewer and make it
// the active credential context. This is the single synchronization path used
// by viewer interactions, re-render hooks and the pre-execution safeguard.
//
// Stoplight renders the chosen server in a "Server:" selector control. We read
// the currently displayed selection text and match it against spec metadata.
// When detection fails we keep the previously resolved active server (safe
// fallback), so a flaky DOM read never clears a valid context.
function syncActiveServerFromViewer() {
  const root = document.getElementById('api-viewer');
  if (!root) return;
  const servers = getServersForSpec(activeSpecFile);
  if (servers.length === 0) return;          // fallback context; nothing to sync

  // The server selector renders as a button/control whose text contains the
  // currently selected server's label or URL. Scan small candidate nodes and
  // take the first that maps to a known server.
  const candidates = deepQueryAll(root, 'button, [role="button"], [aria-haspopup], summary');
  for (const el of candidates) {
    const text = (el.textContent || '').trim();
    if (!text || text.length > 200) continue;
    // Limit to controls that look like the server selector to avoid matching
    // an unrelated URL elsewhere on the page.
    if (!/server/i.test(text) && !matchServerFromText(text)) continue;
    const match = matchServerFromText(text);
    if (match) {
      selectServer(match.id);
      return;
    }
  }
}

// Bidirectional sync with Stoplight's own server selector: when the user picks
// a server from inside the rendered viewer, reflect it into the credential
// context. The (fragile) DOM addressing is isolated here; we match by metadata
// label/url rather than a brittle CSS selector, and never throw.
function attachViewerServerSync() {
  const root = document.getElementById('api-viewer');
  if (!root || root._serverSyncAttached) return;
  root._serverSyncAttached = true;
  root.addEventListener('click', (ev) => {
    let el = ev.target;
    // Walk up only a couple of levels from the clicked leaf so we match a
    // single server menu option, not the whole panel.
    for (let depth = 0; el && el !== root && depth < 3; depth++, el = el.parentElement) {
      const text = el.textContent || '';
      if (text.length > 200) break;           // too large to be a single option
      const match = matchServerFromText(text);
      if (match) {
        // Update the active context in the same interaction cycle so a fast
        // Try It immediately afterwards uses the newly selected server.
        selectServer(match.id);
        return;
      }
    }
  }, true);
}

// Pre-execution safeguard: just before a Try It request is sent, force one last
// active-server resolution and credential re-apply. This closes the race where
// Stoplight updates its selected server slightly later than the user click that
// opens or sends the request, which could otherwise send stale credentials.
//
// The handler runs in the CAPTURE phase so credentials are injected before
// Stoplight's own click handler reads the form and dispatches the request.
function attachTryItPreExecuteSync() {
  const root = document.getElementById('api-viewer');
  if (!root || root._tryItSyncAttached) return;
  root._tryItSyncAttached = true;
  root.addEventListener('click', (ev) => {
    let el = ev.target;
    for (let depth = 0; el && el !== root && depth < 4; depth++, el = el.parentElement) {
      const text = (el.textContent || '').trim().toLowerCase();
      // The Send button is a short control labelled "Send"/"Send Request".
      if ((el.tagName === 'BUTTON' || el.getAttribute && el.getAttribute('role') === 'button')
          && text.length < 40 && /\bsend\b/.test(text)) {
        syncCredentialsWithViewer();
        return;
      }
    }
  }, true);
}

// Initial wiring once the page is ready.
window.addEventListener('load', async () => {
  // --- Wire up the credential settings modal (must happen before any early return) ---
  (function initCredentialModal() {
    _modal.overlay = document.getElementById('cred-modal-overlay');
    _modal.body    = document.getElementById('cred-modal-body');

    const openBtn   = document.getElementById('cred-settings-btn');
    const closeBtn  = document.getElementById('cred-modal-close');
    const cancelBtn = document.getElementById('cred-modal-cancel');
    const saveBtn   = document.getElementById('cred-modal-save');

    if (openBtn)   openBtn.addEventListener('click', openCredModal);
    if (closeBtn)  closeBtn.addEventListener('click', closeCredModal);
    if (cancelBtn) cancelBtn.addEventListener('click', closeCredModal);
    if (saveBtn)   saveBtn.addEventListener('click', saveCredModal);

    // Click on the dimmed overlay (outside the dialog) closes without saving.
    if (_modal.overlay) {
      _modal.overlay.addEventListener('click', (ev) => {
        if (ev.target === _modal.overlay) closeCredModal();
      });
    }
    // Escape closes the modal without saving.
    document.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape' && _modal.overlay && !_modal.overlay.hidden) {
        closeCredModal();
      }
    });
  })();
  // Resolve the spec list (injected list, specs.json, or fallback) first,
  // then build the tab bar from it. The credential context is initialized by
  // switchApi() -> activateSpecContext() once the active spec is known.
  await resolveSpecs();
  buildTabs();

  const knownFiles = SPECS.map((s) => s.file);
  let savedTab = localStorage.getItem('iic_active_tab');
  // Ignore a stale saved tab whose spec no longer exists.
  if (savedTab && !knownFiles.includes(savedTab)) savedTab = null;

  if (savedTab) {
    // Find the tab button for the saved spec file.
    const btn = Array.from(document.querySelectorAll('.tab-btn')).find(
      (b) => b.dataset.file === savedTab
    );
    if (btn) {
      // Mark it active (buildTabs activates the first tab by default).
      document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      // Restore collapse state for this tab before switching.
      loadCollapseState(savedTab);
      // Switch to the saved tab and restore the per-tab saved hash.
      const savedHash = localStorage.getItem('iic_hash_' + savedTab) || '';
      switchApi(savedTab, btn, savedHash);
      return;
    }
  }

  // Default: first tab — load it via switchApi so the (now spec-less) initial
  // <elements-api> element actually receives a spec on first paint.
  const firstBtn = document.querySelector('.tab-btn');
  localStorage.setItem('iic_active_tab', DEFAULT_SPEC_FILE);
  loadCollapseState(DEFAULT_SPEC_FILE);
  if (firstBtn) {
    switchApi(DEFAULT_SPEC_FILE, firstBtn, '');
  } else {
    observeViewer();
  }
  setTimeout(fixRightColScroll, 800);
});
