# Pre-launch checklist
**Contact and legal**
- [ ] Add verified email, phone and social URLs to the footer (comment marks the spot)
- [ ] Replace placeholders in `privacy.html` and `terms.html`; legal review
- [ ] Set the retention period and list providers in the Privacy Policy
**Content**
- [ ] Replace the six "Work" placeholders with real, approved projects (image, title, category, optional case-study link)
- [ ] Point "Explore Our Work" to the portfolio page once it exists
- [ ] Review About copy; add only verified facts
- [ ] Add approved horizontal logo for the nav
- [ ] Review budget ranges and timeline options
**Form delivery**
- [ ] Set `NODE_ENV=production`, `RESEND_API_KEY`, `NOTIFY_EMAIL`, `FROM_EMAIL`; verify the sending domain
- [ ] Persistent `DATA_DIR` or `CRM_WEBHOOK_URL` configured and tested
- [ ] Send a real test enquiry from every entry point: nav, hero, each of the 13 service cards, final CTA, floating button
- [ ] Confirm duplicate and rate-limit behaviour; confirm failure message when the API is down
**Quality**
- [ ] Test on real iOS and Android phones (menu, modal, keyboard overlap, 13 services visible)
- [ ] Keyboard-only pass and screen-reader pass on the modal
- [ ] Reduced-motion setting on; JavaScript disabled check
- [ ] Lighthouse: performance, accessibility, SEO; self-host fonts if needed
- [ ] Update OG image and page titles; submit sitemap; set up analytics only with consent
- [ ] HTTPS, security headers, backups of enquiry data
