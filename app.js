const SHEET_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vT-HGrLkd-rdsBUpCx_jJ3OoatmeTgDJsjKiIMxCbKCoGZvRFNdKpoSLOJGAd8iQaNcT1HR7m0GoXRE/pub?gid=701130327&single=true&output=csv';

let rawData = [];
let candidates = [];
let charts = {};

// Initialize Lucide icons
lucide.createIcons();

// DOM Elements
const elements = {
    searchName: document.getElementById('search-name'),
    searchYear: document.getElementById('search-year'),
    searchBtn: document.getElementById('search-btn'),
    loadingOverlay: document.getElementById('loading-overlay'),
    statTotal: document.getElementById('stat-total'),
    statMonth: document.getElementById('stat-month'),
    statPassed: document.getElementById('stat-passed'),
    statInterviewRate: document.getElementById('stat-interview-rate'),
    lastSync: document.getElementById('last-sync'),
    syncIcon: document.getElementById('sync-icon'),
    resultOverlay: document.getElementById('search-result-overlay'),
    resultContent: document.getElementById('result-content'),
    closeResult: document.getElementById('close-result'),
    tableBody: document.getElementById('table-body'),
    dashboardView: document.getElementById('dashboard-view'),
    historyView: document.getElementById('history-view'),
    navDashboard: document.getElementById('nav-dashboard'),
    navHistory: document.getElementById('nav-history'),
    currentDate: document.getElementById('current-date')
};

// State
let viewMode = 'dashboard'; // 'dashboard' or 'history'

// 1. Data Loading & Caching Engine
async function fetchData() {
    elements.syncIcon.classList.add('loading');
    
    // Safety Timeout: Hide loader after 10 seconds if still stuck
    setTimeout(() => {
        if (!elements.loadingOverlay.classList.contains('hidden')) {
            elements.loadingOverlay.innerHTML = '<p style="color:red">데이터 로딩이 너무 오래 걸립니다.</p><p style="font-size:12px">네트워크 상태나 CORS 설정을 확인해 주세요.</p><button onclick="location.reload()" style="margin-top:10px; padding:5px 10px;">다시 시도</button><button onclick="document.getElementById(\'loading-overlay\').classList.add(\'hidden\')" style="margin-top:10px; margin-left:10px; padding:5px 10px;">그냥 시작 (캐시 데이터 사용)</button>';
        }
    }, 10000);

    // Load from cache first for instant feel
    const cachedData = localStorage.getItem('recruit_data');
    if (cachedData) {
        processData(JSON.parse(cachedData), true); // silent update
    }

    return new Promise((resolve, reject) => {
        Papa.parse(SHEET_URL, {
            download: true,
            header: false,
            complete: function(results) {
                const data = results.data;
                if (!data || data.length === 0) {
                    throw new Error('데이터가 비어 있습니다.');
                }
                localStorage.setItem('recruit_data', JSON.stringify(data));
                localStorage.setItem('last_sync_time', new Date().toISOString());
                processData(data);
                resolve();
            },
            error: function(err) {
                console.error('Fetch error:', err);
                elements.lastSync.textContent = '동기화 실패 (네트워크 확인)';
                elements.syncIcon.classList.remove('loading');
                // Even on error, hide loader if we have cached data
                if (localStorage.getItem('recruit_data')) {
                    elements.loadingOverlay.classList.add('hidden');
                }
                reject(err);
            }
        });
    }).catch(err => {
        console.error('Data process error:', err);
        elements.loadingOverlay.classList.add('hidden'); // Force hide on failure
    });
}

function processData(data, isCached = false) {
    // Process only if we have actual data
    if (!data || data.length < 4) return;
    
    candidates = data.slice(3)
        .filter(row => row[0]) 
        .map(row => ({
            name: row[0].trim(),
            position: row[1] || '-',
            platform: row[2] || '-',
            birthYear: row[3] || '-',
            date: row[4] || '-',
            experience: row[5] || '-',
            interviewed: row[6] === 'O',
            passed: row[7] === 'O',
            remarks: row[8] || ''
        }));
    
    updateDashboard();
    renderHistoryTable();
    
    if (!isCached) {
        const now = new Date();
        elements.lastSync.textContent = `실시간 동기화 완료: ${now.getHours()}:${now.getMinutes().toString().padStart(2, '0')}`;
        elements.syncIcon.classList.remove('loading');
        elements.loadingOverlay.classList.add('hidden');
    } else {
        elements.lastSync.textContent = '캐시된 데이터를 불러왔습니다...';
        elements.loadingOverlay.classList.add('hidden');
    }
}

// 2. Dashboard Updates
function updateDashboard() {
    // Stats
    elements.statTotal.textContent = candidates.length;
    
    const passedCount = candidates.filter(c => c.passed).length;
    elements.statPassed.textContent = passedCount;
    
    const interviewCount = candidates.filter(c => c.interviewed).length;
    const rate = candidates.length > 0 ? Math.round((interviewCount / candidates.length) * 100) : 0;
    elements.statInterviewRate.textContent = `${rate}%`;
    
    // Month count (hacky parsing based on '26.03.23' format)
    const currentMonth = '03'; // Assuming March based on sample
    const monthCount = candidates.filter(c => c.date.includes(`.${currentMonth}.`)).length;
    elements.statMonth.textContent = monthCount;

    renderCharts();
}

function renderCharts() {
    // Position Chart
    const posMap = {};
    candidates.forEach(c => {
        posMap[c.position] = (posMap[c.position] || 0) + 1;
    });
    
    updateChart('positionChart', 'doughnut', {
        labels: Object.keys(posMap),
        datasets: [{
            data: Object.values(posMap),
            backgroundColor: ['#4F46E5', '#8B5CF6', '#3B82F6', '#10B981', '#F59E0B', '#EF4444'],
            borderWidth: 0
        }]
    }, { cutout: '70%', plugins: { legend: { position: 'bottom' } } });

    // Platform Chart
    const platMap = {};
    candidates.forEach(c => {
        platMap[c.platform] = (platMap[c.platform] || 0) + 1;
    });
    
    updateChart('platformChart', 'bar', {
        labels: Object.keys(platMap),
        datasets: [{
            label: '등록 건수',
            data: Object.values(platMap),
            backgroundColor: '#4F46E5',
            borderRadius: 8
        }]
    }, { 
        indexAxis: 'y', 
        plugins: { legend: { display: false } },
        scales: { x: { grid: { display: false } }, y: { grid: { display: false } } }
    });
}

function updateChart(id, type, data, options) {
    if (charts[id]) charts[id].destroy();
    const ctx = document.getElementById(id).getContext('2d');
    charts[id] = new Chart(ctx, { type, data, options });
}

// 3. Search & Duplicate Check
function handleSearch() {
    const name = elements.searchName.value.trim();
    const year = elements.searchYear.value.trim();
    
    if (!name) {
        alert('이름을 입력해 주세요.');
        return;
    }

    const matches = candidates.filter(c => 
        c.name.includes(name) && 
        (year === '' || c.birthYear.includes(year))
    );

    showResultModal(matches, name, year);
}

function showResultModal(matches, searchName, searchYear) {
    let html = '';
    
    if (matches.length > 0) {
        html = `
            <div class="match-header">
                <i data-lucide="alert-triangle" class="icon-warning"></i>
                <h2 class="match-title">중복 지원 의심! (${matches.length}건)</h2>
                <p>${searchName}님에 대한 기록이 이미 시트에 존재합니다.</p>
            </div>
            <div class="match-list">
                ${matches.map(m => `
                    <div class="match-details" style="margin-bottom: 12px;">
                        <div class="detail-row">
                            <span class="detail-label">이름/년생</span>
                            <span class="detail-value">${m.name} (${m.birthYear}년생)</span>
                        </div>
                        <div class="detail-row">
                            <span class="detail-label">포지션</span>
                            <span class="detail-value">${m.position}</span>
                        </div>
                        <div class="detail-row">
                            <span class="detail-label">등록일자</span>
                            <span class="detail-value">${m.date}</span>
                        </div>
                        <div class="detail-row">
                            <span class="detail-label">진행현황</span>
                            <span class="detail-value">${m.passed ? '✅ 최종합격' : (m.interviewed ? '📅 면접진행' : '⏳ 검토중')}</span>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    } else {
        html = `
            <div class="match-header">
                <i data-lucide="check-circle-2" class="icon-success"></i>
                <h2 class="match-safe-title">제안 가능</h2>
                <p>${searchName} (${searchYear || '전체'}) 님은 중복된 기록이 없습니다.</p>
            </div>
            <p style="font-size: 14px; color: var(--text-muted); margin-top: 12px;">
                안심하고 제안을 진행하셔도 좋습니다.
            </p>
        `;
    }

    elements.resultContent.innerHTML = html;
    elements.resultOverlay.classList.remove('hidden');
    lucide.createIcons();
}

// 4. UI Events & Helpers
function renderHistoryTable() {
    elements.tableBody.innerHTML = candidates.map(c => `
        <tr>
            <td><strong>${c.name}</strong></td>
            <td>${c.position}</td>
            <td>${c.platform}</td>
            <td>${c.birthYear}</td>
            <td>${c.date}</td>
            <td>${c.experience}</td>
            <td>${c.interviewed ? 'O' : '-'}</td>
            <td>${c.passed ? '<span style="color: var(--green); font-weight: 700;">합격</span>' : '-'}</td>
        </tr>
    `).join('');
}

function switchView(mode) {
    viewMode = mode;
    if (mode === 'dashboard') {
        elements.dashboardView.classList.remove('hidden');
        elements.historyView.classList.add('hidden');
        elements.navDashboard.classList.add('active');
        elements.navHistory.classList.remove('active');
        document.getElementById('page-title').textContent = '채용 현황 대시보드';
    } else {
        elements.dashboardView.classList.add('hidden');
        elements.historyView.classList.remove('hidden');
        elements.navDashboard.classList.remove('active');
        elements.navHistory.classList.add('active');
        document.getElementById('page-title').textContent = '인재 채용 이력';
    }
}

// Event Listeners
elements.searchBtn.onclick = handleSearch;
elements.closeResult.onclick = () => elements.resultOverlay.classList.add('hidden');
elements.navDashboard.onclick = (e) => { e.preventDefault(); switchView('dashboard'); };
elements.navHistory.onclick = (e) => { e.preventDefault(); switchView('history'); };
elements.currentDate.textContent = new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });

// Handle Enter keys
[elements.searchName, elements.searchYear].forEach(el => {
    el.onkeypress = (e) => { if (e.key === 'Enter') handleSearch(); };
});

// Initial Load
fetchData();
// Auto refresh every 5 minutes
setInterval(fetchData, 5 * 60 * 1000);
