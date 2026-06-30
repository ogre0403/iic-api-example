// ---------------------------------------------------------------------------
// Credentials: token & project-id stored in localStorage, auto-injected into
// Stoplight Elements Try It fields on every render / spec switch.
// ---------------------------------------------------------------------------
const CRED_KEYS = { token: 'iic_cred_token', projectId: 'iic_cred_project_id' };

const credentials = {
  token:     localStorage.getItem(CRED_KEYS.token)     || '',
  projectId: localStorage.getItem(CRED_KEYS.projectId) || '',
};

// Save a single credential key and update the in-memory object.
function saveCred(key, value) {
  credentials[key] = value;
  localStorage.setItem(CRED_KEYS[key], value);
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

// Clear Try It fields matching the given label keyword (used when a credential is deleted).
function clearTryItFields(keyword) {
  const root = document.getElementById('api-viewer');
  if (!root) return;
  const inputs = findInputsByLabel(root, keyword);
  inputs.forEach((inp) => {
    if (inp.id === 'cred-project-id' || inp.id === 'cred-token') return;
    if (!inp.value) return;
    if (inp instanceof HTMLTextAreaElement) {
      setNativeTextareaValue(inp, '');
    } else {
      setNativeInputValue(inp, '');
    }
  });
}

// Apply stored credentials into all visible Try It inputs.
function applyCredentialsToTryIt() {
  const root = document.getElementById('api-viewer');
  if (!root) return;

  // --- Bearer token ---
  // Stoplight renders a "token" input (type=password or text) for bearerAuth.
  // It may appear with labels like "token", "bearerAuth", "Authorization", etc.
  if (credentials.token) {
    const tokenInputs = findInputsByLabel(root, 'token');
    tokenInputs.forEach((inp) => {
      // Avoid overwriting if user has already typed something different.
      if (inp.value === credentials.token) return;
      if (inp instanceof HTMLTextAreaElement) {
        setNativeTextareaValue(inp, credentials.token);
      } else {
        setNativeInputValue(inp, credentials.token);
      }
    });
  }

  // --- project-id ---
  // project-id may appear as a path param, query param or header.
  // We fill any input whose identifier contains "project" (but NOT the topbar
  // input itself, which has id="cred-project-id" and is outside the viewer).
  if (credentials.projectId) {
    const projInputs = findInputsByLabel(root, 'project');
    projInputs.forEach((inp) => {
      if (inp.id === 'cred-project-id') return; // skip our own topbar input
      if (inp.value === credentials.projectId) return;
      if (inp instanceof HTMLTextAreaElement) {
        setNativeTextareaValue(inp, credentials.projectId);
      } else {
        setNativeInputValue(inp, credentials.projectId);
      }
    });
  }
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
  // Insert tabs before the cred-group so they sit right after the title.
  const credGroup = bar.querySelector('#cred-group');
  SPECS.forEach((spec, i) => {
    const btn = document.createElement('button');
    btn.className = 'tab-btn' + (i === 0 ? ' active' : '');
    btn.textContent = spec.label || spec.file;
    btn.dataset.file = spec.file;
    btn.addEventListener('click', () => switchApi(spec.file, btn));
    if (credGroup) {
      bar.insertBefore(btn, credGroup);
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
    }, 50);
  });
  observer.observe(root, { childList: true, subtree: true });
  applyGrouping();
  expandGroupForHash();
  // Apply saved credentials whenever the viewer re-renders.
  applyCredentialsToTryIt();
}

function switchApi(file, el, restoreHash) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  el.classList.add('active');
  // Persist the selected tab so it survives a page refresh.
  localStorage.setItem('iic_active_tab', file);
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
    // Re-apply credentials whenever navigation lands on a new operation page.
    setTimeout(applyCredentialsToTryIt, 800);
    setTimeout(applyCredentialsToTryIt, 1500);
  }
}

// popstate fires on back/forward navigation
window.addEventListener('popstate', persistHash);

// Poll every 300 ms to catch React Router pushState navigations
setInterval(persistHash, 300);

// Helper to format token with first 10 and last 10 characters visible, middle replaced with ***
function formatToken(token) {
  if (!token) return '';
  if (token.length <= 20) return token;
  return token.substring(0, 10) + '***' + token.substring(token.length - 10);
}

// Initial wiring once the page is ready.
window.addEventListener('load', async () => {
  // --- Wire up credential inputs in the topbar (must happen before any early return) ---
  (function initCredentialInputs() {
    const tokenInput     = document.getElementById('cred-token');
    const projectIdInput = document.getElementById('cred-project-id');

    if (tokenInput) {
      // Restore persisted value into the topbar input with formatted display.
      tokenInput.value = formatToken(credentials.token);
      
      // Show full token while focused.
      tokenInput.addEventListener('focus', () => {
        tokenInput.value = credentials.token;
      });
      
      // Show formatted token when blurred.
      tokenInput.addEventListener('blur',  () => {
        tokenInput.value = formatToken(credentials.token);
      });

      tokenInput.addEventListener('input', () => {
        const val = tokenInput.value;
        saveCred('token', val);
        if (val) {
          applyCredentialsToTryIt();
        } else {
          clearTryItFields('token');
        }
      });
    }

    if (projectIdInput) {
      projectIdInput.value = credentials.projectId;
      projectIdInput.addEventListener('input', () => {
        const val = projectIdInput.value;
        saveCred('projectId', val);
        if (val) {
          applyCredentialsToTryIt();
        } else {
          clearTryItFields('project');
        }
      });
    }
  })();
  // Resolve the spec list (injected list, specs.json, or fallback) first,
  // then build the tab bar from it.
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
