# KATAGA Marketplace Name Voting System

A local voting web app for choosing the final name of the **KATAGA Marketplace**. Each person votes for exactly **TWO (2)** names. Built with **Node.js + Express + SQLite (better-sqlite3) + HTML/CSS/Vanilla JS** — everything runs on your laptop, no cloud services.

## Project Structure

```
KATAGA-Marketplace-Voting/
├── server.js          # Express server + SQLite database + API
├── package.json
├── .env               # Your admin password (DO NOT commit/share)
├── .env.example       # Template for .env
├── .gitignore
├── data/
│   └── votes.db       # SQLite database (all votes, persists forever)
└── public/
    ├── index.html     # Voting page
    ├── admin.html     # Admin dashboard (password protected)
    ├── styles.css
    ├── app.js         # Voting page logic
    └── admin.js       # Admin dashboard logic
```

## 1. Install dependencies (one time only)

Open the terminal in VS Code (`Ctrl + ~`) and run:

```
npm install
```

## 2. Set the admin password

Open the `.env` file in the project root and change the password:

```
ADMIN_PASSWORD=your-secret-password
PORT=3000
```

The password is only read on the **server side** — it is never sent to the browser.

## 3. Start the server

```
npm start
```

The terminal will print:

```
KATAGA Marketplace Name Voting System is running.

This device:
http://localhost:3000

Other devices on the same Wi-Fi:
http://192.168.x.x:3000     ← your laptop's detected IPv4 address
```

## 4. Open the voting page

- On your laptop: **http://localhost:3000**
- The admin dashboard: **http://localhost:3000/admin** (enter your `.env` password)

## 5. Let phones/laptops on the same Wi-Fi vote

When the server starts, it automatically prints your laptop's local IPv4 address (e.g. `http://192.168.1.5:3000`). Any device connected to the **same Wi-Fi** can open that URL in a browser and vote.

Tips:
- If a phone can't connect, make sure Windows Firewall allows Node.js on Private networks (Windows usually asks the first time — click **Allow**).
- You can also find your IP manually: run `ipconfig` in the terminal and look for **IPv4 Address** under your Wi-Fi adapter.

## 6. Stop the server

Press **Ctrl + C** in the terminal where it's running.

## 7. Where the voting data is stored

All votes are saved in the local SQLite file:

```
data/votes.db
```

Votes are **never deleted** when the server restarts or when VS Code is closed. The database and table are created automatically on first start.

## 8. Back up the votes

With the server stopped (or running — SQLite WAL mode is safe), copy the whole `data/` folder to a USB drive or another folder:

```
Copy-Item -Recurse data D:\Backups\kataga-votes-backup
```

(Or just copy/paste the `data` folder in File Explorer.)

To restore, put the copied files back into the project's `data/` folder before starting the server.

## Admin Dashboard features

- Total respondents & total votes cast
- Current Top 2 names
- Full ranking of all 27 names with vote counts, percentages, and visual bars
- Respondent table (name, Choice 1, Choice 2, date/time) with search
- **Export CSV** button (opens in Excel)
- Delete a respondent (with confirmation) — e.g. to fix a mistaken submission

## Voting rules enforced

- Exactly 2 choices required (checked on the frontend **and** backend)
- Both choices must be from the official list, and must be different
- One response per person — names compared case-insensitively, ignoring extra spaces
  (`"Juan Dela Cruz"` = `"juan dela cruz"` = `"  Juan   Dela Cruz  "`)
- All database queries are parameterized; submission is idempotent against double-clicks
