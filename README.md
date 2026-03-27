# Cluso Candidates Portal

Candidate-facing workspace for filling verification forms created from Cluso Admin service form builder.

## What this portal does
- Candidate login (no self-signup)
- Candidate dashboard with workflow counts
- Form submission page for assigned verification services
- History page with submitted answers and admin decisions
- Candidate password change flow

## How candidate assignment works
1. Customer creates an order with candidate email in customer portal.
2. If no account exists for that email, a candidate account is auto-created.
3. Candidate sees the selected service forms in this portal and submits answers.
4. After submission, request appears in admin pending queue for processing.

## Environment variables
Use `.env.local`:

```env
MONGODB_URI=your_mongodb_connection_string
JWT_SECRET=your_strong_secret
```

## Run locally
```bash
npm install
npm run dev
```

Runs on `http://localhost:3012`.
