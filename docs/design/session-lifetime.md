<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 EUROPESIP -->
# Design: coherent, configurable session lifetime in DX and Keycloak

Issue: #26 · Status: **Design (draft)** · Release: not planned yet

This is a design for review. Nothing here is implemented yet. Statements marked **[verify]** come from the Open
Liberty and Keycloak documentation or from general knowledge, and have not been measured on DX Compose CF239. The
test plan (section 7) has to confirm them before the option ships.

## 1. Problem

Users of the EUROPESIP portal get signed out sooner than they expect, and at different moments (request of
2026-11-13). With the Keycloak option, at least four timers decide when a user has to sign in again. The installer sets
none of them, so each keeps its own default:

| Layer | Timer | Default | Who sets it today |
|---|---|---|---|
| DX Web Engine (Open Liberty) | HTTP session `invalidationTimeout` (idle) | 30 min (Liberty) | nobody |
| DX Web Engine (Open Liberty) | LTPA / SSO cookie `expiration` (absolute) | 120 min (Liberty) | nobody |
| Keycloak realm | SSO Session Idle | 30 min | nobody (realm import) |
| Keycloak realm | SSO Session Max | 10 h | nobody (realm import) |
| Keycloak realm/client | Access Token Lifespan | 5 min | nobody |
| Keycloak client | Client Session Idle / Max | 0 (inherit from the realm) | nobody |

Without Keycloak, only the two DX timers apply.

## 2. What each timer does

### 2.1 DX Compose (Web Engine = Open Liberty)

- **HTTP session**: `<httpSession invalidationTimeout="…"/>` in `server.xml`. It is an idle timeout, reset by each
  request. The portal application's own `web.xml` `<session-timeout>`, if there is one, takes precedence over the
  server-wide value **[verify: read the `web.xml` of the wps module in the Web Engine image]**.
- **LTPA / SSO token**: `<ltpa expiration="…"/>` in `server.xml`. It is an absolute lifetime counted from sign-in,
  not an idle one. While the cookie is valid, Liberty authenticates the user again with no prompt, even when the HTTP
  session has expired. So **an idle HTTP session does not sign the user out on its own**.
- **Tying the two together**: `<webAppSecurity logoutOnHttpSessionExpire="true"/>` makes Liberty treat the user as
  signed out when the HTTP session expires **[verify: available in the Liberty level of CF239 (26.0.0.9), and DX
  reacts as expected]**. Without it, "idle" in DX in practice means "LTPA expiration".
- **How DX Compose takes these settings**: the hcl-dx-deployment 2.50.0 chart has **no value** for the Web Engine
  LTPA expiration or session timeout. `configuration.webEngine.ltpa` only has `customLtpaSecret`, which holds the
  keys. The supported channel is `configuration.webEngine.configOverrideFiles`: XML snippets merged into
  `server.xml`, which "Open Liberty picks up and applies at runtime; this does not require a restart" ([HCL docs,
  configuration changes using overrides](https://help.hcl-software.com/digital-experience/dx-compose/CF238/deploy_dx/manage/cfg_webengine/configuration_changes_using_overrides/)).
  That page shows `httpSession` and `webAppSecurity` overrides, but no LTPA example.
- **Constraint from the chart**: `configuration.digitalAssetManagement.ltpaTokenRefreshTimeInMinutes: 5`, with the
  comment "the value should be less than LTPA Token Expiry". The LTPA expiration must therefore stay well above
  5 min.
- **Rule of thumb in other HCL and IBM products**: HCL Workload Automation requires the LTPA expiration to be longer
  than the session timeout ([HCL docs](https://help.hcl-software.com/workloadautomation/v102/distr/src_ad/awsadtdwcsessiontimeout.html)).
  An IBM product page sets both to the same value ([IBM docs](https://www.ibm.com/docs/kk/SS3NGB_5.2.0/ioc/maintain_xml_session_timeout.html)).
  This design uses LTPA = max ≥ session = idle (section 4).
- **DX Core** (WebSphere ND, `coreOn`): the LTPA timeout and session timeout live in the WAS configuration (global
  security, session management) and are changed with wsadmin or ConfigEngine, not with `configOverrideFiles`. This is
  **out of scope for the first version** (section 6).

### 2.2 With Keycloak (OIDC, `src/cicd.js` `kcDxLayer`, `kcRealm`)

- The Liberty `openidConnectClient` signs the user in and then issues its own SSO cookie (`WAS_n<hash>` instead of
  `LtpaToken2`). After that, DX requests are authenticated by that cookie, and its lifetime is the LTPA `expiration`
  above.
- **Keycloak SSO Session Idle** (`ssoSessionIdleTimeout`) only restarts when the browser or a client talks to
  Keycloak: a sign-in redirect or a token refresh. Ordinary DX page views do not reach Keycloak. **A user who is
  working in DX can still reach the Keycloak idle limit.** When DX next sends them to Keycloak (LTPA expired, or a
  forced re-authentication), they have to type their password again **[verify]**.
- **Access Token Lifespan** (5 min): Liberty's `reAuthnOnAccessTokenExpire` (default `true` **[verify]**) can send the
  browser back to Keycloak when the access token expires. That redirect is silent while the Keycloak SSO session is
  alive, and it restarts the Keycloak idle timer. It can break POST or XHR requests that are redirected. Whether this
  happens on CF239 decides the Keycloak mapping, so it is the first thing to measure (T-3).
- **Client session idle/max** (`client.session.idle.timeout`, `client.session.max.lifespan`): 0 means "use the realm
  values". The design keeps 0, so there is one source of truth.
- **Remember me** is off in the realm, so `*RememberMe` timeouts do not apply.
- Keycloak keeps sessions up to about 2 minutes past the idle limit as a grace period. Tests must allow for it.
- `KeycloakRealmImport` **only creates the realm**. Changes after that go through the admin console, `kcadm.sh` or the
  admin REST API. The issue already places existing installations out of scope.

### 2.3 Other consumers of the DX session

ÓRBITA (OIDC chart 3.1.2), People Service, IQ (a WebSocket with the DX session) and DXClient or the DX Delivery
Operator (Basic or form login, outside OIDC) use the same DX cookie or their own login. They follow the DX timers
and need no setting of their own. RUNBOOK should say that a long IQ chat with no page reload counts as idle for the
HTTP session **[verify]**.

## 3. The option in the wizard

One advanced option, **Session lifetime**, off by default:

| Field | Form key | Default when switched on | Range |
|---|---|---|---|
| Sign out after inactivity | `SESSION_IDLE_MIN` | 120 (2 h) | 10 … 1440 min |
| Sign out at the latest after | `SESSION_MAX_MIN` | 600 (10 h) | ≥ idle, ≤ 1440 min (24 h) |

- Switch `sessionLifetime: false` (in `DEFAULTS`). While it is off, the generated folder is **byte-identical** to
  today's (golden test and a unit test that compares the zips).
- Validation (`generate` → `check.err`, EN/ES): idle ≥ 10, max ≥ idle, max well above 5 min (DAM
  refresh constraint), whole minutes. With DX Core: an error saying the option is only for DX Compose for now.
- Shown in the advanced section, next to Keycloak. One help text explains both values, and with Keycloak says that
  they also apply to Keycloak.
- Headless (`src/headless.js`, `bin/dx-installer.mjs`): the same keys, validated the same way.
- Not offered in the webinar preset (as with CI/CD).

## 4. Mapping (one setting, every layer)

Let I = idle and M = max, in minutes.

| Target | Value | Where it is written |
|---|---|---|
| Liberty `httpSession invalidationTimeout` | I min | `lab-base/custom-values.session.yaml` → `configuration.webEngine.configOverrideFiles["session-lifetime.xml"]` |
| Liberty `ltpa expiration` | M min | same snippet |
| Liberty `webAppSecurity logoutOnHttpSessionExpire` | `true` | same snippet (only if T-2 confirms it works) |
| Keycloak `ssoSessionIdleTimeout` | depends on T-3: **I×60** if Keycloak sees regular traffic (token re-authentication), otherwise **M×60** | `lab-keycloak/realm-dx.yaml` (`kcRealm`) |
| Keycloak `ssoSessionMaxLifespan` | M×60 | `kcRealm` |
| Keycloak client session idle/max | 0 (inherit) | unchanged |
| Keycloak `accessTokenLifespan` | 300 s (unchanged) | unchanged unless T-3 shows a problem |

Why the Keycloak idle value depends on T-3: if Keycloak never sees an active DX user, a Keycloak idle of I signs that
user out after I minutes of *working*. That breaks the promise. In that case Keycloak idle = M, and DX enforces the
idle limit. After a DX idle sign-out the user then goes back in without a password while the Keycloak session is
alive (at most M). RUNBOOK must state this trade-off. A real "password after idle" needs DX's idle sign-out to end the
Keycloak session as well, which is a possible later step (front-channel logout or `redirect.logout` on expiry).

The snippet, for illustration:

```xml
<server description="DX Web Engine - session lifetime (DX Installer Wizard)">
  <httpSession invalidationTimeout="120m"/>
  <ltpa expiration="600m"/>
  <webAppSecurity logoutOnHttpSessionExpire="true"/>
</server>
```

Helm merges `configOverrideFiles` maps from several `-f` files by key, so this file and `oidc-keycloak.xml` live side by
side. Liberty merges the elements into `server.xml` **[verify: the merge of a single `httpSession` or `webAppSecurity`
element with the out-of-the-box one keeps its other attributes (`cookieHttpOnly`, `trackLoggedOutSSOCookies`)]**. If it
does not, the snippet repeats the out-of-the-box attributes listed in the HCL page.

## 5. Implementation steps

1. **Spec** `docs/specs/26-session-lifetime.md` from this design once the open questions are answered. Then update
   the issue.
2. **State**: `sessionLifetime`, `SESSION_IDLE_MIN`, `SESSION_MAX_MIN` in `src/state.js` (`DEFAULTS`, `normalise`:
   off in the webinar preset, numeric coercion), and the same keys in headless.
3. **Output layer** `src/session.js` (SPDX header; the engine is untouched):
   - `sessionFiles(form, s, files)`: adds `lab-base/custom-values.session.yaml`;
   - `sessionSteps(form, s, steps)`: adds `-f lab-base/custom-values.session.yaml` to **every** `helm upgrade` of the
     DX release, from the first install on (the same technique `applyCicd` uses for the Keycloak layer, matched on
     the DX release name, not on a fixed line);
   - `sessionRealm(form, text)`: adds `ssoSessionIdleTimeout` and `ssoSessionMaxLifespan` to `realm-dx.yaml`;
   - called from `src/bundle.js` after `applyCicd` and before `basic`/`registry`/`runtime`.
4. **Validation** in `generate`: the rules of section 3, in EN and ES.
5. **UI**: `src/views.jsx` advanced section, `src/i18n.js` EN/ES texts, the resource estimator unchanged.
6. **RUNBOOK** (`cicdRunbook` or a new `sessionRunbook`): a "Session lifetime" section with the values per layer, the
   Keycloak trade-off, and how to change them later: edit `custom-values.session.yaml` + `helm upgrade` (no restart,
   per HCL); Keycloak admin console *Realm settings → Sessions*, or
   `kcadm.sh update realms/dx -s ssoSessionIdleTimeout=… -s ssoSessionMaxLifespan=…`.
7. **BUILD-INFO.txt**: a `session : idle I min · max M min` line when the option is on.
8. **Docs**: `docs/security.md` + `.es.md` (a section on session lifetimes), FAQ entry, CHANGELOG EN/ES, mkdocs nav
   unchanged (existing pages).

## 6. Out of scope (first version)

- Existing installations (as the issue states). RUNBOOK documents the manual change.
- DX Core (WAS: wsadmin / ConfigEngine). A possible second step once the operator or ConfigEngine path is clear.
- Active Directory without Keycloak works (only the DX layer applies). AD *behind* Keycloak is not offered today.
- Per-application timeouts (IQ, ÓRBITA, People Service).

## 7. Test plan

**Unit** (`test/session.test.mjs`):

- off → the zip is byte-identical to the one without the keys (EN and ES, with and without Keycloak, vault on/off);
- on → `custom-values.session.yaml` holds the XML with I and M; every DX `helm upgrade` has the layer, in order
  (after LDAP and before Keycloak, or both present); `realm-dx.yaml` has the seconds; BUILD-INFO line; `bash -n`;
- validation errors (idle > max, idle < 10, DX Core, non-numeric), the webinar preset ignores the option;
- golden test (`test/golden.e2e.mjs`) green.

**Lab** (extra namespaces or a disposable cluster, never the production DX or Keycloak), with short values I = 10 and
M = 20 min:

- **T-1, without Keycloak**: sign in, stay idle for 11 min, then reload → signed out (or not: this records the real
  behaviour of `invalidationTimeout` against the `web.xml` of wps). Keep clicking every 2 min → signed out at about
  20 min (LTPA).
- **T-2, `logoutOnHttpSessionExpire`**: T-1 with and without the attribute, to decide whether it ships.
- **T-3, with Keycloak**: watch the browser redirects (HAR) while active for 20 min. Do requests go to Keycloak every
  5 min (access token)? Does the Keycloak session (admin console → Sessions) restart its idle timer? Do POST/XHR
  requests break? This decides the Keycloak idle mapping (section 4).
- **T-4**: explicit logout still ends both sessions (existing `redirect.logout`).
- **T-5**: DAM, Content Composer and IQ keep working past 5 min (`ltpaTokenRefreshTimeInMinutes`), and with
  `trackLoggedOutSSOCookies` unchanged.
- **T-6**: `helm upgrade` with new values is applied with no pod restart (HCL statement), checked in the Web Engine
  log.

## 8. Open questions

1. Defaults when the option is on: 2 h idle / 10 h max (issue example), or another pair agreed with the portal users?
2. After a DX idle sign-out, is it acceptable to go back in without a password while the Keycloak session is alive
   (simple option), or should idle also end the Keycloak session (more work)?
3. Should the option also exist without Keycloak (LTPA + HTTP session only)? This design says yes.
4. DX Core: postpone it, or plan a second step with wsadmin/ConfigEngine?
5. Should the same values also be offered to the DX Backstage plugin or the operator for existing portals (day-2),
   given that the installer only generates new installations?
