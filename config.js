/* =====================================================================
   COMFORT NEXT × FALL HOME SHOW — SCRATCH & WIN
   Everything you'd normally change on the kiosk side lives here.
   Database / server settings live in fhs-config.php on the server.
   ===================================================================== */
window.FHS_CONFIG = {

  // ---- Event -------------------------------------------------------
  eventName: 'Fall Home Show 2026',
  entryPrefix: 'FHS26',

  // ---- Where entries are saved -------------------------------------
  // url: the entry API on your server (relative = same website as the kiosk).
  // kioskKey: must match 'kiosk_key' in fhs-config.php on the server.
  backend: {
    enabled: true,
    url: 'api/entry.php',
    kioskKey: 'fhs26-K7mQ2wP9nL4x'
  },

  // ---- Booking -----------------------------------------------------
  // TODO: paste your ServiceTitan Scheduling Pro link here.
  schedulingUrl: 'https://example.com/replace-with-servicetitan-scheduling-pro-link',
  scheduleButtonText: 'Schedule now',
  claimButtonText: 'Claim now',
  claimCaption: 'Enter your details and book your consultation to claim your {amount} {label}.',
  bookCaption: 'Book your consultation to claim your {amount} {label}.',
  showQRCode: false,              // optional QR beside Schedule now (off by default)

  // ---- Prizes ------------------------------------------------------
  // One of $20, $40, … $200 is picked at random each time (equal chance).
  // Every prize id must also be listed in 'prizes' in fhs-config.php.
  prizes: [20, 40, 60, 80, 100, 120, 140, 160, 180, 200].map(n => ({
    id: 'CREDIT' + n,
    weight: 1,
    limit: null,
    amount: '$' + n,
    label: 'Credit',
    subtitle: 'Towards any new equipment',
    usesTitle: 'Use your credit for',
    uses: ['Furnace', 'Heat pump', 'Air conditioner', 'Water heater', 'Water softener', 'And more'],
    redeem: 'Book your free in-home consultation and mention entry {entryId}. Your {amount} credit is applied to any new equipment purchase.',
    schedulable: true
  })),

  // ---- Consent (stored word-for-word with every entry) --------------
  consentRequired: true,
  consentText: 'Yes, I agree that Comfort Next Home Services may use my details to manage my entry and may contact me by email, text message and phone with my prize details and future offers. I can unsubscribe at any time.',

  // ---- Prize confirmation messages (sent by the server) --------------
  sms: 'Comfort Next @ Fall Home Show: Congrats {firstName}! You won a {amount} {label} ({subtitle}). Entry {entryId}. Book to redeem: {schedulingUrl} Reply STOP to opt out.',
  emailSubject: 'You won a {amount} {label} from Comfort Next!',
  emailBody: 'Hi {firstName},\n\nThanks for visiting Comfort Next Home Services at the Fall Home Show!\n\nYour prize: {amount} {label} — {subtitle}\nEntry number: {entryId}\n\nHow to redeem: {redeem}\n\nBook now: {schedulingUrl}\n\nComfort today. A brighter tomorrow.\nComfort Next Home Services\n[Company mailing address]',

  // ---- Kiosk behaviour ---------------------------------------------
  oneEntryPerPerson: true,        // also enforced by the database
  // iPads + desktop/laptop (your PC while building): unlimited plays.
  // Phones and other mobile: one full cycle, then the "already played" screen.
  // Local test without deploying: open http://localhost:8080/?as=phone  (or ?as=ipad)
  revealAtPercent: 50,
  idleResetSeconds: 90,           // scratch / prize / details screens return home after inactivity
  doneResetSeconds: 45,           // final screen returns home after this long
  adminPin: '2026',               // tap the Fall Home Show logo 5× for the booth panel

  rulesText: 'No purchase necessary. Open to residents of Ontario 18+. One prize per person. Prizes are not redeemable for cash. Credit applies to new equipment purchased and installed by Comfort Next Home Services. Full rules available at the Comfort Next booth.'
};
