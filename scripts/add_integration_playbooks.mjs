import fs from 'fs';

const path = 'src/constants/knowledgeDocs.json';
const docs = JSON.parse(fs.readFileSync(path, 'utf8'));
const origin = 'AIntegration / Integration Engineer Playbooks';

const articles = [
  {
    title: 'Integration mapping methodology',
    origin,
    filename: 'ie-mapping-methodology.md',
    url: 'kb://aintegration/playbooks/ie-mapping-methodology.md',
    content: `Logiwa Integration Engineer — mapping methodology

Purpose:
Design a field mapping between a target system (ERP, marketplace, storefront, carrier) and Logiwa Open API / Webhooks without inventing Logiwa fields. Logiwa columns must come from Open API Swagger, Help Center, or indexed API support guides. Target columns are conceptual until verified against the target system's own API documentation.

Standard mapping table columns:
| TargetConcept | TargetField (verify) | LogiwaField | Transform | Notes |

Column definitions:
- TargetConcept: business object on the external system (Sales Order, Item, Tracking Number, ASN, etc.).
- TargetField (verify): candidate field path on the target API. Always treat as "verify against target docs" — never claim official third-party schema without their documentation.
- LogiwaField: exact property from Logiwa request/response schemas or webhook payload (e.g. code, sku, clientIdentifier, warehouseIdentifier).
- Transform: how to convert values (passthrough, lookup table, enum map, date to ISO-8601, nested→flat, unit conversion).
- Notes: required vs optional, defaults, multi-tenant client rules, idempotency.

Recommended workflow:
1. Name the flow and direction: inbound to Logiwa (create/update via Open API) or outbound from Logiwa (webhooks / list polls).
2. List Logiwa operations from Swagger (method + path) and webhook events from Webhook v2 when applicable.
3. Fill LogiwaField only from retrieved schemas or example JSON in knowledge docs.
4. Fill TargetField as placeholders and mark every row that needs engineer verification.
5. Add transforms for enums (status codes), identifiers (GUID vs external code), and time zones.
6. Document error handling: which HTTP codes retry, how duplicates are detected (e.g. Code.eq or channelOrderNumber).

Common transform patterns:
- Lookup: map target warehouse code → Logiwa warehouseIdentifier via Client/Warehouse list APIs.
- Enum map: target status string → Logiwa status / CurrentStatus values observed on webhooks.
- Identity: target SKU → Logiwa sku; keep case and packing unit rules explicit.
- Nesting: flatten target address object into shipmentAddress.* fields on ShipmentOrder.
- Dates: normalize to ISO-8601 for Logiwa date-time fields.

Anti-patterns:
- Inventing Logiwa property names not present in Swagger.
- Copying SAP/NetSuite/eBay field names as if they were confirmed facts.
- One giant sync without idempotency or clientIdentifier scoping.`,
  },
  {
    title: 'Integration architecture patterns',
    origin,
    filename: 'ie-architecture-patterns.md',
    url: 'kb://aintegration/playbooks/ie-architecture-patterns.md',
    content: `Logiwa Integration Engineer — architecture patterns

Patterns for connecting Logiwa to SAP, NetSuite, marketplaces, carriers, and storefronts.

1) Inbound command (target → Logiwa Open API)
- Authenticate with POST /v3.1/Authorize/token (Bearer).
- Create or update Logiwa entities via documented endpoints (Product/create, ShipmentOrder/create, PurchaseOrder/create, etc.).
- Use LQL list endpoints for lookups (Sku.eq, Code.eq, DisplayName.eq).
- Respect rate limit guidance (~6 req/s) and bulk limits (e.g. product create bulk max 50 per request in support guides).

2) Outbound event (Logiwa → target)
- Prefer Webhook Platform v2.0 at https://webhook.logiwa.com/ (JWT login, POST /v1/webhooks, GET /v1/events).
- Legacy alternative: /v3.1/Helper/webhooktopics + /v3.1/Webhook/create on myapi.logiwa.com when the customer still uses V1 topics.
- Respond to webhook POSTs within 10 seconds (V2); process asynchronously; verify HMAC headers.

3) Poll / reconcile
- Periodic list calls with LQL date windows (e.g. ActualShipmentDate.bt=...) when webhooks are unavailable or for catch-up.
- Store last successful watermark; avoid full table scans.

4) Multi-tenant / client scoping
- Logiwa often requires clientIdentifier on creates or allows ignoreClient / allowedClientIdentifiers on webhooks.
- Resolve client GUIDs via Client/list before mapping.

5) Idempotency and retries
- Choose a natural business key (order code, channelOrderNumber, SKU+client) and check existence with list/LQL before create.
- Retry 5xx / network; do not blindly retry 4xx without fixing the payload.
- For V2 webhooks: 2xx success, 4xx permanent fail, 5xx/429 retryable.

6) Sync vs async
- Synchronous: small create/update with immediate HTTP response.
- Asynchronous: bulk endpoints that require webhook subscription for results (e.g. product create bulk + openapi/product/create/bulk topic in legacy guides).

Integration Engineer deliverables:
- Sequence diagram (auth → lookup → create → webhook → target update)
- Mapping table (see Integration mapping methodology)
- Error catalog and runbook
- Sandbox vs production base URLs: myapisandbox.logiwa.com / myapi.logiwa.com`,
  },
  {
    title: 'ERP product and inventory sync playbook (SAP NetSuite style)',
    origin,
    filename: 'ie-erp-product-inventory.md',
    url: 'kb://aintegration/playbooks/ie-erp-product-inventory.md',
    content: `Logiwa Integration Engineer — ERP product & inventory sync (SAP / NetSuite style)

Scope:
Typical ERP master-data and inventory sync into Logiwa. Target field names below are conceptual — verify against SAP / NetSuite (or other ERP) API docs.

Direction A — Product master inbound (ERP → Logiwa)
Logiwa side (from Open API / support guides):
- POST /v3.1/Product/create and/or Product/create/bulk
- PUT /v3.1/Product/update (send full existing payload plus changes)
- Lookups: Product/list with Sku.eq and ClientIdentifier.eq; Helper endpoints for pack/weight/dimension units

Example mapping rows (TargetField = verify):
| TargetConcept | TargetField (verify) | LogiwaField | Transform | Notes |
| Item | ItemCode / itemid (verify) | sku | passthrough | Unique per client |
| Item | DisplayName (verify) | name | passthrough | |
| Item | Barcode (verify) | upc[] | wrap as array | |
| Item | Client / Subsidiary (verify) | clientIdentifier | GUID lookup via Client/list | |
| Item | UoM (verify) | uomPackTypeName | enum/map to Logiwa pack type | Often "Unit" |
| Item | Weight/Dims (verify) | packingSettings.* | unit IDs from Helper/*unittypes | |

Kit items: kitTypeId 1 = kit-to-order, 2 = kit-to-stock; kitComponentList.componentProductIdentifier + quantity from Product/list.

Bulk: max 50 products per bulk request in Magna support guide; subscribe bulk webhook topic for results when using bulk create.

Direction B — Inventory visibility (Logiwa → ERP or ERP ← Logiwa list)
Logiwa side:
- GET Inventory/list and Inventory/kit/list with InventoryStatusId.eq and Location / Sku filters
- Webhook V2 InventoryMovementRecorded (legacy topic wms/inventory/transaction) for near-real-time movements

Map TransactionTypeDefinition, ProductSKU, From/To location codes, Action/To quantities to ERP inventory adjustment or transfer concepts — verify ERP posting object names.

Do not invent ERP BAPI/SuiteTalk property names; use placeholder TargetField and mark verify.`,
  },
  {
    title: 'Marketplace and storefront order ingest playbook (eBay Squarespace style)',
    origin,
    filename: 'ie-marketplace-order-ingest.md',
    url: 'kb://aintegration/playbooks/ie-marketplace-order-ingest.md',
    content: `Logiwa Integration Engineer — marketplace / storefront order ingest (eBay / Squarespace style)

Scope:
Pull or receive sales orders from a marketplace/storefront and create shipment orders in Logiwa; push status and tracking back.

Inbound — create shipment order in Logiwa
Logiwa side:
- POST /v3.1/ShipmentOrder/create (and bulk variants when documented)
- Lookups: warehouseIdentifier, clientIdentifier, shippingOptionIdentifier, carrierId as required by schema
- Example payload fields from support guides: code, channelOrderNumber, customer, shipmentAddress, shipmentOrderLineList (sku, packType, packQuantity, unitPrice), tags, giftNote

Example mapping (TargetField = verify against eBay / Squarespace / similar docs):
| TargetConcept | TargetField (verify) | LogiwaField | Transform | Notes |
| Order | orderId / order_number (verify) | code or channelOrderNumber | choose one as business key | Use LQL Code.eq before recreate |
| Order | buyer name/email (verify) | customer.* / shipmentAddress.* | split first/last | |
| Order | ship-to address (verify) | shipmentAddress.* | country/state codes | |
| Line | SKU (verify) | shipmentOrderLineList.sku | must exist in Logiwa Product | |
| Line | qty (verify) | packQuantity | number | |
| Order | paid/ready status (verify) | (gate create) | only create when fulfillable | |

Outbound — status & shipment back to marketplace
Logiwa Webhook V2 events (prefer webhook.logiwa.com):
- ShipmentStatusChanged ← legacy wms/shipmentorder/statuschange
- ShipmentOrderCreated ← wms/shipmentorder/create
- ShipmentDispatched ← wms/shipmentorder/shipment
- ShipmentDetailsUpdated ← wms/shipmentorder/update

Use CurrentStatus / tracking fields from webhook payloads (see Shipment Inventory Webhook Guide) to call marketplace "mark as shipped" APIs — verify those target endpoints separately.

Idempotency: store mapping of marketplace order id ↔ Logiwa ShipmentOrder identifier/code.`,
  },
  {
    title: 'Carrier and shipping label flow playbook (Shippo FedEx style)',
    origin,
    filename: 'ie-carrier-shipping.md',
    url: 'kb://aintegration/playbooks/ie-carrier-shipping.md',
    content: `Logiwa Integration Engineer — carrier / label flow (Shippo / FedEx style)

Scope:
Connect Logiwa shipment lifecycle to external rating, label purchase, or carrier systems (Shippo, FedEx, UPS-style platforms). Target API field names must be verified in carrier docs.

Logiwa-side anchors:
- Shipment order fields related to carrier: carrierId, shippingOptionIdentifier, carrierPackageName, currentTrackingNumber, totalShippingCost, packingInstructions (from create examples / schemas)
- Webhook V2 ShipmentDispatched (legacy wms/shipmentorder/shipment) for package list, tracking numbers, carrier names
- ShipmentStatusChanged for WMS status progression

Typical flow options:
A) Logiwa-native carrier setup: configure carrier in Logiwa; integration only syncs tracking outbound via webhook.
B) External label provider: integration reads ready-to-ship orders from Logiwa (list/LQL or status webhook), calls Shippo/FedEx (verify) to buy label, then writes tracking back via Logiwa update endpoints if available in Swagger — only use update fields present in retrieved schemas.

Example mapping (TargetField = verify):
| TargetConcept | TargetField (verify) | LogiwaField | Transform | Notes |
| Shipment | tracking_number (verify) | currentTrackingNumber / webhook MasterTrackingNumber | passthrough | From ShipmentDispatched payload examples |
| Shipment | carrier account (verify) | carrierId / CarrierSetup | lookup table | |
| Package | weight/dims (verify) | packing / package fields on webhook ProductList | unit convert | |
| Rate | service level (verify) | shippingOptionIdentifier | GUID lookup | |

Security: never log full carrier API keys; store secrets outside chat.

Always cite Logiwa webhook/Open API sources for Logiwa columns; mark carrier columns as verify.`,
  },
  {
    title: 'Purchase order and receiving integration playbook',
    origin,
    filename: 'ie-purchase-order-receiving.md',
    url: 'kb://aintegration/playbooks/ie-purchase-order-receiving.md',
    content: `Logiwa Integration Engineer — purchase order & receiving integration

Scope:
ERP or supplier systems create expected receipts in Logiwa; receiving completion flows back via webhooks and detail APIs.

Inbound — create PO in Logiwa
Logiwa side:
- POST /v3.1/PurchaseOrder/create
- Related: purchase order type setup endpoints; receive endpoint POST /v3.1/PurchaseOrder/receive when used
- Example fields from support JSON: code, clientIdentifier, vendor, purchaseOrderTypeName, warehouseIdentifier, purchaseOrderDate, plannedReceivingDate, plannedArrivalDate, referenceNumber, purchaseOrderLineList (sku, packType, packQuantity, warehouseLocation, lotBatchNumber, expiryDate, …)

Example mapping (TargetField = verify against ERP ASN/PO APIs):
| TargetConcept | TargetField (verify) | LogiwaField | Transform | Notes |
| PurchaseOrder | DocNum / po_number (verify) | code | passthrough | Idempotent Code.eq check |
| PurchaseOrder | vendor code (verify) | vendor | map vendor master | |
| PurchaseOrder | warehouse (verify) | warehouseIdentifier | GUID lookup | |
| Line | item (verify) | sku | must exist | |
| Line | qty (verify) | packQuantity | | |

Outbound — receiving / status
- Webhook V2 PurchaseOrderStatusChanged (legacy wms/purchaseorder/statuschange)
- PO Receipt playbook: on Completed status, call PurchaseOrder/detail/{identifier} for line-level received quantities and missing qty calculation
- Save Identifier and Code from webhook for subsequent GETs

Integration checklist:
1. Create PO when ERP releases ASN/PO
2. Subscribe status webhook
3. On Completed, pull detail and post goods receipt in ERP (verify ERP API)
4. Handle partial receipts via status + detail deltas`,
  },
  {
    title: 'Webhook-driven outbound sync checklist',
    origin,
    filename: 'ie-webhook-outbound-checklist.md',
    url: 'kb://aintegration/playbooks/ie-webhook-outbound-checklist.md',
    content: `Logiwa Integration Engineer — webhook-driven outbound sync checklist

Prefer Webhook Platform v2.0 (https://webhook.logiwa.com/) for new work.

V2 setup checklist:
1. POST /v1/auth/login with Email + Password → Bearer JWT
2. GET /v1/events for live event IDs
3. POST /v1/webhooks with url (HTTPS), event, allowedClientIdentifiers ([] = all clients), active
4. Whitelist delivery IPs 18.116.226.248 and 3.151.75.183
5. Verify HMAC (x-mylogiwa-hmac-sha256); respond 2xx within 10 seconds
6. Expect up to 5 minutes cache delay after create/update

V2 event ↔ legacy V1 topic map (for migration):
| V2 Event | Legacy V1 topic |
| ShipmentStatusChanged | wms/shipmentorder/statuschange |
| ShipmentOrderCreated | wms/shipmentorder/create |
| ShipmentDetailsUpdated | wms/shipmentorder/update |
| ShipmentDispatched | wms/shipmentorder/shipment |
| ProductCreated | wms/product/create |
| ProductInformationUpdated | wms/product/update |
| PurchaseOrderStatusChanged | wms/purchaseorder/statuschange |
| InventoryMovementRecorded | wms/inventory/transaction |
| ShipmentOrderMergeActions | wms/shipmentorder/mergeorder |

Legacy Open API path (when required): Helper/webhooktopics → Webhook/create with topic + address + clientIdentifier/ignoreClient.

Outbound sync design:
- Subscribe only to events needed for the connector (start with one)
- Persist event-id / subscription-id headers to detect duplicates
- Map webhook payload fields to target system update APIs using the mapping methodology table
- Fall back to LQL list reconciliation jobs for missed events

Do not use blocked testing URL domains (webhook.site and similar) on V2.`,
  },
];

const titles = new Set(articles.map((a) => a.title));
const kept = docs.filter((d) => !titles.has(d.title));
const next = [...kept, ...articles];
fs.writeFileSync(path, `${JSON.stringify(next, null, 2)}\n`);
console.log(`knowledgeDocuments=${next.length}`);
articles.forEach((a) => console.log(`- ${a.title}`));
