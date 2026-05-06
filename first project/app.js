// =============================================
// 복지로봇 - 메인 애플리케이션 로직
// =============================================

let currentResults = [];
let currentFilter = 'all';

// ── 초기화 ──────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  setupRegionSelects();
  setupIncomeSlider();
  setupFilterButtons();
  setupSortSelect();
  setupForm();
});

// ── 지역 셀렉트 ──────────────────────────────
function setupRegionSelects() {
  const regionSel = document.getElementById('region');
  const districtSel = document.getElementById('district');

  regionSel.addEventListener('change', () => {
    const key = regionSel.value;
    districtSel.innerHTML = '<option value="">시/군/구 선택</option>';
    if (key && DISTRICTS[key]) {
      DISTRICTS[key].forEach(d => {
        const opt = document.createElement('option');
        opt.value = d; opt.textContent = d;
        districtSel.appendChild(opt);
      });
      districtSel.disabled = false;
    } else {
      districtSel.disabled = true;
    }
  });
}

// ── 소득 슬라이더 ────────────────────────────
function setupIncomeSlider() {
  const slider = document.getElementById('incomeLevel');
  const display = document.getElementById('incomeDisplay');

  function updateDisplay() {
    const val = parseInt(slider.value);
    const data = INCOME_DATA[val - 1];
    display.querySelector('.income-level-text').textContent = data.label;
    display.querySelector('.income-amount-text').textContent = data.amount;
    const pct = ((val - 1) / 9) * 100;
    slider.style.background = `linear-gradient(to right, var(--primary) 0%, var(--primary) ${pct}%, rgba(255,255,255,0.1) ${pct}%)`;
  }

  slider.addEventListener('input', updateDisplay);
  updateDisplay();
}

// ── 폼 처리 ─────────────────────────────────
function setupForm() {
  const form = document.getElementById('benefitForm');
  form.addEventListener('submit', e => {
    e.preventDefault();
    runMatching();
  });

  document.getElementById('resetBtn').addEventListener('click', () => {
    setTimeout(() => {
      document.getElementById('results-section').style.display = 'none';
      setupIncomeSlider();
    }, 50);
  });
}

// ── 매칭 실행 ────────────────────────────────
function runMatching() {
  const formData = collectFormData();
  if (!validateForm(formData)) return;

  showLoading(() => {
    currentResults = matchBenefits(formData);
    renderResults(currentResults, formData);
    hideLoading();
    document.getElementById('results-section').style.display = 'block';
    setTimeout(() => {
      document.getElementById('results-section').scrollIntoView({ behavior: 'smooth' });
    }, 100);
  });
}

function collectFormData() {
  const form = document.getElementById('benefitForm');
  const fd = new FormData(form);

  const extras = [];
  form.querySelectorAll('input[name="extras"]:checked').forEach(el => extras.push(el.value));

  return {
    age: parseInt(fd.get('age')) || 0,
    gender: fd.get('gender'),
    region: fd.get('region'),
    householdType: fd.get('householdType'),
    familyCount: parseInt(fd.get('familyCount')) || 1,
    childCount: parseInt(fd.get('childCount')) || 0,
    incomeLevel: parseInt(fd.get('incomeLevel')) || 5,
    employment: fd.get('employment'),
    housing: fd.get('housing'),
    extras,
  };
}

function validateForm(data) {
  if (!data.age || data.age < 0) { alert('나이를 올바르게 입력해주세요.'); return false; }
  if (!data.gender) { alert('성별을 선택해주세요.'); return false; }
  if (!data.region) { alert('거주 지역을 선택해주세요.'); return false; }
  if (!data.householdType) { alert('가구 유형을 선택해주세요.'); return false; }
  if (!data.employment) { alert('취업 상태를 선택해주세요.'); return false; }
  if (!data.housing) { alert('주거 형태를 선택해주세요.'); return false; }
  return true;
}

// ── 매칭 엔진 ────────────────────────────────
function matchBenefits(data) {
  const matched = [];

  BENEFITS_DB.forEach(benefit => {
    const score = calcMatchScore(benefit, data);
    if (score > 0) {
      matched.push({ ...benefit, matchScore: score });
    }
  });

  matched.sort((a, b) => b.matchScore - a.matchScore || b.priority - a.priority);
  return matched;
}

function calcMatchScore(benefit, data) {
  const c = benefit.conditions;
  let score = 100;

  // 나이 조건
  if (c.minAge !== undefined && data.age < c.minAge) return 0;
  if (c.maxAge !== undefined && data.age > c.maxAge) return 0;

  // 소득 조건
  if (c.maxIncomeLevel !== undefined && data.incomeLevel > c.maxIncomeLevel) return 0;
  if (c.minIncomeLevel !== undefined && data.incomeLevel < c.minIncomeLevel) return 0;

  // 지역 조건
  if (c.region && c.region.length > 0 && !c.region.includes(data.region)) return 0;

  // 가구 유형 조건
  if (c.householdTypes && c.householdTypes.length > 0 && !c.householdTypes.includes(data.householdType)) return 0;

  // 취업 상태 조건
  if (c.employment && c.employment.length > 0 && !c.employment.includes(data.employment)) return 0;

  // 주거 형태 조건
  if (c.housing && c.housing.length > 0 && !c.housing.includes(data.housing)) return 0;

  // 자녀 조건
  if (c.minChildCount !== undefined && data.childCount < c.minChildCount) return 0;

  // 추가 사항 조건
  if (c.extras && c.extras.length > 0) {
    const hasExtra = c.extras.some(e => data.extras.includes(e));
    if (!hasExtra) return 0;
    score += 20; // 정확히 매칭되면 가산점
  }

  // 지역 매칭 가산점
  if (c.region && c.region.includes(data.region)) score += 15;

  // 소득 근접도 가산점
  if (c.maxIncomeLevel !== undefined) {
    const margin = c.maxIncomeLevel - data.incomeLevel;
    if (margin >= 0) score += Math.max(0, 10 - margin * 2);
  }

  return score;
}

// ── 결과 렌더링 ──────────────────────────────
function renderResults(results, data) {
  const grid = document.getElementById('resultsGrid');
  const summary = document.getElementById('resultsSummary');
  const noResults = document.getElementById('noResults');

  summary.innerHTML = `
    <h2>🎉 ${results.length}개의 지원금을 찾았습니다</h2>
    <p>${data.age}세 · ${getRegionLabel(data.region)} · 소득 ${INCOME_DATA[data.incomeLevel-1].label} 기준</p>
  `;

  applyFilterAndRender(results, currentFilter);
}

function applyFilterAndRender(results, filter) {
  const grid = document.getElementById('resultsGrid');
  const noResults = document.getElementById('noResults');

  let filtered = results;
  if (filter !== 'all') {
    filtered = results.filter(b => b.category.includes(filter));
  }

  const sort = document.getElementById('sortSelect').value;
  if (sort === 'amount') {
    filtered = [...filtered].sort((a, b) => b.priority - a.priority);
  } else if (sort === 'category') {
    filtered = [...filtered].sort((a, b) => a.category[0].localeCompare(b.category[0]));
  }

  if (filtered.length === 0) {
    grid.innerHTML = '';
    noResults.style.display = 'block';
    return;
  }
  noResults.style.display = 'none';
  grid.innerHTML = filtered.map(renderCard).join('');
}

function renderCard(benefit) {
  const badges = benefit.category.map(c => `<span class="badge badge-${c}">${getCategoryLabel(c)}</span>`).join('');
  const matchPct = Math.min(99, benefit.matchScore);

  return `
    <div class="benefit-card" data-id="${benefit.id}">
      <div class="card-top">
        <div class="card-badges">${badges}</div>
        <span class="match-score">매칭 ${matchPct}%</span>
      </div>
      <div class="card-icon">${benefit.icon}</div>
      <h3 class="card-title">${benefit.title}</h3>
      <p class="card-desc">${benefit.desc}</p>
      <div class="card-amount">${benefit.amount}</div>
      <div class="card-meta">
        <div class="card-meta-item">🏛️ <span>${benefit.agency}</span></div>
        <div class="card-meta-item">🏷️ <span>${benefit.tags.join(', ')}</span></div>
      </div>
      <div class="card-actions">
        <button class="btn-apply" onclick="window.open('${benefit.applyLink}', '_blank')">신청하기</button>
        <button class="btn-detail" onclick="window.open('${benefit.link}', '_blank')">상세보기</button>
      </div>
    </div>
  `;
}

// ── 필터 & 정렬 ─────────────────────────────
function setupFilterButtons() {
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentFilter = btn.dataset.filter;
      if (currentResults.length > 0) applyFilterAndRender(currentResults, currentFilter);
    });
  });
}

function setupSortSelect() {
  document.getElementById('sortSelect').addEventListener('change', () => {
    if (currentResults.length > 0) applyFilterAndRender(currentResults, currentFilter);
  });
}

// ── 로딩 애니메이션 ──────────────────────────
function showLoading(callback) {
  const overlay = document.getElementById('loadingOverlay');
  const bar = document.getElementById('loadingBar');
  const text = document.getElementById('loadingText');
  const messages = [
    '개인 정보를 분석하고 있습니다...',
    '소득 기준을 확인하고 있습니다...',
    '지역별 지원금을 검색하고 있습니다...',
    '지원 자격을 매칭하고 있습니다...',
    '결과를 정리하고 있습니다...',
  ];
  overlay.style.display = 'flex';
  let progress = 0;
  let msgIdx = 0;

  const interval = setInterval(() => {
    progress += 20;
    bar.style.width = progress + '%';
    text.textContent = messages[msgIdx++] || messages[messages.length - 1];
    if (progress >= 100) {
      clearInterval(interval);
      setTimeout(callback, 200);
    }
  }, 250);
}

function hideLoading() {
  document.getElementById('loadingOverlay').style.display = 'none';
  document.getElementById('loadingBar').style.width = '0%';
}

// ── FAQ 토글 ────────────────────────────────
function toggleFaq(btn) {
  const answer = btn.nextElementSibling;
  const icon = btn.querySelector('.faq-icon');
  const isOpen = answer.classList.contains('open');

  document.querySelectorAll('.faq-answer').forEach(a => a.classList.remove('open'));
  document.querySelectorAll('.faq-icon').forEach(i => i.classList.remove('open'));

  if (!isOpen) {
    answer.classList.add('open');
    icon.classList.add('open');
  }
}

// ── 유틸 함수 ────────────────────────────────
function getCategoryLabel(cat) {
  const map = { national:'국가', local:'지자체', youth:'청년', senior:'노인', family:'가족', disabled:'장애인' };
  return map[cat] || cat;
}

function getRegionLabel(region) {
  const map = {
    seoul:'서울', busan:'부산', daegu:'대구', incheon:'인천',
    gwangju:'광주', daejeon:'대전', ulsan:'울산', sejong:'세종',
    gyeonggi:'경기', gangwon:'강원', chungbuk:'충북', chungnam:'충남',
    jeonbuk:'전북', jeonnam:'전남', gyeongbuk:'경북', gyeongnam:'경남', jeju:'제주'
  };
  return map[region] || region;
}
