# Samarth Mishra — Web Studio

Personal booking site: Google login, website-type catalogue, client briefs, admin inbox.

## Run locally

```bash
cd samarth-studio
npm install
GOOGLE_CLIENT_ID=your-id.apps.googleusercontent.com npm start
```

Open `http://localhost:3000`.

- Clients: `/login` → Google → `/book`
- Studio inbox (who logged in, who ordered): open `/admin` and type PIN `2468` (change with `ADMIN_PIN`). Tables: users, logins, orders in `data/studio.db`.

Without `GOOGLE_CLIENT_ID`, a temporary name/email form is shown so the rest of the flow can be tested. The Google button is the real path once the Client ID is set.

## Google Cloud

1. Create OAuth Client ID (Web).
2. Authorized JavaScript origins: your local URL and later the live domain.
3. Put the Client ID in `GOOGLE_CLIENT_ID`.

Do not publish until you say the site is complete.
