# Soko-Link Product Requirements Document (PRD)

**Document:** `PRD-Statement.md`\
**Status:** Current product baseline --- capabilities classified against
the repository and a successful frontend build on 7 November 2026\
**Owner:** Soko-Link Product\
**Last updated:** 7 November 2026

> **Contributor contract --- read this first**
>
> The product already exists in a working state. Contributors must
> extend it, not re-scope or rebuild it.
>
> - Start from the current capability baseline in section 6.1.
> - A new feature must first be added here as **Planned** or **Under
>   consideration** with acceptance criteria, owner approval, and the
>   business rules it affects.
> - Do not silently change roles, prices, checkout totals, payment
>   states, fulfilment rules, public API contracts, or customer-facing
>   policies.
> - Backend behaviour is authoritative. The frontend must not invent
>   data, success states, fees, or provider options.
> - Update this document, the affected tests, and `Architecture.md` or
>   `Design.md` in the same pull request when behaviour changes.
> - Follow [CONTRIBUTING.md](CONTRIBUTING.md) for the required workflow.

## 1. Executive product statement

Soko-Link is a digital marketplace concept designed to connect
customers, sellers/suppliers, and logistics providers through a unified
platform for product discovery, commerce, and delivery coordination.

The product is being developed with a broader ambition than a basic
online catalogue: it aims to support marketplace participants across
product listing, purchasing, order handling, payment workflows, and
fulfilment-related activities.

The current project is in development. This document establishes a
product baseline, not a claim that every capability is complete or
production-ready.

## 2. Problem and opportunity

Soko-Link aims to address commerce and coordination challenges that may
include: - Product discovery spread across disconnected channels. -
Difficulty finding and comparing relevant sellers and products. -
Limited visibility into product availability and order progress. -
Friction between ordering, payment, and fulfilment. - Operational
complexity for sellers managing products and orders. - Coordination
challenges between merchants and delivery providers. - Trust concerns
where prices, seller details, and transaction status are unclear.

These are product hypotheses to validate with actual customers and
businesses. Do not describe them as proven market findings until
supported by interviews, surveys, transaction evidence, or credible
research.

## 3. Vision and product promise

**Vision:** Build a trusted and convenient marketplace that makes it
easier for people and businesses to discover products and coordinate
commerce.

**Product promise:** Make product discovery, purchasing, and
fulfilment-related interactions clearer and more connected for
marketplace participants.

The product must earn trust through accurate information, transparent
transaction states, secure handling of accounts and data, and dependable
workflows.

## 4. Target users

  -----------------------------------------------------------------------
  User group              Core needs              Product value
  ----------------------- ----------------------- -----------------------
  Customer                Discover products,      Convenient shopping and
                          compare options, place  transaction
                          orders, follow progress transparency

  Seller / supplier       Present a business,     Digital storefront and
                          list products, manage   operational tools
                          inventory and orders    

  Logistics provider      View assigned work and  Structured delivery
                          update delivery         coordination
                          progress                

  Administrator           Govern platform access  Controlled platform
                          and resolve operational oversight
                          issues                  

  Analyst                 Review authorised       Better visibility into
                          business and            marketplace activity
                          operational information 
  -----------------------------------------------------------------------

Personas, user needs, and priority segments must be validated through
research. Do not assume all user groups should be acquired at the same
time.

## 5. Product goals

1.  Provide a clear and trustworthy product discovery experience.
2.  Enable legitimate sellers to represent their businesses and manage
    listings.
3.  Support reliable cart, order, and payment-related workflows.
4.  Improve visibility of order and delivery progress where integrations
    support it.
5.  Enforce role permissions and ownership rules consistently.
6.  Establish a measurable foundation for customer adoption and business
    sustainability.

### Proposed success measures

Targets must be agreed after baseline measurement and market validation.

  -----------------------------------------------------------------------
  Metric                              Definition
  ----------------------------------- -----------------------------------
  Customer activation                 Share of registered customers
                                      completing a meaningful first
                                      action

  Seller activation                   Approved sellers who publish at
                                      least one valid listing

  Product discovery engagement        Search or category visits leading
                                      to product detail views

  Cart conversion                     Carts that proceed to a completed
                                      order

  Order completion rate               Orders reaching the defined
                                      completed state

  Payment success rate                Eligible payment attempts confirmed
                                      successful

  Delivery completion rate            Assigned deliveries reaching the
                                      verified completed state

  Repeat purchase rate                Customers placing more than one
                                      order in a defined period

  Dispute rate                        Orders resulting in a dispute under
                                      the approved definition

  Customer satisfaction               Feedback collected through an
                                      approved measurement method
  -----------------------------------------------------------------------

Do not fabricate current values or display proposed targets as actual
performance.

## 6. Scope and release discipline

Classify every capability as one of: - **Implemented:** verified in the
current code and working in the relevant flow. - **Partially
implemented:** some components exist, but the complete workflow is not
verified. - **Planned:** approved for a future release but not
implemented. - **Under consideration:** requires product or business
decision.

### 6.1 Current capability baseline

This table is the starting point for all contributors. “Implemented”
means the capability exists in the current codebase and has backend
regression coverage or a verified frontend/DOM flow. It does **not**
mean the capability has been production-verified.

| Capability | Status | Current scope / limitation |
| --- | --- | --- |
| Identity and accounts | Implemented | Registration, login, refresh-token rotation, email OTP/link verification, phone OTP, password recovery, account status. |
| Roles and applications | Implemented | Customer, seller, logistics, admin, superadmin, analyst; role applications and admin approval. |
| Seller onboarding | Implemented | Business registration, profile, logo/photo upload, verification/approval state. |
| Marketplace catalogue | Implemented | Public and authenticated product feeds, search, category filter, sort, product detail. |
| Product management | Implemented | Create/update/deactivate/reactivate, ownership checks, seller/admin assignment, image upload. |
| Cart and checkout | Implemented | Cart state, quantity limits, server-revalidated order creation, payment initiation, duplicate-submission protection. |
| Orders and fulfilment | Implemented | Order lifecycle, seller queue, status transitions, inventory reservations, customer history. |
| Logistics and delivery | Implemented | Logistics registration, delivery assignment, tracking, status updates, delivery chat, proof-of-delivery flow. |
| Payments: mobile money | Partially implemented | M-Pesa/Airtel/Tigo adapters and webhook/poll handling exist; production credentials, provider contracts, callback verification, and settlement are unverified. |
| Payments: manual | Implemented | Bank transfer and cash-on-delivery flows with authorised confirmation. |
| Payments: refunds | Planned | No automated refund service exists. |
| RFQ and providers | Implemented | RFQ submission/management and provider directory. |
| Reviews and ratings | Implemented | Order rating and product rating aggregates; review moderation policy is not defined. |
| Disputes | Implemented | Create/list/update/delete dispute workflow; automated refunds are out of scope. |
| Notifications | Implemented | In-app notifications and email templates; delivery depends on SMTP configuration. |
| Analytics and dashboards | Implemented | Role-aware dashboards, sales/marketplace analytics, inventory forecast. |
| AI assistant | Implemented | Gemini → OpenAI → rule-based fallback, role-aware context and confirm-first write tools. |
| Returns policy | Under consideration | Requires product/legal approval before implementation. |
| Credit accounts | Planned / disabled | Present as a disabled payment option; no approved workflow. |

When a capability changes status, update this table in the same pull
request.

### 6.2 Release prioritisation

**Launch-critical** - Secure registration, login, account recovery, and
role enforcement. - Accurate product catalogue and seller information. -
Product availability and price integrity. - Reliable cart and order
lifecycle. - Payment states that reflect trusted confirmation. - Clear
customer communication and error handling. - Operational administration
and support. - Production configuration, monitoring, backups, and
security checks.

**Post-launch candidates** - Improved analytics and reporting. -
Additional payment provider integrations. - Expanded seller tools. -
Improved logistics integrations. - Advanced discovery and recommendation
capabilities.

Final priorities require product-owner approval and evidence from user
testing.

## 7. Functional requirements

### 7.1 Identity and accounts

-   Users can register and authenticate through supported identifiers.
-   Passwords must be securely hashed by the backend.
-   Verification and recovery workflows must use secure, expiring,
    single-use mechanisms.
-   Roles must be assigned through trusted backend workflows.
-   Authentication and account states must be communicated clearly to
    users.

### 7.2 Roles and permissions

-   Customer, seller, logistics provider, administrator, and analyst
    experiences must reflect approved permissions.
-   Users cannot grant themselves privileged roles.
-   Seller and logistics access must follow the approved
    application/approval process.
-   Backend authorization and resource ownership checks are
    authoritative.
-   Frontend route guards improve usability but are not security
    controls.

### 7.3 Seller onboarding and business profile

-   Capture only required business information.
-   Show application or approval status accurately.
-   Permit approved sellers to manage only their authorised business
    resources.
-   Keep audit history for consequential administrative decisions.

### 7.4 Products and catalogue

-   Sellers can create and manage authorised listings according to
    business rules.
-   Product data must be validated on the backend.
-   Catalogue search, filtering, and sorting must use actual available
    data.
-   Product status and stock availability must be represented
    accurately.
-   Product images and uploads must follow security and storage rules.

### 7.5 Inventory

-   Stock changes must be validated server-side.
-   Concurrent orders must not cause overselling.
-   Reservation, deduction, and release rules must be explicit and
    tested.
-   Inventory history should be auditable where required.

### 7.6 Cart and orders

-   Cart totals must be calculated or verified by the backend.
-   The server must revalidate prices, stock, delivery options, and
    eligibility at checkout.
-   Order creation must be protected against duplicate submissions.
-   Order state transitions must follow an explicit state machine.
-   The customer must be able to see an accurate order history and
    status.

### 7.7 Payments and refunds

-   Supported payment methods must be labelled according to their real
    integration status.
-   A client-side action must never be treated as proof of payment.
-   Provider callbacks/webhooks must be authenticated and processed
    idempotently.
-   Transaction references and payment history must be preserved.
-   Refund eligibility and limits must be enforced server-side.
-   Reconciliation must be possible between internal records and
    provider records.

### 7.8 Logistics and delivery

-   Delivery assignments must be accessible only to authorised
    participants.
-   Delivery status updates must follow approved transitions.
-   Customers should see delivery information only when supported by
    actual operational data.
-   Do not claim live GPS tracking unless a real tracking integration
    exists.

### 7.9 RFQ and quotations

-   Requests and quotations must follow documented ownership,
    visibility, expiry, and response rules.
-   The product owner must approve unresolved commercial policies before
    implementation.

### 7.10 Reviews, disputes, notifications, analytics, and AI

-   Reviews must follow approved eligibility and moderation rules.
-   Disputes must have clear states, evidence handling, ownership, and
    resolution permissions.
-   Notifications must not disclose sensitive information to
    unauthorised users.
-   Analytics must use defined metrics and trustworthy data.
-   AI-assisted output must be clearly identified where appropriate and
    must not override authoritative transaction or policy decisions.

## 8. Business rules catalogue

Assign stable identifiers to business rules. The following are baseline
examples; validate each against approved product policy.

  ------------------------------------------------------------------------
  ID                      Rule                    Enforcement
  ----------------------- ----------------------- ------------------------
  IDN-001                 Privileged roles cannot Backend
                          be self-assigned        identity/authorization

  ACL-001                 Users may access only   Backend service/query
                          resources they are      layer
                          authorised to access    

  CAT-001                 Product changes must be Backend product module
                          made by an authorised   
                          owner or administrator  

  INV-001                 Stock must be           Backend inventory/order
                          revalidated during      transaction
                          checkout                

  INV-002                 Concurrent purchases    Database
                          must not oversell       transaction/locking
                          available stock         strategy

  ORD-001                 Orders may transition   Backend order domain
                          only through approved   
                          states                  

  ORD-002                 Order totals must be    Backend checkout
                          derived from trusted    
                          server-side data        

  PAY-001                 Payment success         Backend payment module
                          requires trusted        
                          provider or authorised  
                          reconciliation          
                          confirmation            

  PAY-002                 Duplicate provider      Idempotency and unique
                          events must not create  constraints
                          duplicate financial     
                          effects                 

  PAY-003                 Refunds cannot exceed   Backend refund service
                          the refundable amount   

  LOG-001                 Logistics users may     Backend logistics module
                          update only authorised  
                          assignments             

  REV-001                 Reviews must satisfy    Backend review module
                          approved eligibility    
                          rules                   

  AUD-001                 Privileged and          Audit subsystem
                          financially             
                          consequential actions   
                          must be auditable       
  ------------------------------------------------------------------------

For each rule, record its final policy, implementation location, tests,
and approval status. Do not silently introduce new commercial policies.

## 9. Non-functional requirements

### Security and privacy

-   Apply least privilege and deny-by-default authorization.
-   Hash passwords with an appropriate password-hashing algorithm.
-   Protect secrets using environment/secret-management facilities.
-   Validate inputs on the server.
-   Apply rate limits to sensitive endpoints.
-   Avoid logging passwords, tokens, payment credentials, or unnecessary
    personal data.
-   Use secure transport in production.
-   Define retention, access, and deletion policies for personal data.

### Reliability and data integrity

-   Use database constraints and transactions for critical workflows.
-   Make external event handling idempotent.
-   Keep payment and order state separate.
-   Maintain auditable histories for critical state changes.
-   Back up production data and test restoration.

### Performance and accessibility

-   Set measurable performance budgets after baseline testing.
-   Optimise images and frontend bundles.
-   Provide responsive layouts and accessible interactions.
-   Target WCAG 2.2 AA as the accessibility goal.

### Maintainability

-   Keep clear module boundaries.
-   Use migrations for schema changes.
-   Maintain automated tests for critical business rules.
-   Document API and architecture changes.

## 10. Key user journeys

1.  **Customer purchase:** discover → inspect product → add to cart →
    review checkout → place order → complete payment flow → receive
    confirmed order status → follow fulfilment.
2.  **Seller onboarding:** register → verify email with a 6-digit code →
    await approval if required → access seller workspace → publish
    listing.
3.  **Seller fulfilment:** receive order → review → process according to
    approved workflow → coordinate delivery → complete eligible actions.
4.  **Logistics fulfilment:** access assigned delivery → review shipment
    → update permitted status → complete delivery with required
    evidence.
5.  **Payment:** initiate → pending → provider confirmation or failure →
    update payment record idempotently → reconcile when required.
6.  **Dispute:** submit eligible dispute → review evidence → authorised
    resolution → communicate outcome.

Each journey requires acceptance tests and must be checked against the
actual implementation.

## 11. Product analytics and instrumentation

Define event names, ownership, and privacy rules before collecting
analytics. Suggested events include: - `account_registered` -
`seller_application_submitted` - `product_viewed` - `search_performed` -
`cart_item_added` - `checkout_started` - `order_created` -
`payment_initiated` - `payment_confirmed` - `delivery_status_updated` -
`dispute_opened`

Do not include passwords, authentication tokens, full payment
credentials, or unnecessary personal data in analytics events.

## 12. Risks, assumptions, and open decisions

  -------------------------------------------------------------------------------
  Item                    Type                    Required action
  ----------------------- ----------------------- -------------------------------
  Target launch segment   Product decision        Validate with product owner and
  and geography                                   market research

  Seller onboarding and   Business rule           Confirm eligibility and review
  approval policy                                 process

  Revenue model and fees  Commercial decision     Approve
                                                  commission/subscription/other
                                                  model before charging

  Payment provider        Technical/commercial    Verify contracts, credentials,
  production status                               callbacks, and settlement

  Delivery operating      Operational decision    Confirm who fulfils, prices,
  model                                           and owns delivery issues

  Returns and refunds     Business/legal          Approve customer-facing terms
  policy                                          and backend rules

  Privacy and data        Compliance              Review applicable Tanzanian
  retention                                       requirements and operating
                                                  markets

  Customer support        Operational             Define escalation and service
  ownership                                       expectations
  -------------------------------------------------------------------------------

## 13. Acceptance and launch readiness

A release is not ready solely because the frontend renders or the API
starts.

Launch approval should require: - Critical customer and business
journeys tested end-to-end. - Role and resource authorization
verified. - Payment and order state handling verified. - No known
critical or high-severity security issues. - Production secrets and
environment configuration reviewed. - Database migrations and backups
tested. - Error monitoring and operational ownership established. -
Customer-facing policies and support process approved. - Responsive and
accessibility checks completed. - Product owner sign-off on launch scope
and known limitations.

## 14. Change management

Product requirements and business rules must be reviewed when workflows,
commercial policies, roles, payment providers, or operational processes
change. Link major requirement changes to implementation issues, tests,
and architecture decisions.

Required change process:

1. **Describe the change** in this document first: capability, status
   transition, affected user roles, and acceptance criteria.
2. **Identify the authoritative backend location** for the rule. If the
   change affects money, inventory, permissions, or order state, require
   regression tests before implementation.
3. **Preserve existing contracts** unless the pull request includes a
   migration note for the frontend, API clients, and stored data.
4. **Do not introduce policy by UI copy.** New labels, fees, promises, or
   success states must match real backend behaviour.
5. **Update the baseline** — this PRD, `Architecture.md`, `Design.md`,
   and `CONTRIBUTING.md` as applicable — in the same pull request.
6. **Obtain owner approval** for commercial policy, pricing, refunds,
   seller eligibility, credit, or changes to customer-facing terms.

The current baseline is the starting point. Work that replaces or
reinterprets already-shipped behaviour without an explicit approved
change is considered a regression, not an improvement.
