# Automated Downloader

A web application that automates browser clicks (e.g. clicking "Download Server 1" three times) on a target page to fetch and stream file downloads.

## How to Run in GitHub Codespaces (In GitHub Only)

You can run this application entirely on GitHub using **GitHub Codespaces** (which gives you a free hosting link and runs on GitHub's cloud).

### Step-by-Step Guide

1. Go to your repository on GitHub: **[santhosh1524/redirect-downloader](https://github.com/santhosh1524/redirect-downloader)**
2. Click the green **Code** button.
3. Select the **Codespaces** tab.
4. Click **Create codespace on main**.
5. Wait for the terminal window to open (this creates a virtual computer for you on GitHub).
6. In the terminal at the bottom, type the following commands and press Enter:
   ```bash
   npm install
   node server.js
   ```
7. Once the server starts, GitHub will show a pop-up in the bottom-right corner saying: 
   *"Your application running on port 3000 is available."*
8. Click **Open in Browser** to open your hosted app! 
   *(Alternatively, click on the **Ports** tab at the bottom, hover over port `3000`, and click the globe/web icon).*

---

## How to Use
1. Paste the target webpage URL.
2. Set the **Button/Link Text** (defaults to `Download Server 1`).
3. Set the number of **Clicks** (default `3`).
4. Click **Start Automated Download**.
5. If the download fails, scroll down to see the **Debug Screenshots** of what the browser saw.
