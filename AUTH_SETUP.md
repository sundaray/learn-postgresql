# Auth setup

The app signs people in two ways: a Google account, or a six-digit code sent to
their email. Both are handled by [Better Auth](https://better-auth.com) running
inside the Cloudflare Worker, storing users and sessions in D1. Admins can
impersonate a user from `/admin`.

Nothing here works until the values in `.env` are filled in. This page covers
how to create the two external things those values point at: a Google OAuth
client and an Amazon SES sender.

## What talks to what

| Piece | Where it runs | Needs |
| --- | --- | --- |
| Better Auth core | Cloudflare Worker | `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, D1 binding |
| Google sign-in | Worker, redirects through Google | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` |
| Email one-time codes | Worker, signed request to SES | `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `SES_FROM_EMAIL` |
| Admin role and impersonation | Worker | `ADMIN_EMAILS` |

Start by copying the template and generating the signing secret:

```bash
cp .env.example .env
openssl rand -base64 32   # paste into BETTER_AUTH_SECRET
```

Set `BETTER_AUTH_URL` to `http://localhost:3000` while you work locally, and to
the deployed origin when you deploy. It has no trailing slash. Better Auth
builds its callback URLs from it, and the login-code email builds its logo URL
from it, so a wrong value breaks both.

## Google sign-in

1. Open the [Google Cloud console](https://console.cloud.google.com) and pick or
   create a project.
2. Go to **APIs and services > OAuth consent screen**. Choose **External**, give
   the app a name and a support email, and save. While the screen is in
   *Testing* status only accounts listed under **Test users** can sign in, so
   add your own address there. Publish the app when you want anyone to sign in.
3. Go to **APIs and services > Credentials**, then
   **Create credentials > OAuth client ID**, and choose **Web application**.
4. Under **Authorized JavaScript origins** add every origin the app is served
   from:

   ```
   http://localhost:3000
   https://your-deployed-origin
   ```

5. Under **Authorized redirect URIs** add the same origins with the callback
   path. This path is fixed by the catch-all route at
   `src/routes/api/auth/$.ts`, so it has to match exactly:

   ```
   http://localhost:3000/api/auth/callback/google
   https://your-deployed-origin/api/auth/callback/google
   ```

6. Create the client, then copy the client ID and client secret into
   `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.

One client can serve both local and deployed sign-in as long as both origins and
both redirect URIs are listed on it. If you would rather keep them apart, make a
second client and use a separate `.env` per stage.

A redirect URI that does not match character for character is the usual cause of
`redirect_uri_mismatch` on the Google screen. Check the scheme, the port, and
the absence of a trailing slash.

## Email one-time codes through Amazon SES

The app calls the SES v2 API directly at
`https://email.<AWS_REGION>.amazonaws.com/v2/email/outbound-emails`, signing the
request with `aws4fetch`. The AWS SDK is deliberately not used, since it is
heavy and awkward on Workers.

### 1. Verify the sender

In the [SES console](https://console.aws.amazon.com/ses), pick the region you
intend to use and keep it consistent, because a sender verified in one region
does not exist in another. Then go to **Identities > Create identity**.

- To send from a single address, choose **Email address**, enter it, and click
  the confirmation link AWS emails you.
- To send from anything at your domain, choose **Domain** and add the DKIM
  records AWS gives you to your DNS. This takes longer to propagate but it is
  the better option for real mail, since domain-verified mail is far less likely
  to be filtered.

Put the verified address in `SES_FROM_EMAIL` and the region in `AWS_REGION`
(for example `us-east-1`).

### 2. Leave the sandbox

New SES accounts are in a sandbox where you may only send **to** verified
addresses. That is fine while testing: verify your own address as a second
identity and codes will arrive.

To send to real users, open **Account dashboard > Request production access**
and describe the mail you send (transactional login codes, triggered by the
user, with no marketing content). Approval usually takes a day or so.

### 3. Create sending credentials

Create an IAM user with programmatic access and attach this policy. It grants
one action and nothing else:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": "ses:SendEmail",
      "Resource": "*"
    }
  ]
}
```

Generate an access key for that user and put the pair into
`AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY`.

If sending fails with a signature error, the region in `AWS_REGION` almost
certainly does not match the region the identity was verified in.

## Admins and impersonation

`ADMIN_EMAILS` is a comma-separated list. An account created with one of those
addresses gets the `admin` role, which unlocks `/admin` and the ability to
impersonate another user.

The role is assigned once, when the account is first created. Adding an address
to the list later does not promote someone who has already signed up, and a role
changed from the admin panel is not overwritten the next time that person logs
in. To promote an existing account, update its `role` column in D1 directly.

Leaving `ADMIN_EMAILS` blank means the app has no admins, which is a valid
setting.

## Running it

```bash
pnpm dev
```

This runs `alchemy dev` on the `dev` stage. The Worker runs locally inside
workerd with its real bindings, which is what lets the auth code read `env.DB`
and its secrets the same way it does in production. Plain `vite dev` cannot run
this app any more, because `cloudflare:workers` only exists inside the Worker
runtime.

The `dev` stage gets its own D1 database, named `learn-postgresql-dev-db`, so
local sign-ins never touch production data. The SQL files in `migrations/` are
applied to it on each run.

To deploy:

```bash
pnpm plan:prod     # review the changes
pnpm deploy:prod
```

Remember to set `BETTER_AUTH_URL` to the deployed origin before deploying, and
to have that origin listed on the Google OAuth client.

## If something breaks

| Symptom | Likely cause |
| --- | --- |
| `redirect_uri_mismatch` from Google | The redirect URI on the OAuth client does not match `<BETTER_AUTH_URL>/api/auth/callback/google` exactly |
| Google sign-in works locally but not deployed | The deployed origin is missing from the OAuth client, or `BETTER_AUTH_URL` still points at localhost |
| Code email never arrives | SES is in the sandbox and the recipient is not a verified identity |
| SES signature error | `AWS_REGION` does not match the region where the sender was verified |
| Every page returns 500 | You are running plain `vite dev` instead of `pnpm dev` |
| `/admin` says "Admins only" | The account was created before its address was added to `ADMIN_EMAILS` |
| Everyone is signed out after a deploy | `BETTER_AUTH_SECRET` changed |
