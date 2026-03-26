# AV Site Survey Web Application

A web-based tool for collecting AV installation site surveys. Field surveyors fill out a responsive form that captures room dimensions, conferencing platform requirements, audio/video specifications, and infrastructure details. Submissions are saved locally, converted to branded PDF reports, and emailed to configurable recipients.

## Features

- Responsive, mobile-friendly survey form with Black Box branding
- Multi-room survey support with per-room summaries
- Automatic PDF and HTML report generation (AVIXA standards)
- Email notifications with report attachments
- Photo and video upload support (up to 100 MB per file)
- Draft save/restore via JSON export
- LAN-accessible so multiple surveyors can submit from any device on the network

## Prerequisites

- [Node.js](https://nodejs.org/) v16 or later (includes npm)
- An SMTP-capable email account for sending notifications (Office 365, Gmail, etc.)

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Create your environment file
cp .env.example .env
#    Then edit .env with your SMTP credentials and recipient list.

# 3. Start the server
npm start
```

The console will display a local and network URL:

```
========================================
  AV Site Survey Server Running
========================================
  Local:    http://localhost:3000
  Network:  http://192.168.1.100:3000
========================================
```

Share the **Network URL** with surveyors so they can access the form from any device on the same network.

## Configuration

All configuration is managed through environment variables in the `.env` file. See `.env.example` for a full reference.

| Variable           | Required | Default                 | Description                                       |
| ------------------ | -------- | ----------------------- | ------------------------------------------------- |
| `PORT`             | No       | `3000`                  | Port the server listens on                        |
| `SMTP_HOST`        | No       | `smtp.office365.com`    | SMTP server hostname                              |
| `SMTP_PORT`        | No       | `587`                   | SMTP server port                                  |
| `EMAIL_USER`       | Yes*     | —                       | Sender email address                              |
| `EMAIL_PASS`       | Yes*     | —                       | Sender password or app password                   |
| `EMAIL_RECIPIENTS` | Yes*     | —                       | Comma-separated list of notification recipients   |

*Required for email notifications. The server will still accept submissions without email configured.

### Gmail App Password

If using Gmail, you must generate an **App Password** instead of your regular password:

1. Go to **Google Account > Security > 2-Step Verification > App Passwords**.
2. Generate a password for "Mail".
3. Use the 16-character password in your `.env` file.

## Project Structure

```
av-site-survey-webapp/
├── public/                 # Static assets served to the browser
│   ├── assets/             # Images and logos
│   │   └── BB_HeaderLogo.png
│   ├── css/
│   │   └── styles.css      # Application stylesheet
│   ├── js/
│   │   └── survey.js       # Client-side form logic
│   └── index.html          # Main survey form page
├── submissions/            # Generated reports (git-ignored)
├── temp_uploads/           # Staging area for uploads (git-ignored)
├── server.js               # Express server and API
├── package.json
├── .env.example            # Environment variable template
├── .gitignore
└── README.md
```

## Usage

### For Surveyors

1. Open the provided URL in a web browser (desktop or mobile).
2. Fill out site information, project details, and room specifications.
3. Use **Add Another Room** to survey additional rooms on the same site.
4. Attach photos and videos as needed.
5. Click **Generate Survey Report** to submit.

### For Administrators

- Submissions are saved to the `submissions/` directory, organized by project name.
- Each submission includes a PDF report, HTML report, and raw JSON data file.
- Uploaded media files are stored alongside the reports.
- Email notifications are sent to the addresses listed in `EMAIL_RECIPIENTS`.

## Development

```bash
# Start with auto-reload on file changes
npm run dev
```

## Deployment

For production or internet-facing deployments:

1. Use HTTPS (via a reverse proxy such as nginx, or a platform like Render / Railway).
2. Set appropriate firewall rules.
3. Consider adding authentication if exposing beyond the local network.
4. Ensure the `submissions/` directory has adequate disk space for reports and media.

## Troubleshooting

**Email not sending** — Verify SMTP credentials in `.env`. If using Gmail, ensure you are using an App Password. Check the server console for detailed error messages.

**Cannot access from other devices** — Confirm your firewall allows traffic on the configured port. Both devices must be on the same network. Use the Network URL displayed at startup.

**Port already in use** — Change `PORT` in `.env` to an available port (e.g., `3001`).

## Security Notes

- Keep `.env` out of version control (it is listed in `.gitignore`).
- This server is designed for trusted local-network use. For public-facing deployments, add authentication and HTTPS.
- Uploaded files are stored on disk without virus scanning; consider adding a scanning step for production use.

## License

Proprietary — Black Box Network Services. All rights reserved.
