# Moyenda Tour Guide — static website setup

The public website is HTML, CSS and vanilla JavaScript. Supabase's browser client
provides database access, authentication and gallery uploads. The site does not need
Node.js or a separate server for public browsing, bookings, inquiries or the admin
dashboard. Existing `api-server/`, `netlify/` and `scripts/` files are preserved for
optional server-side features such as the AI guide and scheduled Instagram sync.

## 1. Configure Supabase

1. Create a Supabase project.
2. In the SQL editor, run these files in order on a **new** project:
   - `supabase/schema.sql`
   - `supabase/migrations/002_instagram.sql`
   - `supabase/migrations/003_content.sql`
   - `supabase/setup.sql`
3. If this is an existing project, do not drop or recreate tables. Apply only migrations
   that are missing, then run the additive `supabase/setup.sql`.
4. In Supabase **Project Settings → API**, copy the project URL and the public
   publishable/anon key. Put them in the configuration section at the top of
   `assets/js/app.js`:

   ```js
   window.MOYENDA_SUPABASE_URL = "https://jvofkvfprczdtbppyiqc.supabase.co";
   window.MOYENDA_SUPABASE_KEY = "sb_publishable_G4RSHbM-H_5OqjlE2mxLwg_Ym3nWUo2";
   ```

   Never use a `service_role` or secret key in this file or anywhere in the published
   site. The values may be public; security comes from Supabase Auth and RLS.

### Create an administrator

1. Create/invite the user in Supabase **Authentication → Users**.
2. Assign a role using the SQL editor (replace the email):

   ```sql
   insert into public.admin_users (user_id, role)
   select id, 'owner' from auth.users where email = 'you@example.com'
   on conflict (user_id) do update set role = excluded.role;
   ```

3. Open `/admin.html` and sign in with that Supabase Auth account.

`owner` can create, edit and delete. `editor` can create and edit. `viewer` can only read.
Role checks in the dashboard only control the interface; database RLS policies enforce
the same permissions for every request. Public visitors do not need an account.

## 2. Database-backed features

- Published packages, accommodation, blog articles, destinations, activities and
  homepage content load directly from Supabase. Drafts remain private.
- Booking requests are inserted with status `requested`; a request is not a confirmed
  booking until staff update it.
- The Contact page has a separate customer-inquiry form. Both forms have database
  constraints and public insert-only RLS policies; visitors cannot read or change
  submissions.
- The admin dashboard manages content, bookings, inquiries, FAQ entries, business
  settings and existing AI/Instagram records through the Supabase client.
- The `moyenda-gallery` Storage bucket is public for viewing published travel photos.
  Only authenticated editors/owners may upload or replace images; only owners may delete.
  Public images can be copied by anyone, as with any published image.
- No sample database rows are added. Published database sections stay empty until the
  business adds real content.

## 3. Static hosting

### GitHub Pages

1. Push the existing project to its GitHub repository and select the intended branch
   and folder in **Settings → Pages**.
2. Keep the Supabase SQL in `supabase/`; the root `_config.yml` excludes that directory
   from the default Jekyll output.
3. Check the published site URL and test direct page refreshes such as
   `/packages.html`, `/contact.html` and `/admin.html`.

The site uses relative asset/page paths and does not require a GitHub Pages backend.
The Supabase JavaScript client is loaded from jsDelivr; ensure the deployment's
Content Security Policy allows `https://cdn.jsdelivr.net` and the Supabase project
domain. Netlify's CSP is configured in `netlify.toml`.

### Netlify, Cloudflare Pages, Vercel, or another static host

Publish the HTML/CSS/JavaScript as static files. Netlify's existing configuration
continues to preserve its functions and hides `/supabase/*`. For hosts that publish
the repository root without Jekyll, configure the published artifact to **exclude
the entire `supabase/` directory**, so SQL files are not publicly downloadable.

No build step or Node runtime is required for the static site itself. The existing
`package.json` and API folders are retained; they are not required for the core
Supabase-backed site.

## 4. Optional server-side features

The AI guide needs its existing server-side API to keep the AI provider secret off
the browser. It is disabled by default on static-only deployments. To enable it,
set `window.MOYENDA_API_ENABLED = true` in `assets/js/api-config.js` only after
deploying/configuring the existing Netlify functions or API service. Keep all API
secrets in that service's environment, never in the static files.

Instagram cards read the cached public `instagram_media` rows directly from Supabase.
Refreshing that cache still requires the existing scheduled Netlify function or
API service and its server-only Meta token. The website does not fetch or scrape
Instagram in the browser.

## 5. Verification

After adding your Supabase configuration and applying the SQL, test:

- Public pages, mobile navigation, image paths, and refreshes on direct page URLs.
- An unauthenticated visitor can submit a booking/inquiry but cannot read submissions.
- Admin sign-in rejects an account without a row in `admin_users`.
- A viewer cannot save/delete; an editor cannot delete; an owner can manage records.
- Draft content is not visible publicly; publishing it makes it visible.
- Gallery uploads create Storage objects and published gallery records.
- `supabase/` SQL files are absent from the deployed static output.

Live authentication, database and Storage operations require your Supabase project
URL/key and an admin account; those credentials have not been supplied here.
