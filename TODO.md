# TODO - Fix auth cookie / token missing after frontend URL change

## Step 1: Backend cookie settings
- [x] Update `src/auth/auth.controller.ts` for both `login` and `register`:
  - `secure: false` -> `secure: true`
  - `sameSite: 'lax'` -> `sameSite: 'none'`


## Step 2: Backend CORS origin
- [ ] Ensure deployed backend environment variable `FRONTEND_URL` is exactly `https://train-xcel-frontend.vercel.app`
  - (Used by `src/main.ts`)

## Step 3: Redeploy backend
- [x] Build and redeploy backend

## Step 4: Verify protected endpoint
- [ ] Call protected endpoint `/auth/users` from browser with cookies enabled
- [ ] Confirm error is gone

