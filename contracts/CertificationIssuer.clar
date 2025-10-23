(define-constant ERR-NOT-AUTHORIZED u100)
(define-constant ERR-INVALID-GUIDE-PRINCIPAL u101)
(define-constant ERR-INVALID-CERT-DETAILS u102)
(define-constant ERR-INVALID-DOC-HASH u103)
(define-constant ERR-INVALID-EXPIRATION u104)
(define-constant ERR-INVALID-ISSUANCE-DATE u105)
(define-constant ERR-CERT-ALREADY-EXISTS u106)
(define-constant ERR-CERT-NOT-FOUND u107)
(define-constant ERR-AUTHORITY-NOT-REGISTERED u108)
(define-constant ERR-INVALID-SKILLS u109)
(define-constant ERR-INVALID-LANGUAGES u110)
(define-constant ERR-INVALID-LEVEL u111)
(define-constant ERR-INVALID-REGION u112)
(define-constant ERR-INVALID-CATEGORY u113)
(define-constant ERR-INVALID-STATUS u114)
(define-constant ERR-MAX-CERTS-EXCEEDED u115)
(define-constant ERR-INVALID-UPDATE-PARAM u116)
(define-constant ERR-UPDATE-NOT-ALLOWED u117)
(define-constant ERR-INVALID-FEE u118)
(define-constant ERR-INVALID-RENEWAL-PERIOD u119)
(define-constant ERR-INVALID-SIGNATURE u120)

(define-data-var next-cert-id uint u0)
(define-data-var max-certs-per-guide uint u5)
(define-data-var issuance-fee uint u500)
(define-data-var authority-registry-contract (optional principal) none)

(define-map certifications
  uint
  {
    guide: principal,
    details: (string-utf8 200),
    doc-hash: (buff 32),
    issuance-date: uint,
    expiration-date: uint,
    issuer: principal,
    skills: (list 10 (string-utf8 50)),
    languages: (list 5 (string-utf8 20)),
    level: (string-utf8 20),
    region: (string-utf8 100),
    category: (string-utf8 50),
    status: bool,
    renewal-period: uint
  }
)

(define-map certs-by-guide
  principal
  (list 5 uint))

(define-map cert-updates
  uint
  {
    update-details: (string-utf8 200),
    update-expiration: uint,
    update-timestamp: uint,
    updater: principal
  }
)

(define-read-only (get-cert (id uint))
  (map-get? certifications id)
)

(define-read-only (get-cert-updates (id uint))
  (map-get? cert-updates id)
)

(define-read-only (get-certs-for-guide (guide principal))
  (default-to (list) (map-get? certs-by-guide guide))
)

(define-private (validate-guide (guide principal))
  (if (not (is-eq guide tx-sender))
      (ok true)
      (err ERR-INVALID-GUIDE-PRINCIPAL))
)

(define-private (validate-details (details (string-utf8 200)))
  (if (and (> (len details) u0) (<= (len details) u200))
      (ok true)
      (err ERR-INVALID-CERT-DETAILS))
)

(define-private (validate-doc-hash (hash (buff 32)))
  (if (is-eq (len hash) u32)
      (ok true)
      (err ERR-INVALID-DOC-HASH))
)

(define-private (validate-expiration (exp uint))
  (if (> exp block-height)
      (ok true)
      (err ERR-INVALID-EXPIRATION))
)

(define-private (validate-issuance-date (date uint))
  (if (is-eq date block-height)
      (ok true)
      (err ERR-INVALID-ISSUANCE-DATE))
)

(define-private (validate-skills (skills (list 10 (string-utf8 50))))
  (if (<= (len skills) u10)
      (ok true)
      (err ERR-INVALID-SKILLS))
)

(define-private (validate-languages (langs (list 5 (string-utf8 20))))
  (if (<= (len langs) u5)
      (ok true)
      (err ERR-INVALID-LANGUAGES))
)

(define-private (validate-level (level (string-utf8 20)))
  (if (or (is-eq level "beginner") (is-eq level "intermediate") (is-eq level "expert"))
      (ok true)
      (err ERR-INVALID-LEVEL))
)

(define-private (validate-region (region (string-utf8 100)))
  (if (and (> (len region) u0) (<= (len region) u100))
      (ok true)
      (err ERR-INVALID-REGION))
)

(define-private (validate-category (cat (string-utf8 50)))
  (if (or (is-eq cat "history") (is-eq cat "art") (is-eq cat "nature") (is-eq cat "food"))
      (ok true)
      (err ERR-INVALID-CATEGORY))
)

(define-private (validate-renewal-period (period uint))
  (if (and (>= period u30) (<= period u365))
      (ok true)
      (err ERR-INVALID-RENEWAL-PERIOD))
)

(define-private (is-authority-registered (auth principal))
  (ok true)
)

(define-public (set-authority-registry (contract principal))
  (begin
    (asserts! (is-none (var-get authority-registry-contract)) (err ERR-NOT-AUTHORIZED))
    (var-set authority-registry-contract (some contract))
    (ok true)
  )
)

(define-public (set-max-certs-per-guide (new-max uint))
  (begin
    (asserts! (> new-max u0) (err ERR-INVALID_UPDATE-PARAM))
    (asserts! (is-some (var-get authority-registry-contract)) (err ERR-AUTHORITY-NOT-REGISTERED))
    (var-set max-certs-per-guide new-max)
    (ok true)
  )
)

(define-public (set-issuance-fee (new-fee uint))
  (begin
    (asserts! (>= new-fee u0) (err ERR-INVALID-FEE))
    (asserts! (is-some (var-get authority-registry-contract)) (err ERR-AUTHORITY-NOT-REGISTERED))
    (var-set issuance-fee new-fee)
    (ok true)
  )
)

(define-public (issue-certification
  (guide principal)
  (details (string-utf8 200))
  (doc-hash (buff 32))
  (expiration uint)
  (skills (list 10 (string-utf8 50)))
  (languages (list 5 (string-utf8 20)))
  (level (string-utf8 20))
  (region (string-utf8 100))
  (category (string-utf8 50))
  (renewal-period uint)
)
  (let (
        (next-id (var-get next-cert-id))
        (current-certs (get-certs-for-guide guide))
        (auth-contract (var-get authority-registry-contract))
      )
    (asserts! (<= (len current-certs) (var-get max-certs-per-guide)) (err ERR-MAX-CERTS-EXCEEDED))
    (try! (validate-guide guide))
    (try! (validate-details details))
    (try! (validate-doc-hash doc-hash))
    (try! (validate-expiration expiration))
    (try! (validate-skills skills))
    (try! (validate-languages languages))
    (try! (validate-level level))
    (try! (validate-region region))
    (try! (validate-category category))
    (try! (validate-renewal-period renewal-period))
    (try! (is-authority-registered tx-sender))
    (let ((auth-recipient (unwrap! auth-contract (err ERR-AUTHORITY-NOT-REGISTERED))))
      (try! (stx-transfer? (var-get issuance-fee) tx-sender auth-recipient))
    )
    (map-set certifications next-id
      {
        guide: guide,
        details: details,
        doc-hash: doc-hash,
        issuance-date: block-height,
        expiration-date: expiration,
        issuer: tx-sender,
        skills: skills,
        languages: languages,
        level: level,
        region: region,
        category: category,
        status: true,
        renewal-period: renewal-period
      }
    )
    (map-set certs-by-guide guide (append current-certs next-id))
    (var-set next-cert-id (+ next-id u1))
    (print { event: "cert-issued", id: next-id })
    (ok next-id)
  )
)

(define-public (update-certification
  (cert-id uint)
  (update-details (string-utf8 200))
  (update-expiration uint)
)
  (let ((cert (map-get? certifications cert-id)))
    (match cert
      c
        (begin
          (asserts! (is-eq (get issuer c) tx-sender) (err ERR-NOT-AUTHORIZED))
          (asserts! (get status c) (err ERR-INVALID-STATUS))
          (try! (validate-details update-details))
          (try! (validate-expiration update-expiration))
          (map-set certifications cert-id
            (merge c {
              details: update-details,
              expiration-date: update-expiration
            })
          )
          (map-set cert-updates cert-id
            {
              update-details: update-details,
              update-expiration: update-expiration,
              update-timestamp: block-height,
              updater: tx-sender
            }
          )
          (print { event: "cert-updated", id: cert-id })
          (ok true)
        )
      (err ERR-CERT-NOT-FOUND)
    )
  )
)

(define-public (get-cert-count)
  (ok (var-get next-cert-id))
)