/**
 * 商品查询网站 - 核心应用逻辑
 * 单页应用 (SPA) 路由、搜索、筛选、对比、历史管理
 */

// ===== State =====
const state = {
  currentPage: 'home',
  searchQuery: '',
  searchType: 'keyword',
  sortBy: 'default',
  viewMode: 'grid',      // 'grid' | 'list'
  filters: {
    categories: [],
    brands: [],
    priceMin: '',
    priceMax: '',
    tags: [],
    inStock: false
  },
  compareList: JSON.parse(localStorage.getItem('compareList') || '[]'),
  favorites: JSON.parse(localStorage.getItem('favorites') || '[]'),
  searchHistory: JSON.parse(localStorage.getItem('searchHistory') || '[]'),
  currentProduct: null,
  currentPageNum: 1,
  pageSize: 12,
  filteredProducts: []
};

// ===== DOM Cache =====
const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];
// Make globally accessible for inline onclick handlers
window.$ = $;
window.$$ = $$;

// ===== Toast =====
function showToast(msg) {
  let toast = $('.toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.className = 'toast';
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.classList.add('show');
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => toast.classList.remove('show'), 2200);
}

// ===== Page Navigation =====
function navigate(page, data) {
  $$('.page').forEach(p => p.classList.remove('active'));
  const target = $(`#page-${page}`);
  if (target) target.classList.add('active');
  $$('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.page === page));
  state.currentPage = page;
  window.scrollTo({ top: 0, behavior: 'smooth' });

  if (page === 'detail' && data) {
    renderDetail(data);
  } else if (page === 'results') {
    if (data) {
      state.searchQuery = data.query || state.searchQuery;
      state.searchType = data.type || state.searchType;
    } else {
      // Browsing from nav — reset filters but keep query
      state.filters = { categories: [], brands: [], priceMin: '', priceMax: '', tags: [], inStock: false };
      if (!state.sortBy) state.sortBy = 'default';
    }
    // Sync results page search input
    const resultsSearch = $('#results-search-input');
    if (resultsSearch) resultsSearch.value = state.searchQuery;
    performSearch();
  } else if (page === 'compare') {
    renderComparePage();
  } else if (page === 'history') {
    renderHistoryPage();
  } else if (page === 'home') {
    const homeInput = $('#search-input');
    if (homeInput) homeInput.value = state.searchQuery;
    renderHomeCategories();
    renderHotProducts();
  }
}

// ===== Search =====
function performSearch(pageNum) {
  if (pageNum) state.currentPageNum = pageNum;
  const query = state.searchQuery.trim().toLowerCase();

  if (!query) {
    state.filteredProducts = [...PRODUCTS];
  } else {
    state.filteredProducts = PRODUCTS.filter(p => {
      switch (state.searchType) {
        case 'keyword':
          return p.name.toLowerCase().includes(query) ||
                 p.brand.toLowerCase().includes(query) ||
                 p.description.toLowerCase().includes(query) ||
                 p.category.toLowerCase().includes(query);
        case 'id':
          return p.id.toLowerCase() === query;
        case 'barcode':
          return p.id.includes(query);
        default:
          return p.name.toLowerCase().includes(query);
      }
    });
  }

  applyFiltersAndSort();
}

function applyFiltersAndSort() {
  let results = [...state.filteredProducts];
  const f = state.filters;

  // Category filter
  if (f.categories.length > 0) {
    results = results.filter(p => f.categories.includes(p.category));
  }
  // Brand filter
  if (f.brands.length > 0) {
    results = results.filter(p => f.brands.includes(p.brand));
  }
  // Price range
  if (f.priceMin) results = results.filter(p => p.price >= Number(f.priceMin));
  if (f.priceMax) results = results.filter(p => p.price <= Number(f.priceMax));
  // Tags
  if (f.tags.length > 0) {
    results = results.filter(p => f.tags.some(t => p.tags.includes(t)));
  }
  // In stock
  if (f.inStock) {
    results = results.filter(p => p.stock > 0);
  }

  // Sorting
  switch (state.sortBy) {
    case 'price-asc': results.sort((a, b) => a.price - b.price); break;
    case 'price-desc': results.sort((a, b) => b.price - a.price); break;
    case 'sales': results.sort((a, b) => b.sales - a.sales); break;
    case 'rating': results.sort((a, b) => b.rating - a.rating); break;
    case 'discount': results.sort((a, b) => (b.originalPrice - b.price) / b.originalPrice - (a.originalPrice - a.price) / a.originalPrice); break;
    case 'newest': results.sort((a, b) => (b.tags.includes('新品') ? 1 : 0) - (a.tags.includes('新品') ? 1 : 0)); break;
    default: break;
  }

  state.filteredProducts = results;
  renderResults();
  updateFilterUI();
}

// ===== Render Results =====
function renderResults() {
  const container = $('#results-container');
  if (!container) return;

  const results = state.filteredProducts;
  const total = results.length;
  const pageSize = state.pageSize;
  const totalPages = Math.ceil(total / pageSize) || 1;
  const page = Math.min(state.currentPageNum, totalPages);
  const start = (page - 1) * pageSize;
  const pageItems = results.slice(start, start + pageSize);

  // Update counts
  $('#results-count').innerHTML = `共找到 <strong>${total}</strong> 件商品`;
  $('#results-range').textContent = total > 0 ? `显示 ${start + 1}-${Math.min(start + pageSize, total)}` : '';

  if (total === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🔍</div>
        <h3>未找到相关商品</h3>
        <p>请尝试其他关键词或调整筛选条件</p>
      </div>
    `;
    $('#pagination').innerHTML = '';
    return;
  }

  const isList = state.viewMode === 'list';
  container.className = `product-grid ${isList ? 'list-view' : ''}`;

  container.innerHTML = pageItems.map(p => renderProductCard(p, isList)).join('');

  // Pagination
  renderPagination(page, totalPages);
}

function renderProductCard(p, isList) {
  const isFav = state.favorites.includes(p.id);
  const inCompare = state.compareList.some(c => c.id === p.id);
  const stockClass = p.stock > 50 ? 'in-stock' : p.stock > 0 ? 'low-stock' : 'out-of-stock';
  const stockText = p.stock > 50 ? '库存充足' : p.stock > 0 ? `仅剩${p.stock}件` : '暂时缺货';

  const badges = p.tags.map(t => {
    if (t === '新品') return '<span class="badge badge-new">新品</span>';
    if (t === '热销') return '<span class="badge badge-hot">热销</span>';
    if (t === '特价') return '<span class="badge badge-sale">特价</span>';
    if (t === '正品保障') return '<span class="badge badge-guarantee">正品</span>';
    if (t === '包邮') return '<span class="badge badge-free-ship">包邮</span>';
    return '';
  }).join('');

  const discountTag = p.discount < 10
    ? `<span class="card-discount">${(10 - p.discount).toFixed(0)}折</span>`
    : '';

  const stars = renderStars(p.rating);

  const actionBtns = isList ? '' : `
    <div class="card-actions">
      <button class="card-action-btn" onclick="event.stopPropagation();addToCompare('${p.id}')" ${inCompare ? 'disabled style="opacity:0.5"' : ''}>
        ${inCompare ? '✓ 已对比' : '📊 对比'}
      </button>
      <button class="card-action-btn" onclick="event.stopPropagation();toggleFavorite('${p.id}')">
        ${isFav ? '❤️' : '🤍'} 收藏
      </button>
      <button class="card-action-btn primary" onclick="event.stopPropagation();viewDetail('${p.id}')">
        🔍 详情
      </button>
    </div>
  `;

  const tagsHtml = p.tags.length > 0
    ? `<div class="card-tags">${p.tags.map(t => `<span class="card-tag">${t}</span>`).join('')}</div>`
    : '';

  return `
    <div class="product-card" onclick="viewDetail('${p.id}')">
      <div style="position:relative;">
        <img class="card-image" src="${p.image}" alt="${p.name}" loading="lazy"
             onerror="this.src='https://picsum.photos/seed/placeholder${p.id}/400/400'">
        <div class="card-badges">${badges}</div>
      </div>
      <div class="card-body">
        <div class="card-name">${p.name}</div>
        <div class="card-brand">${p.brand} · ${p.category}</div>
        <div class="card-price-row">
          <span class="card-price"><span class="currency">¥</span>${p.price.toLocaleString()}</span>
          ${p.originalPrice > p.price ? `<span class="card-original-price">¥${p.originalPrice.toLocaleString()}</span>` : ''}
          ${discountTag}
        </div>
        <div class="card-meta">
          <div class="card-rating">${stars} <span>(${p.sales.toLocaleString()}人已购)</span></div>
          <div class="card-stock ${stockClass}">${stockText}</div>
        </div>
        ${tagsHtml}
        ${actionBtns}
      </div>
    </div>
  `;
}

function renderStars(rating) {
  const full = Math.floor(rating);
  const decimal = rating - full;
  let s = '';
  for (let i = 0; i < 5; i++) {
    if (i < full) s += '★';
    else if (i === full && decimal >= 0.3) s += '★';
    else s += '☆';
  }
  return s;
}

function renderPagination(current, total) {
  const container = $('#pagination');
  if (!container || total <= 1) {
    if (container) container.innerHTML = '';
    return;
  }

  let html = `<button class="page-btn" onclick="goToPage(${current - 1})" ${current <= 1 ? 'disabled' : ''}>‹</button>`;

  let startPage = Math.max(1, current - 2);
  let endPage = Math.min(total, current + 2);
  if (startPage > 1) {
    html += `<button class="page-btn" onclick="goToPage(1)">1</button>`;
    if (startPage > 2) html += `<span class="page-btn disabled">…</span>`;
  }
  for (let i = startPage; i <= endPage; i++) {
    html += `<button class="page-btn ${i === current ? 'active' : ''}" onclick="goToPage(${i})">${i}</button>`;
  }
  if (endPage < total) {
    if (endPage < total - 1) html += `<span class="page-btn disabled">…</span>`;
    html += `<button class="page-btn" onclick="goToPage(${total})">${total}</button>`;
  }

  html += `<button class="page-btn" onclick="goToPage(${current + 1})" ${current >= total ? 'disabled' : ''}>›</button>`;
  container.innerHTML = html;
}

function goToPage(n) {
  state.currentPageNum = n;
  performSearch();
  window.scrollTo({ top: $('.results-header').offsetTop - 80, behavior: 'smooth' });
}

// ===== Detail Page =====
function viewDetail(id) {
  const product = PRODUCTS.find(p => p.id === id);
  if (!product) return;
  state.currentProduct = product;
  navigate('detail', product);

  // Add to history
  addSearchHistory(product.name);
  // Save visited
  const visited = JSON.parse(localStorage.getItem('visitedProducts') || '[]');
  if (!visited.includes(id)) {
    visited.unshift(id);
    if (visited.length > 50) visited.pop();
    localStorage.setItem('visitedProducts', JSON.stringify(visited));
  }
}

function renderDetail(product) {
  if (!product) return;

  // Breadcrumb
  $('#detail-breadcrumb').innerHTML = `
    <a href="#" onclick="event.preventDefault(); navigate('home')">首页</a>
    <span> / </span>
    <a href="#" onclick="event.preventDefault(); state.searchQuery='${product.category}'; navigate('results')">${product.category}</a>
    <span> / </span>
    <span>${product.name}</span>
  `;

  // Gallery
  $('#detail-main-image').src = product.image;
  $('#detail-main-image').alt = product.name;

  const thumbs = [product.image, ...['1','2','3'].map(i => product.image.replace('/400/400', `/400/400?sig=${i}`))];
  $('#detail-thumbnails').innerHTML = thumbs.map((src, i) =>
    `<img class="detail-thumb ${i === 0 ? 'active' : ''}" src="${src}" alt=""
          onerror="this.src='https://picsum.photos/seed/${product.id}-${i}/400/400'"
          onclick="document.getElementById('detail-main-image').src=this.src; $$('.detail-thumb').forEach(t=>t.classList.remove('active')); this.classList.add('active')">`
  ).join('');

  // Info
  $('#detail-name').textContent = product.name;
  $('#detail-brand-tag').textContent = product.brand;
  $('#detail-id').textContent = `商品编号: ${product.id}`;
  $('#detail-desc').textContent = product.description;

  // Price
  $('#detail-price').innerHTML = `<span class="currency">¥</span>${product.price.toLocaleString()}`;
  if (product.originalPrice > product.price) {
    $('#detail-original-price').innerHTML = `¥${product.originalPrice.toLocaleString()}`;
    $('#detail-original-price').style.display = 'inline';
    $('#detail-discount').textContent = `${(10 - product.discount).toFixed(1)}折`;
    $('#detail-discount').style.display = 'inline';
  } else {
    $('#detail-original-price').style.display = 'none';
    $('#detail-discount').style.display = 'none';
  }

  // Savings
  const savedAmount = product.originalPrice - product.price;
  $('#detail-savings').textContent = savedAmount > 0 ? `比原价省 ¥${savedAmount.toLocaleString()}` : '';

  // Stock
  const stockDot = $('#stock-dot');
  const stockText = $('#stock-text');
  if (product.stock > 50) {
    stockDot.className = 'stock-dot';
    stockText.textContent = `库存充足 (${product.stock}件)`;
  } else if (product.stock > 0) {
    stockDot.className = 'stock-dot low';
    stockText.textContent = `库存紧张 (仅剩${product.stock}件)`;
  } else {
    stockDot.className = 'stock-dot none';
    stockText.textContent = '暂时缺货';
  }

  // Sales & Rating
  $('#detail-sales').textContent = `已售 ${product.sales.toLocaleString()}`;
  $('#detail-rating').innerHTML = `${renderStars(product.rating)} ${product.rating} 分`;

  // Specs
  const specsHtml = Object.entries(product.specs).map(([k, v]) =>
    `<div class="detail-spec-item"><span class="spec-label">${k}</span><span class="spec-value">${v}</span></div>`
  ).join('');
  $('#detail-specs').innerHTML = specsHtml;

  // Full specs table
  const fullSpecsHtml = Object.entries(product.specs).map(([k, v]) =>
    `<tr><td>${k}</td><td>${v}</td></tr>`
  ).join('');
  $('#full-specs-table').innerHTML = fullSpecsHtml;

  // Service info
  $('#detail-warranty').textContent = product.warranty || '全国联保';
  $('#detail-delivery').textContent = product.delivery || '预计2-3天';
  $('#detail-return').textContent = product.returnPolicy || '7天无理由';

  // Price history
  if (product.priceHistory && product.priceHistory.length > 0) {
    const prices = product.priceHistory;
    const maxPrice = Math.max(...prices.map(p => p.price));
    const minPrice = Math.min(...prices.map(p => p.price));
    const range = maxPrice - minPrice || 1;

    const chartHtml = prices.map(p => {
      const height = ((p.price - minPrice) / range * 80 + 20);
      return `
        <div class="price-bar">
          <div class="price-bar-inner" style="height:${height}px;background:${p.price === Math.min(...prices.map(x=>x.price)) ? 'var(--danger)' : 'var(--primary)'};">
          </div>
          <span class="price-bar-value">¥${p.price.toLocaleString()}</span>
          <span class="price-bar-date">${p.date.slice(5)}</span>
        </div>
      `;
    }).join('');
    $('#price-history-chart').innerHTML = chartHtml;
  }

  const inCompare = state.compareList.some(c => c.id === product.id);
  $('#detail-compare-btn').textContent = inCompare ? '✓ 已在对比列表' : '📊 加入对比';
  $('#detail-compare-btn').onclick = () => addToCompare(product.id);

  const isFav = state.favorites.includes(product.id);
  $('#detail-fav-btn').textContent = isFav ? '❤️ 已收藏' : '🤍 收藏';
  $('#detail-fav-btn').onclick = () => toggleFavorite(product.id);

  // Related products
  renderRelatedProducts(product);
}

function renderRelatedProducts(product) {
  const related = PRODUCTS.filter(p =>
    p.id !== product.id &&
    (p.category === product.category || p.brand === product.brand)
  ).slice(0, 4);

  const container = $('#related-products');
  if (related.length === 0) {
    container.parentElement.style.display = 'none';
    return;
  }
  container.parentElement.style.display = 'block';
  container.innerHTML = related.map(p => renderProductCard(p)).join('');
}

// ===== Compare =====
function addToCompare(id) {
  const product = PRODUCTS.find(p => p.id === id);
  if (!product) return;

  if (state.compareList.some(c => c.id === id)) {
    showToast('该商品已在对比列表中');
    return;
  }
  if (state.compareList.length >= 4) {
    showToast('对比列表最多添加4件商品');
    return;
  }
  state.compareList.push(product);
  localStorage.setItem('compareList', JSON.stringify(state.compareList));
  showToast('已加入对比列表');
  renderCompareBadge();
  // Refresh current view
  if (state.currentPage === 'results') renderResults();
  if (state.currentPage === 'detail' && state.currentProduct) renderDetail(state.currentProduct);
}

function removeFromCompare(id) {
  state.compareList = state.compareList.filter(c => c.id !== id);
  localStorage.setItem('compareList', JSON.stringify(state.compareList));
  renderCompareBadge();
  if (state.currentPage === 'compare') renderComparePage();
  if (state.currentPage === 'results') renderResults();
  if (state.currentPage === 'detail' && state.currentProduct) renderDetail(state.currentProduct);
  showToast('已移出对比列表');
}

function renderCompareBadge() {
  const badge = $('#compare-badge');
  if (badge) {
    badge.textContent = state.compareList.length || '';
    badge.style.display = state.compareList.length > 0 ? 'inline' : 'none';
  }
}

function renderComparePage() {
  const container = $('#compare-container');
  if (!container) return;

  if (state.compareList.length === 0) {
    container.innerHTML = `
      <div class="compare-empty">
        <div class="compare-empty-icon">📊</div>
        <h3>对比列表为空</h3>
        <p>在商品列表中点击「对比」按钮添加商品，最多可同时对比 4 件商品</p>
      </div>
    `;
    return;
  }

  const items = state.compareList;
  const fields = [
    { label: '商品信息', render: p => `<img class="compare-image" src="${p.image}" onerror="this.src='https://picsum.photos/seed/placeholder${p.id}/400/400'"><div class="compare-product-name">${p.name}</div>` },
    { label: '品牌', render: p => p.brand },
    { label: '分类', render: p => p.category },
    { label: '价格', render: p => `<div class="compare-price">¥${p.price.toLocaleString()}</div>${p.originalPrice > p.price ? `<s style="font-size:12px;color:var(--text-light)">¥${p.originalPrice.toLocaleString()}</s>` : ''}` },
    { label: '折扣', render: p => p.discount < 10 ? `${(10 - p.discount).toFixed(0)}折` : '无折扣' },
    { label: '库存', render: p => p.stock > 50 ? '充足' : p.stock > 0 ? `仅剩${p.stock}件` : '缺货' },
    { label: '评分', render: p => `${renderStars(p.rating)} ${p.rating}` },
    { label: '销量', render: p => `${p.sales.toLocaleString()}` },
    { label: '保修', render: p => p.warranty || '全国联保' },
    { label: '配送', render: p => p.delivery || '标准配送' },
    { label: '退换货', render: p => p.returnPolicy || '7天无理由' },
    { label: '操作', render: p => `<button class="compare-remove" onclick="removeFromCompare('${p.id}')">移除</button>` },
  ];

  // Add specs
  const allSpecKeys = [...new Set(items.flatMap(p => Object.keys(p.specs)))];
  allSpecKeys.forEach(key => {
    fields.push({
      label: key,
      render: p => p.specs[key] || '—'
    });
  });

  let html = `<div class="compare-table-wrapper"><table class="compare-table"><thead><tr><th>参数</th>`;
  items.forEach(p => {
    html += `<th><button class="compare-remove" onclick="removeFromCompare('${p.id}')">✕ 移除</button></th>`;
  });
  html += `</tr></thead><tbody>`;

  fields.forEach(field => {
    html += `<tr><th>${field.label}</th>`;
    const values = items.map(p => field.render(p));
    const cellHtml = values.map(v => `<td>${v}</td>`).join('');
    html += cellHtml;
    html += `</tr>`;
  });

  html += `</tbody></table></div>`;
  container.innerHTML = html;
}

// ===== Favorites =====
function toggleFavorite(id) {
  const idx = state.favorites.indexOf(id);
  if (idx > -1) {
    state.favorites.splice(idx, 1);
    showToast('已取消收藏');
  } else {
    state.favorites.push(id);
    showToast('已收藏');
  }
  localStorage.setItem('favorites', JSON.stringify(state.favorites));
  if (state.currentPage === 'results') renderResults();
  if (state.currentPage === 'detail' && state.currentProduct) renderDetail(state.currentProduct);
}

// ===== History =====
function addSearchHistory(query) {
  if (!query || query.trim().length === 0) return;
  const q = query.trim();
  state.searchHistory = state.searchHistory.filter(h => h.query !== q);
  state.searchHistory.unshift({ query: q, time: new Date().toLocaleString() });
  if (state.searchHistory.length > 50) state.searchHistory.pop();
  localStorage.setItem('searchHistory', JSON.stringify(state.searchHistory));
}

function renderHistoryPage() {
  const container = $('#history-container');
  if (!container) return;

  if (state.searchHistory.length === 0) {
    container.innerHTML = `
      <div class="history-empty">
        <div style="font-size:48px;margin-bottom:12px;">🕐</div>
        <h3>暂无搜索记录</h3>
        <p>搜索商品后，记录将自动保存在本地</p>
      </div>
    `;
    return;
  }

  container.innerHTML = state.searchHistory.map((h, i) => `
    <div class="history-item" onclick="searchHistoryItem('${h.query.replace(/'/g, "\\'")}')">
      <div class="history-item-icon">🔍</div>
      <div class="history-item-content">
        <div class="history-item-query">${h.query}</div>
        <div class="history-item-time">${h.time}</div>
      </div>
      <button class="history-item-delete" onclick="event.stopPropagation(); deleteHistoryItem(${i})" title="删除">✕</button>
    </div>
  `).join('');
}

function searchHistoryItem(query) {
  state.searchQuery = query;
  navigate('results', { query });
}

function deleteHistoryItem(index) {
  state.searchHistory.splice(index, 1);
  localStorage.setItem('searchHistory', JSON.stringify(state.searchHistory));
  renderHistoryPage();
}

function clearAllHistory() {
  if (state.searchHistory.length === 0) return;
  state.searchHistory = [];
  localStorage.setItem('searchHistory', JSON.stringify(state.searchHistory));
  renderHistoryPage();
  showToast('已清空搜索记录');
}

// ===== Filter UI =====
function updateFilterUI() {
  // Update category filters
  const cats = getAllCategories();
  const catContainer = $('#filter-categories');
  if (catContainer) {
    catContainer.innerHTML = cats.map(c => `
      <label class="filter-option ${state.filters.categories.includes(c) ? 'active' : ''}">
        <input type="checkbox" ${state.filters.categories.includes(c) ? 'checked' : ''}
               onchange="toggleFilterCategory('${c}')">
        ${c}
        <span class="count">${PRODUCTS.filter(p => p.category === c).length}</span>
      </label>
    `).join('');
  }

  // Brands - show based on selected categories or all
  const brands = state.filters.categories.length > 0
    ? [...new Set(PRODUCTS.filter(p => state.filters.categories.includes(p.category)).map(p => p.brand))]
    : getAllBrands();
  const brandContainer = $('#filter-brands');
  if (brandContainer) {
    brandContainer.innerHTML = brands.map(b => `
      <label class="filter-option ${state.filters.brands.includes(b) ? 'active' : ''}">
        <input type="checkbox" ${state.filters.brands.includes(b) ? 'checked' : ''}
               onchange="toggleFilterBrand('${b}')">
        ${b}
      </label>
    `).join('');
  }

  // Tags
  const allTags = [...new Set(PRODUCTS.flatMap(p => p.tags))];
  const tagContainer = $('#filter-tags');
  if (tagContainer) {
    tagContainer.innerHTML = allTags.map(t => `
      <span class="tag-filter ${state.filters.tags.includes(t) ? 'active' : ''}"
            onclick="toggleFilterTag('${t}')">${t}</span>
    `).join('');
  }
}

function toggleFilterCategory(cat) {
  const idx = state.filters.categories.indexOf(cat);
  if (idx > -1) state.filters.categories.splice(idx, 1);
  else state.filters.categories.push(cat);
  state.currentPageNum = 1;
  applyFiltersAndSort();
}

function toggleFilterBrand(brand) {
  const idx = state.filters.brands.indexOf(brand);
  if (idx > -1) state.filters.brands.splice(idx, 1);
  else state.filters.brands.push(brand);
  state.currentPageNum = 1;
  applyFiltersAndSort();
}

function toggleFilterTag(tag) {
  const idx = state.filters.tags.indexOf(tag);
  if (idx > -1) state.filters.tags.splice(idx, 1);
  else state.filters.tags.push(tag);
  state.currentPageNum = 1;
  applyFiltersAndSort();
}

function applyPriceFilter() {
  state.filters.priceMin = $('#price-min')?.value || '';
  state.filters.priceMax = $('#price-max')?.value || '';
  state.currentPageNum = 1;
  applyFiltersAndSort();
}

function toggleInStock() {
  state.filters.inStock = !state.filters.inStock;
  state.currentPageNum = 1;
  applyFiltersAndSort();
}

function resetFilters() {
  state.filters = { categories: [], brands: [], priceMin: '', priceMax: '', tags: [], inStock: false };
  state.sortBy = 'default';
  state.currentPageNum = 1;
  if ($('#price-min')) $('#price-min').value = '';
  if ($('#price-max')) $('#price-max').value = '';
  if ($('#sort-select')) $('#sort-select').value = 'default';
  applyFiltersAndSort();
}

// ===== Home Categories =====
function renderHomeCategories() {
  const container = $('#home-categories');
  if (!container) return;

  const cats = getAllCategories();
  const icons = {
    '手机': { cls: 'phone', icon: '📱' },
    '平板电脑': { cls: 'tablet', icon: '📟' },
    '笔记本电脑': { cls: 'laptop', icon: '💻' },
    '耳机': { cls: 'earphone', icon: '🎧' },
    '智能手表': { cls: 'watch', icon: '⌚' },
    '家电': { cls: 'appliance', icon: '🏠' },
    '日用百货': { cls: 'daily', icon: '🧴' },
    '食品生鲜': { cls: 'food', icon: '🍎' },
    '服饰鞋帽': { cls: 'clothing', icon: '👕' }
  };

  container.innerHTML = cats.map(c => {
    const info = icons[c] || { cls: 'daily', icon: '📦' };
    return `
      <div class="category-card" onclick="searchCategory('${c}')">
        <div class="category-icon ${info.cls}">${info.icon}</div>
        <div class="category-name">${c}</div>
      </div>
    `;
  }).join('');
}

function renderHotProducts() {
  const container = $('#hot-products');
  if (!container) return;

  const hot = [...PRODUCTS].sort((a, b) => b.sales - a.sales).slice(0, 8);
  container.innerHTML = hot.map(p => renderProductCard(p)).join('');
}

function searchCategory(cat) {
  state.searchQuery = cat;
  state.filters.categories = [cat];
  navigate('results', { query: cat });
}

// ===== Mobile Menu =====
function toggleMobileMenu() {
  const menu = $('.nav-menu');
  if (menu) menu.classList.toggle('open');
}

function toggleMobileFilter() {
  const panel = $('.filters-panel');
  const overlay = $('.mobile-filter-overlay');
  if (panel) panel.classList.toggle('open');
  if (overlay) overlay.classList.toggle('open');
}

// ===== Scroll to Top =====
function initScrollTop() {
  const btn = $('.scroll-top');
  if (!btn) return;
  window.addEventListener('scroll', () => {
    btn.classList.toggle('visible', window.scrollY > 400);
  });
  btn.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
}

// ===== Init =====
function init() {
  // Navigation clicks
  $$('.nav-item').forEach(item => {
    item.addEventListener('click', () => {
      navigate(item.dataset.page);
      $('.nav-menu')?.classList.remove('open');
    });
  });

  // Logo click
  $('.nav-logo')?.addEventListener('click', () => navigate('home'));

  // Search form
  $('#search-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const input = $('#search-input');
    if (input) {
      state.searchQuery = input.value;
      state.searchType = $('#search-type')?.value || 'keyword';
      state.currentPageNum = 1;
      addSearchHistory(state.searchQuery);
      navigate('results', { query: state.searchQuery, type: state.searchType });
    }
  });

  // Hot tags
  $$('.hot-tag').forEach(tag => {
    tag.addEventListener('click', () => {
      state.searchQuery = tag.textContent;
      state.currentPageNum = 1;
      addSearchHistory(state.searchQuery);
      navigate('results', { query: state.searchQuery });
    });
  });

  // Sort select
  $('#sort-select')?.addEventListener('change', (e) => {
    state.sortBy = e.target.value;
    state.currentPageNum = 1;
    applyFiltersAndSort();
  });

  // View toggle
  $$('.view-toggle-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      state.viewMode = btn.dataset.view;
      $$('.view-toggle-btn').forEach(b => b.classList.toggle('active', b.dataset.view === state.viewMode));
      renderResults();
    });
  });

  // Mobile filter
  $('.mobile-filter-toggle')?.addEventListener('click', toggleMobileFilter);
  $('.mobile-filter-overlay')?.addEventListener('click', toggleMobileFilter);

  // Filter actions
  $('#filter-apply')?.addEventListener('click', () => {
    applyPriceFilter();
    toggleMobileFilter();
  });
  $('#filter-reset')?.addEventListener('click', resetFilters);

  // Init state
  renderHomeCategories();
  renderHotProducts();
  renderCompareBadge();
  initScrollTop();

  // Render history count
  const historyNav = $('.nav-item[data-page="history"]');
  if (historyNav && state.searchHistory.length > 0) {
    historyNav.textContent = `历史查询 (${state.searchHistory.length})`;
  }

  // Route on hash change
  window.addEventListener('hashchange', () => {
    const hash = window.location.hash.slice(1) || 'home';
    if (['home', 'results', 'compare', 'history', 'about'].includes(hash)) {
      navigate(hash);
    }
  });

  // Initial hash
  const hash = window.location.hash.slice(1);
  if (hash && ['results', 'compare', 'history', 'about'].includes(hash)) {
    navigate(hash);
  }
}

// ===== DOM Ready =====
document.addEventListener('DOMContentLoaded', init);
