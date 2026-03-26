'use strict';

/**
 * AV Site Survey Web Application - Server
 *
 * Express server that serves the AV site survey form, handles survey submissions,
 * generates PDF/HTML reports, and sends email notifications.
 *
 * @requires dotenv - Environment variable management
 * @requires express - HTTP server framework
 * @requires multer - Multipart file upload handling
 * @requires nodemailer - Email delivery
 * @requires puppeteer - Headless browser for PDF generation
 */

require('dotenv').config();

const express = require('express');
const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');
const nodemailer = require('nodemailer');
const cors = require('cors');
const puppeteer = require('puppeteer');
const multer = require('multer');

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const PORT = process.env.PORT || 3000;
const SUBMISSIONS_DIR = path.join(__dirname, 'submissions');

/**
 * Parse comma-separated email recipients from environment variable.
 * Falls back to an empty array when no recipients are configured.
 */
const EMAIL_RECIPIENTS = process.env.EMAIL_RECIPIENTS
  ? process.env.EMAIL_RECIPIENTS.split(',').map(e => e.trim()).filter(Boolean)
  : [];

// ---------------------------------------------------------------------------
// Express application setup
// ---------------------------------------------------------------------------

const app = express();

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ---------------------------------------------------------------------------
// File upload configuration (multer)
// ---------------------------------------------------------------------------

const storage = multer.diskStorage({
  destination: async function (_req, _file, cb) {
    const uploadDir = path.join(__dirname, 'temp_uploads');
    try {
      await fs.access(uploadDir);
    } catch {
      await fs.mkdir(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (_req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, `${uniqueSuffix}-${file.originalname}`);
  },
});

/** Allow up to 50 files per submission, each up to 100 MB. */
const upload = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 },
});

// ---------------------------------------------------------------------------
// Email transport
// ---------------------------------------------------------------------------

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.office365.com',
  port: parseInt(process.env.SMTP_PORT, 10) || 587,
  secure: false,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// ---------------------------------------------------------------------------
// Helper utilities
// ---------------------------------------------------------------------------

/**
 * Ensure that the submissions directory exists on disk.
 */
async function ensureSubmissionsDir() {
  try {
    await fs.access(SUBMISSIONS_DIR);
  } catch {
    await fs.mkdir(SUBMISSIONS_DIR, { recursive: true });
  }
}

/**
 * Map internal room-size keys to human-readable labels.
 * @param {string} size - Internal size key (e.g. "huddle", "small").
 * @returns {string} Formatted label.
 */
function formatRoomSize(size) {
  const labels = {
    huddle: 'Huddle Room',
    small: 'Small Conference',
    medium: 'Medium Conference',
    large: 'Large Conference',
  };
  return labels[size] || size;
}

/**
 * Map internal platform keys to human-readable labels.
 * @param {string} platform - Internal platform key (e.g. "mtr", "zoom").
 * @returns {string} Formatted label.
 */
function formatPlatform(platform) {
  const labels = {
    mtr: 'Microsoft Teams Room',
    zoom: 'Zoom Room',
    byod: 'BYOD Conferencing',
    presentation: 'Presentation Only',
  };
  return labels[platform] || platform;
}

/**
 * Retrieve the first non-internal IPv4 address of the host machine.
 * Used to display a LAN-accessible URL on server start.
 * @returns {string} Local IP address or "localhost" as fallback.
 */
function getLocalIP() {
  const { networkInterfaces } = require('os');
  const nets = networkInterfaces();

  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        return net.address;
      }
    }
  }
  return 'localhost';
}

// ---------------------------------------------------------------------------
// HTML report generation
// ---------------------------------------------------------------------------

/**
 * Build a branded HTML report from the submitted survey data.
 *
 * The report embeds the company logo as a base64 data URI so that it
 * renders correctly when opened offline or converted to PDF.
 *
 * @param {Object} projectInfo - Project-level metadata.
 * @param {Object} siteInfo - Physical site details.
 * @param {Object[]} rooms - Array of room survey objects.
 * @returns {string} Complete HTML document string.
 */
function generateHTMLReport(projectInfo, siteInfo, rooms) {
  const reportDate = new Date().toLocaleDateString();

  // Embed the logo as a base64 data URI for offline/PDF compatibility
  const logoPath = path.join(__dirname, 'public', 'assets', 'BB_HeaderLogo.png');
  const logoBase64 = fsSync.readFileSync(logoPath).toString('base64');
  const logoDataUri = `data:image/png;base64,${logoBase64}`;

  // Build per-room HTML sections
  const roomsHtml = rooms
    .map(
      (room, index) => `
      <div class="room-section">
        <h2>Room ${index + 1}: ${room.roomName}</h2>
        <div class="room-details">
          <div class="field"><strong>Building/Floor:</strong> ${room.buildingFloor || 'N/A'}</div>
          <div class="field"><strong>Room Size Classification:</strong> ${formatRoomSize(room.roomSize)}</div>
          <div class="field"><strong>Dimensions:</strong> ${room.roomLength || 'N/A'}' x ${room.roomWidth || 'N/A'}' x ${room.ceilingHeight || 'N/A'}' (L x W x H)</div>
          <div class="field"><strong>Maximum Occupancy:</strong> ${room.occupancy || 'N/A'}</div>
        </div>
        <h3>Conferencing Platform</h3>
        <div class="field"><strong>Primary Platform:</strong> ${formatPlatform(room.conferencingPlatform)}</div>
        <div class="field"><strong>Additional Platforms:</strong> ${Array.isArray(room.additionalPlatforms) ? room.additionalPlatforms.join(', ') : room.additionalPlatforms || 'None specified'}</div>
        <h3>Audio/Video Requirements</h3>
        <div class="field"><strong>Display Type:</strong> ${room.displayType || 'N/A'}</div>
        <div class="field"><strong>Display Size/Resolution:</strong> ${room.displaySize || 'N/A'}</div>
        <div class="field"><strong>Audio Requirements:</strong> ${Array.isArray(room.audioRequirements) ? room.audioRequirements.join(', ') : room.audioRequirements || 'None specified'}</div>
        <div class="field"><strong>Camera Requirements:</strong> ${Array.isArray(room.cameraRequirements) ? room.cameraRequirements.join(', ') : room.cameraRequirements || 'None specified'}</div>
        <h3>Infrastructure &amp; Environment</h3>
        <div class="field"><strong>Power Availability:</strong> ${room.powerAvailability || 'N/A'}</div>
        <div class="field"><strong>Network Infrastructure:</strong> ${room.networkAvailability || 'N/A'}</div>
        <div class="field"><strong>Environmental Considerations:</strong> ${Array.isArray(room.environmental) ? room.environmental.join(', ') : room.environmental || 'None specified'}</div>
        ${room.specialRequirements ? `<div class="notes"><strong>Special Requirements:</strong><br>${room.specialRequirements}</div>` : ''}
        ${room.technicalNotes ? `<div class="notes"><strong>Technical Notes:</strong><br>${room.technicalNotes}</div>` : ''}
      </div>`
    )
    .join('\n');

  // Room summary table rows
  const summaryRows = rooms
    .map(
      (room) => `
        <tr>
          <td>${room.roomName || 'N/A'}</td>
          <td>${formatRoomSize(room.roomSize)}</td>
          <td>${formatPlatform(room.conferencingPlatform)}</td>
          <td>${room.occupancy || 'N/A'}</td>
          <td>${room.roomLength || 'N/A'} x ${room.roomWidth || 'N/A'} ft</td>
        </tr>`
    )
    .join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Black Box - AV Site Survey Report - ${projectInfo.projectName}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
  <style>
    body { font-family: 'Montserrat', sans-serif; margin: 40px; line-height: 1.6; color: #333; background: #fff; }
    .header { border-bottom: 4px solid #E81123; padding-bottom: 20px; margin-bottom: 30px; }
    .header img { height: 60px; margin-bottom: 20px; }
    .header h1 { color: #000; font-weight: 700; margin-bottom: 10px; }
    .header p { color: #58595B; margin-bottom: 5px; }
    .footer { margin-top: 40px; padding-top: 20px; border-top: 4px solid #E81123; font-size: 0.75em; color: #58595B; text-align: center; }
    .footer p { margin: 5px 0; line-height: 1.6; }
    .section { margin-bottom: 30px; }
    .section h2 { color: #000; border-bottom: 2px solid #E81123; padding-bottom: 8px; font-weight: 700; margin-bottom: 15px; }
    .room-section { margin-bottom: 40px; page-break-inside: avoid; border-left: 4px solid #E81123; padding-left: 20px; }
    .room-section h2 { color: #E81123; border-bottom: 2px solid #000; padding-bottom: 10px; font-weight: 700; }
    .room-section h3 { color: #000; margin-top: 20px; margin-bottom: 10px; font-weight: 600; }
    .room-details { background: #f8f9fa; padding: 15px; border-radius: 4px; margin-bottom: 15px; border-left: 3px solid #E81123; }
    .field { margin-bottom: 8px; }
    .field strong { display: inline-block; width: 200px; color: #000; font-weight: 600; }
    .notes { background: #fff5f6; padding: 15px; border-radius: 4px; margin-top: 15px; border-left: 4px solid #E81123; }
    .summary-table { width: 100%; border-collapse: collapse; margin: 20px 0; }
    .summary-table th, .summary-table td { border: 1px solid #e0e0e0; padding: 10px; text-align: left; }
    .summary-table th { background: #000; color: #fff; font-weight: 700; }
    @media print { body { margin: 20px; } .room-section { page-break-after: auto; } }
  </style>
</head>
<body>
  <div class="header">
    <img src="${logoDataUri}" alt="Black Box">
    <h1>AV Installation Site Survey Report</h1>
    <p>Multi-Room Conference System Survey - AVIXA Standards Compliance</p>
    <p><strong>Generated:</strong> ${reportDate}</p>
  </div>

  <div class="section">
    <h2>Site Information</h2>
    <div class="field"><strong>Site Address:</strong> ${siteInfo.siteAddress || 'N/A'}</div>
    <div class="field"><strong>Access Considerations:</strong> ${siteInfo.accessConsiderations ? (Array.isArray(siteInfo.accessConsiderations) ? siteInfo.accessConsiderations.join(', ') : siteInfo.accessConsiderations) : 'None specified'}</div>
    ${siteInfo.otherAccessDetails ? `<div class="field"><strong>Other Access Details:</strong> ${siteInfo.otherAccessDetails}</div>` : ''}
    <div class="field"><strong>PPE Requirements:</strong> ${siteInfo.ppeRequirements ? (Array.isArray(siteInfo.ppeRequirements) ? siteInfo.ppeRequirements.join(', ') : siteInfo.ppeRequirements) : 'None specified'}</div>
    <div class="field"><strong>Background Check Requirements:</strong> ${siteInfo.backgroundCheck || 'N/A'}</div>
    <div class="field"><strong>Safety Training Requirements:</strong> ${siteInfo.safetyTraining || 'N/A'}</div>
    <div class="field"><strong>Union Labor or Prevailing Wage Requirements:</strong> ${siteInfo.unionLabor || 'N/A'}</div>
  </div>

  <div class="section">
    <h2>Project Information</h2>
    <div class="field"><strong>Project Name:</strong> ${projectInfo.projectName || 'N/A'}</div>
    <div class="field"><strong>Survey Date:</strong> ${projectInfo.surveyDate || 'N/A'}</div>
    <div class="field"><strong>Surveyor:</strong> ${projectInfo.surveyorName || 'N/A'}</div>
    <div class="field"><strong>Client Name:</strong> ${projectInfo.clientName || 'N/A'}</div>
    <div class="field"><strong>Client Contact:</strong> ${projectInfo.clientContactName || 'N/A'}</div>
    ${projectInfo.clientContactTitle ? `<div class="field"><strong>Client Contact Title:</strong> ${projectInfo.clientContactTitle}</div>` : ''}
    ${projectInfo.clientContactPhone ? `<div class="field"><strong>Client Contact Phone:</strong> ${projectInfo.clientContactPhone}</div>` : ''}
    ${projectInfo.clientContactEmail ? `<div class="field"><strong>Client Contact Email:</strong> ${projectInfo.clientContactEmail}</div>` : ''}
    <div class="field"><strong>Total Rooms Surveyed:</strong> ${rooms.length}</div>
  </div>

  <div class="section">
    <h2>Room Summary</h2>
    <table class="summary-table">
      <thead>
        <tr>
          <th>Room Name</th>
          <th>Size Class</th>
          <th>Platform</th>
          <th>Occupancy</th>
          <th>Dimensions</th>
        </tr>
      </thead>
      <tbody>${summaryRows}</tbody>
    </table>
  </div>

  ${roomsHtml}

  <div class="section">
    <h2>Survey Completion Notes</h2>
    <p>This survey was completed using AVIXA standards for conference room AV systems. All technical specifications and recommendations follow industry best practices for the identified room classifications and conferencing platforms.</p>
    <p><strong>Next Steps:</strong> Review each room's requirements, validate infrastructure capabilities, and develop detailed system designs based on the documented specifications.</p>
  </div>

  <div class="footer">
    <p><strong>Legal Notice:</strong> This document and all information contained herein are the exclusive property of Black Box Network Services. Unauthorized reproduction, distribution, or modification is strictly prohibited.</p>
    <p>&copy; ${new Date().getFullYear()} Black Box Network Services. All Rights Reserved. | Confidential and Proprietary Information</p>
  </div>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// API routes
// ---------------------------------------------------------------------------

/**
 * POST /api/submit-survey
 *
 * Accepts multipart form data containing:
 *   - projectInfo (JSON string)
 *   - siteInfo    (JSON string)
 *   - rooms       (JSON string)
 *   - photos      (file uploads, optional)
 *
 * Workflow:
 *   1. Parse and persist the raw JSON data.
 *   2. Move uploaded media into a project-specific directory.
 *   3. Generate an HTML report from the survey data.
 *   4. Convert the HTML report to PDF via Puppeteer.
 *   5. Email the report and attachments to configured recipients.
 */
app.post('/api/submit-survey', upload.array('photos', 50), async (req, res) => {
  try {
    await ensureSubmissionsDir();

    const projectInfo = JSON.parse(req.body.projectInfo);
    const siteInfo = JSON.parse(req.body.siteInfo);
    const rooms = JSON.parse(req.body.rooms);
    const uploadedFiles = req.files || [];

    // Build a filesystem-safe project slug and timestamped filename
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const projectSlug = projectInfo.projectName
      .replace(/[^a-zA-Z0-9]/g, '_')
      .toLowerCase();

    const projectDir = path.join(SUBMISSIONS_DIR, projectSlug);
    await fs.mkdir(projectDir, { recursive: true });

    const baseFilename = `${projectSlug}_${timestamp}`;

    // ---- Move uploaded media into a dedicated subdirectory ----
    const mediaDir = path.join(projectDir, 'media');
    await fs.mkdir(mediaDir, { recursive: true });

    const savedMediaFiles = [];
    for (const file of uploadedFiles) {
      const newPath = path.join(mediaDir, file.originalname);
      await fs.rename(file.path, newPath);
      savedMediaFiles.push({
        filename: file.originalname,
        path: newPath,
        size: file.size,
        mimetype: file.mimetype,
      });
      console.log(`  Saved media file: ${file.originalname}`);
    }

    // ---- Persist raw JSON data ----
    const jsonData = {
      projectInfo,
      siteInfo,
      rooms,
      mediaFiles: savedMediaFiles.map((f) => ({
        filename: f.filename,
        size: f.size,
        mimetype: f.mimetype,
      })),
    };
    const jsonPath = path.join(projectDir, `${baseFilename}.json`);
    await fs.writeFile(jsonPath, JSON.stringify(jsonData, null, 2));

    // ---- Generate HTML report ----
    const htmlReport = generateHTMLReport(projectInfo, siteInfo, rooms);
    const htmlPath = path.join(projectDir, `${baseFilename}.html`);
    await fs.writeFile(htmlPath, htmlReport);

    // ---- Generate PDF from HTML via headless Chromium ----
    console.log('Generating PDF report...');
    const pdfPath = path.join(projectDir, `${baseFilename}.pdf`);
    try {
      const browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });
      const page = await browser.newPage();
      await page.setContent(htmlReport, { waitUntil: 'networkidle0' });
      await page.pdf({
        path: pdfPath,
        format: 'Letter',
        margin: { top: '0.5in', right: '0.5in', bottom: '0.5in', left: '0.5in' },
        printBackground: true,
      });
      await browser.close();
      console.log('  PDF generated successfully');
    } catch (pdfError) {
      console.error('Error generating PDF:', pdfError.message);
    }

    // ---- Send email notification ----
    if (process.env.EMAIL_USER && process.env.EMAIL_PASS && EMAIL_RECIPIENTS.length > 0) {
      console.log(`Sending email notification to: ${EMAIL_RECIPIENTS.join(', ')}`);
      try {
        const attachments = [
          { filename: `${baseFilename}.pdf`, path: pdfPath },
          { filename: `${baseFilename}.html`, path: htmlPath },
          { filename: `${baseFilename}.json`, path: jsonPath },
        ];

        // Include media files as email attachments
        for (const file of savedMediaFiles) {
          attachments.push({ filename: file.filename, path: file.path });
        }

        const mailOptions = {
          from: process.env.EMAIL_USER,
          to: EMAIL_RECIPIENTS.join(', '),
          subject: `AV Survey Submission: ${projectInfo.projectName}`,
          html: `
            <h2>New AV Site Survey Submission</h2>
            <p><strong>Project:</strong> ${projectInfo.projectName}</p>
            <p><strong>Site:</strong> ${siteInfo.siteAddress}</p>
            <p><strong>Surveyor:</strong> ${projectInfo.surveyorName}</p>
            <p><strong>Survey Date:</strong> ${projectInfo.surveyDate}</p>
            <p><strong>Client:</strong> ${projectInfo.clientName}</p>
            <p><strong>Client Contact:</strong> ${projectInfo.clientContactName}</p>
            ${projectInfo.clientContactEmail ? `<p><strong>Client Email:</strong> ${projectInfo.clientContactEmail}</p>` : ''}
            ${projectInfo.clientContactPhone ? `<p><strong>Client Phone:</strong> ${projectInfo.clientContactPhone}</p>` : ''}
            <p><strong>Total Rooms:</strong> ${rooms.length}</p>
            <p><strong>Media Files:</strong> ${savedMediaFiles.length} photo(s)/video(s) attached</p>
            <hr>
            <p>The complete survey report is attached to this email.</p>`,
        };

        const info = await transporter.sendMail(mailOptions);
        console.log(`  Email sent (Message ID: ${info.messageId})`);
      } catch (emailError) {
        console.error('Error sending email:', emailError.message);
      }
    } else {
      console.log('  Email notification skipped (credentials or recipients not configured)');
    }

    res.json({
      success: true,
      message: 'Survey submitted successfully',
      files: { json: jsonPath, html: htmlPath, pdf: pdfPath },
    });
  } catch (error) {
    console.error('Error processing survey submission:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /
 * Serve the main survey form.
 */
app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ---------------------------------------------------------------------------
// Start server
// ---------------------------------------------------------------------------

app.listen(PORT, () => {
  console.log('');
  console.log('========================================');
  console.log('  AV Site Survey Server Running');
  console.log('========================================');
  console.log(`  Local:    http://localhost:${PORT}`);
  console.log(`  Network:  http://${getLocalIP()}:${PORT}`);
  console.log('========================================');
  console.log('');
  console.log('Share the Network URL with surveyors to access the form.');
  console.log(`Submissions are saved to: ${SUBMISSIONS_DIR}`);
  console.log('');

  ensureSubmissionsDir();
});
