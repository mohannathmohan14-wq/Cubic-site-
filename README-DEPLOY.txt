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

  CUBIC_SETUP_KEY     = Ec-7QwxFBNpCgt8lETgbJtSA
  CUBIC_SESSION_SECRET= 1zRoVEz47BA0zjCNyPwMsQumQpF7VpjXtv9pXfhf7gs
  RESEND_API_KEY      = re_xxx...        (Resend se copy kiya hua)
  EMAIL_FROM          = Cubic Studio <hello@aapkisite.com>

  (EMAIL_FROM me apna verified domain wala email likho. Domain
   verify hone se pehle test ke liye:
   EMAIL_FROM = Cubic Studio <onboarding@resend.dev>)

  CUBIC_SETUP_KEY aur CUBIC_SESSION_SECRET ke ye default values
  code me already hain — bina set kiye bhi chalega, lekin apna
  khud ka random value set karna ZYADA SAFE hai.
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
   - Private setup key:  Ec-7QwxFBNpCgt8lETgbJtSA
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
