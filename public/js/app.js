let activeCategory = '';
let activeBrand = '';
let searchMode = 'hybrid'; // 'hybrid' | 'keyword'

const searchInput = document.getElementById('searchInput');
const autocompleteDropdown = document.getElementById('autocompleteDropdown');
const hitsGrid = document.getElementById('hitsGrid');
const dslInspector = document.getElementById('dslInspector');
const analyticsView = document.getElementById('analyticsView');
const statusMeta = document.getElementById('statusMeta');

const categoryPills = document.getElementById('categoryPills');
const brandPills = document.getElementById('brandPills');
const priceRange = document.getElementById('priceRange');
const priceLabel = document.getElementById('priceLabel');
const sortSelect = document.getElementById('sortSelect');
const inStockOnly = document.getElementById('inStockOnly');
const modeBtnHybrid = document.getElementById('modeBtnHybrid');
const modeBtnKeyword = document.getElementById('modeBtnKeyword');
const btnReindex = document.getElementById('btnReindex');

const tabHits = document.getElementById('tabHits');
const tabDsl = document.getElementById('tabDsl');
const tabAnalytics = document.getElementById('tabAnalytics');

// Tab Switching
tabHits.onclick = () => switchTab('hits');
tabDsl.onclick = () => switchTab('dsl');
tabAnalytics.onclick = () => switchTab('analytics');

function switchTab(target) {
  [tabHits, tabDsl, tabAnalytics].forEach(btn => btn.classList.remove('active'));
  hitsGrid.style.display = 'none';
  dslInspector.style.display = 'none';
  analyticsView.style.display = 'none';

  if (target === 'hits') {
    tabHits.classList.add('active');
    hitsGrid.style.display = 'grid';
  } else if (target === 'dsl') {
    tabDsl.classList.add('active');
    dslInspector.style.display = 'block';
  } else if (target === 'analytics') {
    tabAnalytics.classList.add('active');
    analyticsView.style.display = 'flex';
  }
}

// Mode Toggle
modeBtnHybrid.onclick = () => {
  searchMode = 'hybrid';
  modeBtnHybrid.classList.add('active');
  modeBtnKeyword.classList.remove('active');
  executeSearch();
};

modeBtnKeyword.onclick = () => {
  searchMode = 'keyword';
  modeBtnKeyword.classList.add('active');
  modeBtnHybrid.classList.remove('active');
  executeSearch();
};

// Zero-Downtime Reindex Handler
btnReindex.onclick = async () => {
  showToast('Starting Zero-Downtime Alias Reindexing...');
  try {
    const res = await fetch('/api/v1/admin/reindex', { method: 'POST' });
    const data = await res.json();
    showToast(` Reindexed! Alias switched from ${data.migration.oldIndex} ➔ ${data.migration.newIndex}`);
    executeSearch();
  } catch (err) {
    showToast('Reindex error: ' + err.message);
  }
};

async function executeSearch() {
  const q = searchInput.value.trim();
  const params = new URLSearchParams();
  if (q) params.append('q', q);
  if (activeCategory) params.append('category', activeCategory);
  if (activeBrand) params.append('brand', activeBrand);
  if (priceRange.value < 3500) params.append('maxPrice', priceRange.value);
  if (inStockOnly.checked) params.append('inStock', 'true');
  params.append('mode', searchMode);
  if (sortSelect.value) params.append('sort', sortSelect.value);

  try {
    const res = await fetch(`/api/v1/search?${params.toString()}`);
    const data = await res.json();

    dslInspector.textContent = JSON.stringify(data.queryExecuted, null, 2);
    statusMeta.textContent = `[Mode: ${searchMode.toUpperCase()}] ${data.total} hits in ${data.took}ms`;

    renderHits(data.hits);
    renderFacets(data.aggregations);
    renderAnalytics(data.aggregations);
  } catch (err) {
    hitsGrid.innerHTML = `<div style="grid-column: 1/-1; text-align: center; color: var(--text-muted);">Search Error: ${err.message}</div>`;
  }
}

function renderHits(hits) {
  if (!hits || hits.length === 0) {
    hitsGrid.innerHTML = `<div style="grid-column: 1/-1; text-align: center; padding: 4rem; color: var(--text-muted);"><h3>No matching items found</h3></div>`;
    return;
  }

  hitsGrid.innerHTML = hits.map(p => {
    const titleHtml = p.highlight?.title ? p.highlight.title[0] : p.title;
    const descHtml = p.highlight?.description ? p.highlight.description[0] : p.description;

    return `
      <div class="product-card">
        <div class="card-header">
          <span class="badge badge-cat">${p.category} • ${p.brand}</span>
          <span class="badge badge-score" title="Lucene / Vector Score">_score: ${p.score ? p.score.toFixed(2) : '1.00'}</span>
        </div>
        <h3>${titleHtml}</h3>
        <p>${descHtml}</p>
        <div class="card-footer">
          <span class="price">$${p.price.toFixed(2)}</span>
          <span class="stock-tag ${p.in_stock ? 'in-stock' : 'out-stock'}">
            ${p.in_stock ? 'In Stock' : 'Out of Stock'}
          </span>
        </div>
      </div>
    `;
  }).join('');
}

function renderFacets(aggs) {
  if (!aggs) return;

  // Categories
  const catBuckets = aggs.categories?.buckets || [];
  categoryPills.innerHTML = `<div class="pill ${!activeCategory ? 'active' : ''}" data-cat="">All</div>` +
    catBuckets.map(b => `<div class="pill ${activeCategory === b.key ? 'active' : ''}" data-cat="${b.key}">${b.key} (${b.doc_count})</div>`).join('');

  categoryPills.querySelectorAll('.pill').forEach(pill => {
    pill.onclick = () => { activeCategory = pill.dataset.cat; executeSearch(); };
  });

  // Brands
  const brandBuckets = aggs.brands?.buckets || [];
  brandPills.innerHTML = `<div class="pill ${!activeBrand ? 'active' : ''}" data-brand="">All</div>` +
    brandBuckets.map(b => `<div class="pill ${activeBrand === b.key ? 'active' : ''}" data-brand="${b.key}">${b.key} (${b.doc_count})</div>`).join('');

  brandPills.querySelectorAll('.pill').forEach(pill => {
    pill.onclick = () => { activeBrand = pill.dataset.brand; executeSearch(); };
  });
}

function renderAnalytics(aggs) {
  if (!aggs) return;
  const stats = aggs.price_stats || {};

  document.getElementById('statCount').textContent = stats.count || 0;
  document.getElementById('statAvg').textContent = stats.avg ? `$${stats.avg.toFixed(2)}` : '$0';
  document.getElementById('statMin').textContent = stats.min ? `$${stats.min.toFixed(2)}` : '$0';
  document.getElementById('statMax').textContent = stats.max ? `$${stats.max.toFixed(2)}` : '$0';
}

// Instant Autocomplete
let debounceTimer;
searchInput.addEventListener('input', (e) => {
  clearTimeout(debounceTimer);
  const val = e.target.value.trim();

  debounceTimer = setTimeout(async () => {
    executeSearch();

    if (val.length < 2) {
      autocompleteDropdown.style.display = 'none';
      return;
    }

    try {
      const res = await fetch(`/api/v1/autocomplete?q=${encodeURIComponent(val)}`);
      const data = await res.json();

      if (data.suggestions && data.suggestions.length > 0) {
        autocompleteDropdown.innerHTML = data.suggestions.map(s => `
          <div class="autocomplete-item" data-title="${s.title}">
            <div>
              <strong>${s.title}</strong>
              <div style="font-size: 0.75rem; color: #94a3b8;">${s.brand} • ${s.category}</div>
            </div>
            <span>$${s.price.toFixed(2)}</span>
          </div>
        `).join('');
        autocompleteDropdown.style.display = 'block';

        autocompleteDropdown.querySelectorAll('.autocomplete-item').forEach(item => {
          item.onclick = () => {
            searchInput.value = item.dataset.title;
            autocompleteDropdown.style.display = 'none';
            executeSearch();
          };
        });
      } else {
        autocompleteDropdown.style.display = 'none';
      }
    } catch (_) {}
  }, 200);
});

document.addEventListener('click', (e) => {
  if (!e.target.closest('.search-wrapper')) {
    autocompleteDropdown.style.display = 'none';
  }
});

priceRange.oninput = (e) => {
  priceLabel.textContent = e.target.value >= 3500 ? 'Any' : `≤ $${e.target.value}`;
};
priceRange.onchange = () => executeSearch();
sortSelect.onchange = () => executeSearch();
inStockOnly.onchange = () => executeSearch();

function showToast(msg) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.style.display = 'block';
  setTimeout(() => { toast.style.display = 'none'; }, 4000);
}

// Initial Load
executeSearch();
