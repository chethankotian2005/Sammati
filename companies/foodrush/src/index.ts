/**
 * FoodRush demo backend — Food delivery fiduciary.
 * Guarded by @sammati/gateway SDK per docs/drd.md §5 & docs/trd.md §7.
 * Port: 4103
 */

import express, { type Request, type Response } from "express";
import { sammati } from "@sammati/gateway";
import { SEED_FIDUCIARIES, demoApiKey } from "@sammati/shared";

const company = SEED_FIDUCIARIES.find((f) => f.slug === "foodrush")!;
const port = Number(process.env.PORT ?? company.port);

const gate = sammati({
  coreUrl: process.env.CORE_URL ?? "http://localhost:4000",
  fiduciary: company.address,
  apiKey: process.env.SAMMATI_API_KEY ?? demoApiKey(company.slug),
  signer: process.env.FIDUCIARY_KEY,
});

const app = express();
app.use(express.json());

// CORS headers so browser console at localhost:5173 can call directly
app.use((_req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, x-sammati-principal");
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  if (_req.method === "OPTIONS") {
    res.sendStatus(200);
    return;
  }
  next();
});

// Helper for extracting principal address
const getPrincipal = (req: Request) =>
  req.header("x-sammati-principal") ??
  (req.query.principal as string) ??
  req.body?.principal;

// Short simulated delay (drd.md §5)
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// --- 1. Health route ---
app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    company: company.name,
    fiduciary: company.address,
    port,
    sector: company.sector,
    uptime: process.uptime(),
  });
});

// --- 2. Purpose: delivery (Live GPS location & delivery address) ---
const deliveryHandler = async (req: Request, res: Response) => {
  await delay(60);
  res.json({
    customerId: req.params.id || "FOOD-4821",
    homeArea: "Indiranagar",
    lastOrders: 14,
    activeOrder: {
      orderId: "ORD-89210",
      rider: "Ramesh K.",
      currentLocation: {
        lat: 12.9716,
        lng: 77.5946,
        area: "Indiranagar 100ft Rd, Bengaluru",
      },
      etaMinutes: 12,
      status: "out_for_delivery",
      deliveryAddressType: "home",
    },
    timestamp: Math.floor(Date.now() / 1000),
  });
};

app.get(
  "/customers/:id/profile",
  gate.requireConsent({ purpose: "delivery", principalFrom: getPrincipal }),
  deliveryHandler,
);
app.get(
  "/orders/current/location",
  gate.requireConsent({ purpose: "delivery", principalFrom: getPrincipal }),
  deliveryHandler,
);

// --- 3. Purpose: ad_targeting (Personalised ads with AdNetworkZ) ---
app.all(
  "/ads/recommendations",
  gate.requireConsent({ purpose: "ad_targeting", principalFrom: getPrincipal }),
  async (_req: Request, res: Response) => {
    await delay(75);
    res.json({
      partner: "AdNetworkZ",
      profileSegment: "weekend_foodie",
      recommendedCuisines: ["biryani", "north_indian", "desserts"],
      discountCode: "WEEKEND50",
      campaignTitle: "50% off on your favourite Biryani this weekend!",
      bannerUrl: "https://foodrush.demo/promos/biryani.png",
      targetedAt: Math.floor(Date.now() / 1000),
      frequencyCapPerDay: 3,
    });
  },
);

// --- 4. Purpose: partner_share (Kitchen dispatch to restaurant partners) ---
app.all(
  "/orders/partner-dispatch",
  gate.requireConsent({ purpose: "partner_share", principalFrom: getPrincipal }),
  async (_req: Request, res: Response) => {
    await delay(80);
    res.json({
      restaurantId: "REST-MTR-01",
      restaurantName: "MTR Indiranagar",
      orderId: "ORD-89210",
      items: [
        { item: "Masala Dosa", qty: 2, price: 180 },
        { item: "Filter Coffee", qty: 2, price: 90 },
      ],
      specialInstructions: "Extra crispy, sambar on the side",
      dispatchStatus: "sent_to_kitchen",
      prepEstimatedMins: 15,
      notifiedPartnerAt: Math.floor(Date.now() / 1000),
    });
  },
);

app.listen(port, () => {
  console.log(`[FoodRush] demo backend listening on http://localhost:${port}`);
});
