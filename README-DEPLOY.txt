================================================================
CUBIC WEBSITE — LIVE VERSION (Real Emails + Real Login)
Complete Deploy Guide — Hindi
================================================================

YE PROJECT KYA HAI?
Ye aapki website ka "live" version hai. Ab:
  ✓ Real enquiries → aapke email pe aayengi (Resend se)
  ✓ Real owner login (password se, server pe safe)
  ✓ Projects, enquiries, settings server pe save hoti hain
    (doosre device/browser se bhi dikhengi)

FILES:
  index.html              = Public website (visitors ke liye)
  owner.html              = Owner panel (aapka admin dashboard)
  netlify.toml            = Netlify config
  package.json            = backend dependency
  netlify/functions/api.mjs = POORA backend (login + emails + storage)
  README-DEPLOY.txt       = ye guide

----------------------------------------------------------------
STEP 0: PEHLE YEH SAMJHO (kya kya chahiye)
----------------------------------------------------------------
1) Netlify account        — netlify.com pe free signup
2) GitHub account         — github.com pe free signup (agar GitHub
                            se deploy karoge)
3) Resend account         — resend.com pe free (emails ke liye)
4) Ek domain (recommended)— ~Rs.800-1000/saal (GoDaddy, Namecheap,
                            Cloudflare, Hostinger se kharid sakte ho)

NOTE: Bina domain ke bhi site chalegi, lekin emails sirf "test"
mode me (sirf aapke khud ke email pe) jayengi. Real clients ko
email bhejne ke liye domain zaroori hai. (Neeche explain kiya hai.)

================================================================
TAREEQA A: GITHUB SE DEPLOY (RECOMMENDED — easy update)
================================================================
1. GitHub pe login karo → "+" (New repository) → repo name
   "cubic-site" → "Create repository" (Private rakh sakte ho).

2. Ye poora "cubic-live" folder apne computer pe ZIP banao.

3. GitHub repo ke page pe "Add file" → "Upload files" →
   ZIP ke andar ki SAARI files drag karo:
     index.html, owner.html, netlify.toml, package.json,
     aur "netlify" folder (iske andar functions/api.mjs hai)
   → "Commit changes".

   (Agar aapko git aata hai to normal git push bhi kar sakte ho.)

4. Netlify pe login karo → "Add new site" → "Import an existing
   project" → GitHub → repo "cubic-site" select karo.

5. Settings (Netlify automatically bhar dega):
   - Build command:        (khali chhodo)
   - Publish directory:    .
   (agar ".", nahi milta to bas save karo — default chalega)
   → "Deploy site".

6. 1-2 minute me site live:  https://cubic-site.netlify.app
   Owner panel:              https://cubic-site.netlify.app/owner.html

7. Aage bhi: GitHub pe file badal ke commit karo → Netlify
   khud auto-deploy kar dega.

----------------------------------------------------------------
TAREEQA B: NETLIFY CLI SE DEPLOY
----------------------------------------------------------------
1. Node.js install karo (nodejs.org → LTS version).

2. Terminal/Command Prompt kholo aur ye commands chalao:
     npm install -g netlify-cli
     netlify login
   (Browser khulega → Netlify se authorize karo)

3. "cubic-live" folder me jao aur deploy karo:
     cd cubic-live
     netlify deploy --prod
   (Pehli baar poochega "Create & configure a new site" → team
    select karo → site ka naam do jaise "cubic-site")

4. Bas! Site live. Link terminal me milega.
   Owner panel: https://aapka-naam.netlify.app/owner.html

----------------------------------------------------------------
RESEND SE EMAIL SETUP (aapne poocha tha — full steps)
----------------------------------------------------------------
1. resend.com pe signup karo (Google se login hota hai).
   Free plan me 100 emails/day milte hain — kaafi hai.

2. "API Keys" tab → "Create API Key" → naam do (Cubic) →
   permission "Sending access" → key copy karke save kar lo.
   (Ye key sirf ek baar dikhti hai!)

3. DOMAIN VERIFY (ye aapka sawaal tha — kaise karte hain):
   a) Dashboard me "Domains" tab → "Add Domain" → apna domain
      likho (jaise: aapkisite.com) → Add.
   b) Resend 3 DNS records dikhayega:
        - 1 MX record  (send.domainkey ke liye)
        - 2 TXT records (SPF + verification)
   c) Ab apne DOMAIN PROVIDER pe jao (jahan domain kharida tha:
      GoDaddy/Namecheap/Cloudflare/Hostinger) → "DNS Settings" /
      "Manage DNS" → naye records add karo, bilkul waise jaise
      Resend ne likhe hain (type, name/host, value).
   d) Kuch minute (kabhi 1 ghanta tak) wait karo → Resend pe
      wapas aake "Verify" button dabao → green tick aa jayega.

4. Netlify me env variables set karo (neeche STEP "ENV VARIABLES"
   dekho) — RESEND_API_KEY aur EMAIL_FROM.

"TEST EMAIL" KA MATLAB KYA HAI?
Agar domain verify NAHI kiya, to Resend aapko sirf
"onboarding@resend.dev" sender deta hai. Isse email SIRF aapke
khud ke (Resend account wale) email pe ja sakti hai — dusre kisi
ko nahi. Ye Resend ki security policy hai (spam rokne ke liye).
Matlab: real client ko email bhejne ke liye domain verify karna
hi padega. Domain verify hone tak aap "onboarding@resend.dev"
se apne khud ke email pe test kar sakte ho.

----------------------------------------------------------------
NETLIFY ME ENV VARIABLES KAISE SET KAREIN
----------------------------------------------------------------
Netlify → aapki site → "Site configuration" → "Environment
variables" → "Add a variable" → ye 4 add karo:

  CUBIC_SETUP_KEY     = <APNA-PRIVATE-SETUP-KEY>
  CUBIC_SESSION_SECRET= <APNA-RANDOM-SECRET>
  RESEND_API_KEY      = re_xxx...        (Resend se copy kiya hua)
  EMAIL_FROM          = Cubic Studio <hello@aapkisite.com>

  (EMAIL_FROM me apna verified domain wala email likho. Domain
   verify hone se pehle test ke liye:
   EMAIL_FROM = Cubic Studio <onboarding@resend.dev>)

  CUBIC_SETUP_KEY  : ZAROORI (sirf pehla owner account banane ke liye).
                     Bina iske /auth/setup band rehta hai.
  CUBIC_SESSION_SECRET : recommended. Na ho to server khud ek random
                     secret bana kar Blobs me rakh leta hai (code me
                     koi default secret NAHI hai ab).
  Naya random value banane ke liye (computer pe):
     node -e "console.log(require('crypto').randomBytes(24).toString('base64'))"

  Env variable badalne ke baad Netlify me "Trigger deploy" karna
  (ya code commit karna) — tabhi apply hoga.

----------------------------------------------------------------
PEHLI BAAR OWNER ACCOUNT SETUP (important!)
----------------------------------------------------------------
1. Site live hone ke baad kholo:
     https://aapki-site.netlify.app/owner.html

2. Pehli baar "Create the first owner account" form dikhega.
   - Owner name:   aapka naam
   - Owner email:  aapka email
   - Password:     koi strong password (min 8 characters)
   - Private setup key:  <APNA-PRIVATE-SETUP-KEY>
     (ya jo bhi aapne CUBIC_SETUP_KEY env me set kiya hai)

3. "Create owner account" dabao → aap owner panel me aa jaoge.

4. Ab se login sirf email + password se hoga.

----------------------------------------------------------------
ENQUIRY EMAILS KAISE KAAM KARTI HAIN
----------------------------------------------------------------
1. Owner panel me "Settings" (ya email settings) kholo.
2. "Recipients" field me wo emails likho jahan enquiry jaani
   chahiye (comma se alag, max 5):
     aapka@email.com, partner@email.com
3. "Email" toggle ON rakho → Save.
4. Ab jab koi visitor contact form bharega → enquiry owner panel
   me bhi save hogi AUR aapke email pe bhi aayegi.
5. Agar email fail ho jaye (galat key/domain), to enquiry phir bhi
   owner panel ke inbox me milegi, aur wahan "Resend" button se
   dobara email bhej sakte ho.

----------------------------------------------------------------
SECURITY NOTES (padhna zaroori)
----------------------------------------------------------------
- SETUP_KEY sirf pehli baar owner account banane ke liye hai.
  Account banne ke baad ye dobara kaam nahi karta (safe).
- RESEND_API_KEY kabhi bhi HTML/frontend me mat daalo. Sirf
  Netlify env variables me rakho.
- CUBIC_SETUP_KEY aur CUBIC_SESSION_SECRET ko apne khud ke random
  values se badal dena best practice hai.

----------------------------------------------------------------
TROUBLESHOOTING
----------------------------------------------------------------
"Login pe 'server unavailable' aata hai"
  → Netlify deploy complete hua? /api kuch aur ho? Env vars set
    karne ke baad dobara deploy karo.

"Email nahi aayi"
  → Owner panel settings me recipients sahi hai?
  → Resend API key sahi hai? Domain verified hai?
  → Enquiry ke "mailStatus" me kya likha hai (owner panel inbox
    me dikhta hai: sent / failed / not-configured)?

"Upload image nahi ho rahi"
  → Sirf JPG/PNG/WebP, max 8 MB.

"Owner.html 404 aa raha"
  → GitHub me owner.html upload hua hai? Deploy log check karo.

=============================================================
 9) HERO CONTENT CONFIG (PDF wala jellyfish design)
=============================================================
Public site ka hero ab "deep violet + translucent jellyfish +
glass cards" style mein hai (PDF ke art direction ke mutabik).

Koi bhi text badalna ho to index.html (aur owner.html) ke ANDAR
<id="cubic-hero-config"> wali <script> dhoondhein — sab kuch wahan
se editable hai:

  - agencyName    : brand ka naam (abhi "cubic.")
  - eyebrow / headlineLine1 / headlineLine2 / description / primaryCTA
  - jellyfishImage: apni image ka URL/base64 ("" = built-in jellyfish)
  - cards         : glass cards ki list (null = default 3 cards:
                    Selected work / Capabilities / Current focus)
  - statistics    : [] = stats card GAYAB. Sirf ASLI numbers bharein,
                    jaise [{value:"12",label:"Completed projects"}].
                    PDF ka sakht rule: koi fake client/award/number
                    bilkul NAHI likhna.

Hindi/English dono ke liye translations app ki dictionary mein add
kar di gayi hain — language toggle (EN / हिंदी) hero par bhi kaam
karta hai.

Deploy yaad rahe: api.mjs sirf netlify/functions/api.mjs par chalega
(repo root par NAHI). Netlify khud redeploy karega jab aap updated
index.html + owner.html GitHub par upload karenge.
=============================================================

=============================================================
 10) FIX: project ka "live link" open nahi ho raha tha (2026-09-17)
=============================================================
Kya galat tha: netlify/functions/api.mjs ke public projection
(publicProject) mein liveUrl field chhoot gaya tha — isliye owner
panel mein link save to ho jata tha, lekin public site ko milta hi
nahi tha, aur project modal ka "Open completed website / app" button
kabhi dikhta hi nahi tha.

Fix: publicProject me ab liveUrl + year bhi jaate hain.
Aapke PURANE projects ka link bhi already storage me save hai —
fixed api.mjs deploy karte hi link turant kaam karega, dobara save
karne ki zaroorat NAHI hai.

Zaroori: updated api.mjs ko GITHUB par netlify/functions/api.mjs
wali jagah par dobara upload karein (root me nahi!) aur saath me
naya index.html + owner.html bhi.

Ab enquiry form bhi naye "violet glass" design me hai (alag card,
step pills, glowing submit) — koi data/behaviour change nahi, sirf
look.
=============================================================

=============================================================
 11) FIXES & HARDENING (2026-10-04 review)
=============================================================
BUGS FIXED
 - Projects ko public site "concept" samajh rahi thi: api.mjs
   `completed` + `theme` bhejta hi nahi tha, isliye real project ka
   cover/label galat tha aur "Open completed website / app" button
   kabhi nahi dikhta tha. (Asli wajah — sirf liveUrl add karna kaafi
   nahi tha.) Ab har saved project completed:true ke saath jata hai,
   purane projects bhi bina dobara save kiye theek ho jayenge.
 - Session cookie me "Secure" flag kabhi lagta hi nahi tha
   (x-forwarded-proto "https" ko "https:" se compare ho raha tha).
 - Enquiry email status ke naam UI se match nahi karte the
   (not-configured/skipped/pending). Ab not_configured/disabled/
   queued/sent/failed, saath me wajah bhi dikhti hai.
 - Do log ek saath enquiry bhejein to ek gum ho sakti thi (sab ek hi
   array me save hoti thi). Ab har enquiry alag save hoti hai, purani
   array pehli baar padhne par apne-aap migrate ho jati hai.
 - Enquiry pehle save hoti hai, email baad me — email fail ho to bhi
   lead kabhi nahi khoti.
 - Image upload 8 MB bolta tha par Netlify ~6 MB se upar request
   reject karta hai -> "server unavailable". Ab limit 4.5 MB, saaf
   error message. Images ab binary store hoti hain (base64 nahi) —
   purani uploads bhi chalti rahengi.
 - Upload ab file ke asli bytes check karta hai (sirf browser ka
   type nahi), aur /api/files/<id> sirf valid 16-hex id leta hai.
 - Honeypot ("website" field) ab server pe bhi kaam karta hai.
 - Project slug ab naam se banta hai (hotel-mahamaya), project-1a2b3c4d nahi.

SECURITY
 - Code/README se hard-coded SETUP_KEY aur SESSION_SECRET HATA diye.
   (Wo values leak ho chuki hain: unse koi bhi fake owner cookie bana
   kar enquiries dekh sakta tha.) Naye random values Netlify env me daalo.
 - Login (10 / 15 min) aur enquiry (5 / ghanta) pe rate-limit; login
   timing se email guess nahi hota.
 - Owner session 30 din baad khud expire hota hai; logout CSRF cookie bhi saaf karta hai.
 - Server-side validation: lengths, valid email, consent, http(s)-only
   project link, image sirf /api/files ya https. PATCH sirf status+notes badalta hai.
 - netlify.toml me security headers + CSP; robots.txt add; owner.html noindex + no-store.
 - Email HTML me user ka text ab poori tarah escape hota hai.

DEPLOY KARTE WAQT (zaroori):
 1. Netlify env me NAYE CUBIC_SETUP_KEY aur CUBIC_SESSION_SECRET daalo.
 2. Poora folder (netlify/functions/api.mjs, netlify.toml, robots.txt,
    index.html, owner.html) GitHub pe upload karo.
 3. Ek baar owner.html pe dobara login karna padega.

=============================================================
 12) NEW FEATURES (2026-10-05)
=============================================================
 - index.html: <script id="cubic-extras"> me window.__CUBIC_CONTACT__
   me apna WhatsApp number (country code ke saath, jaise 919876543210)
   aur analyticsDomain (jaise cubic.in, Plausible ke liye) bharo.
   Khali = feature band.
 - Telegram alert: Netlify env me TELEGRAM_BOT_TOKEN (BotFather se)
   aur TELEGRAM_CHAT_ID daalo -> har nayi enquiry turant phone pe.
 - Fonts/images ab /assets/ folder me hain (page 1.5 MB -> ~0.8 MB).
   /assets folder bhi GitHub pe upload karna ZAROORI hai.
 - Language ab browser se detect hoti hai (Hindi browser = Hindi).
 - Google ko pehle se readable content + structured data milta hai.

=============================================================
 13) PRICING / PROCESS / PROJECTS (2026-10-05)
=============================================================
 - Pricing section: Starter Rs 5,000 | Business Rs 10,000 | Custom Rs 15,000+
   (index.html me Nu=[...] data). Table (lS) aur live estimate calculator
   (Jf, Ex) bhi in prices se match kiye. Calculator ke extra-page aur
   add-on rates (Rs 1,000/page, Rs 1,500-3,000 add-ons) aur weeks MERE
   ANUMAAN hain -- apne hisab se batao, badal dunga.
 - Process: tumhare 4 steps (idea -> design preview -> build -> launch &
   support); jhoothe week-wise timings hata diye.
 - Testimonials (Alex Morgan, Jamie Chen, Sam Rivera) NAKLI the -- hide kar diye.
   Asli client review milne par bhejo, wapas lagayenge.
 - Projects: HotelBill Pro, Mahamaya POS, Mahakhata (screenshots /assets/proj-*.webp).
   Owner panel -> Projects me edit/add/delete kar sakte ho. Nakli "concept"
   projects ab default se band hain.
 - Netlify pe sab nayi files + /assets folder upload karna zaroori hai.

=============================================================
 14) LINK FIX + PROJECT FALLBACK (2026-10-05)
=============================================================
 - Site "offline preview" mode har http(s) link (WhatsApp, project live
   links) pe "copy this link" box dikhata tha. Ab links normal khulte hain.
 - Agar /api/projects load na ho to ab bhi 3 asli projects dikhte hain
   (window.__CUBIC_SEED_PROJECTS__). Lekin enquiry form tabhi chalega jab
   /api chal raha ho -- <site>/api/projects browser me kholkar check karo.
