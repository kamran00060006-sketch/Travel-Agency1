# Sightcity Tour &amp; Travels — website

Static site. No build step, no server, no database. Open `index.html` in a browser
and it runs.

> **Travel More, Worry Less** — Saurabh Kukreti, Near Gurudwara, Main Laxman Jhula Road, Rishikesh.

---

## Files

```
index.html        Home
chardham.html     Chardham Yatra packages
services.html     Taxi, airport, outstation, All India, sightseeing
fleet.html        Innova Crysta and other vehicles
adventure.html    Rafting, camping, bike rent
contact.html      Phones, map, FAQ
assets/css/style.css   Every style on the site
assets/js/script.js    Every behaviour on the site
assets/img/            Images + a README listing each slot
robots.txt, sitemap.xml
```

---

## The one thing to change first

Open `assets/js/script.js`. The first block is:

```js
var BIZ = {
  phonePrimary:   '8077198576',
  phoneSecondary: '8979698864',
  whatsapp:       '918077198576',
  email:          'your-email@example.com'   // ← REPLACE
};
```

`BIZ.email` is a placeholder. Replace it and the footer link on all six pages updates
automatically.

### Changing a phone number

`BIZ.whatsapp` controls where enquiry messages go. The clickable `tel:` links are
written into the HTML, so change those with find-and-replace across all six files:

- `tel:+918077198576` — header button, hero, enquiry, footer, sticky bar, contact page
- `tel:+918979698864` — utility bar, footer, contact page
- `https://wa.me/918077198576` — WhatsApp buttons

Also update the `telephone` array in the JSON-LD block at the top of `index.html`.

---

## How the enquiry form works

There is no backend. The form gathers **service, date, time, persons** and an optional
name, then opens WhatsApp with the message already written:

```
Namaste! Enquiry from Sightcity website

Service : Package
Date    : 12 Oct 2026, 6:00 AM
Persons : 4
Name    : Ramesh Sharma

(sent from the Chardham Yatra page)
```

The last line tells you which page they were reading — a "Package" enquiry from the
Chardham page means something different from one sent from the adventure page.

Nothing is stored anywhere. If WhatsApp is not installed, `wa.me` opens WhatsApp Web
in the browser.

---

## Editing content

**Header and footer are copied into all six pages.** That is deliberate — it keeps the
site fast and search-friendly with no build step. The cost is that a change to the menu
or footer must be repeated in all six files. Look for these markers:

```html
<!-- ===== SHARED UTILITY BAR — mirror edits to all 6 pages ===== -->
<!-- ===== SHARED HEADER — mirror edits to all 6 pages ===== -->
<!-- ===== SHARED CLOSING BAND — enquiry + footer. Mirror to all 6 pages ===== -->
<!-- ===== SHARED STICKY MOBILE BAR — mirror to all 6 pages ===== -->
```

**Colours and spacing** live in one place — the `:root` block at the top of
`assets/css/style.css`. Change `--brand-700` and the whole site follows.

**Images** — see `assets/img/README.md` for the full table of slots and sizes, and
`assets/img/PROMPTS.md` for AI generation prompts for each one.

---

## Still to fill in

These were left as placeholders rather than invented. Search for `TODO` in the files.

| What | Where | Why it is blank |
|---|---|---|
| **Email address** | `script.js` → `BIZ.email` | Never confirmed. |
| **Testimonials** | `index.html`, end of the "Why us" section | Fake reviews are a legal and trust risk. Paste real Google reviews here. |
| **Prices** | Everywhere — reads "Price on request" | Real rates were not supplied, and a published rate card that changes on the phone costs more trust than it earns. |
| **Pincode** | `contact.html`, address block | Not confirmed. Laxman Jhula is usually 249302 — verify before adding. |
| **Business hours** | Footer and contact page | Currently says "Available 24×7 on call". Correct it if that is not accurate. |
| **Live domain** | `canonical` tags, `sitemap.xml`, `robots.txt` | Currently `sightcitytourtravels.com`. Change to the real domain once registered. |
| **GST / licence numbers** | Not present | Add to the footer if you want them shown. |

---

## Going live

Easiest route, free:

1. Go to <https://app.netlify.com/drop>
2. Drag this entire folder onto the page.
3. You get a live URL in about ten seconds.
4. Connect your own domain from Netlify's **Domain settings** when ready.

GitHub Pages, Cloudflare Pages and Vercel all work the same way — this is a plain
static site with no build command.

**Before you deploy:** `images-by-admin/` holds the original 2.2 MB hero PNG. The site
does not use it — it loads the optimised `assets/img/hero-mid.webp` (211 KB) instead.
Delete the folder or leave it out of the upload so visitors never download it.

**After going live:**
- Create a free [Google Business Profile](https://business.google.com) for the shop
  address and link this website. For a local taxi business this will bring more calls
  than the website alone.
- Submit `sitemap.xml` in [Google Search Console](https://search.google.com/search-console).
- Replace `og-cover.svg` with a JPG so WhatsApp link previews render.

---

## Motion

The site uses GSAP + ScrollTrigger from a CDN for the hero parallax and scroll reveals.
It is loaded with `defer` and gated three ways — if the CDN is blocked, JavaScript fails,
or the visitor has "reduce motion" switched on, **the page stays fully visible and every
button still works.** Animation is an enhancement here, never a requirement.

The Call and WhatsApp buttons are deliberately excluded from all animation. They are
visible and tappable from the first moment the page paints.

---

## Browser support

Chrome, Edge, Firefox, Safari — current versions, desktop and mobile. The layout uses
CSS Grid and `aspect-ratio`; anything from 2021 onward is fine.
