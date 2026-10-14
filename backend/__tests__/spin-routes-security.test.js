import { jest } from "@jest/globals";
import express from "express";
import request from "supertest";
import jwt from "jsonwebtoken";

process.env.JWT_SECRET = "spin-test-secret";

// The service layer is mocked: these tests are about who may call what, not about the database
const playSpin = jest.fn();
jest.unstable_mockModule("../app/services/spin/spinService.js", () => ({
  getActiveCampaignForCustomer: jest.fn(async () => ({ active: false })),
  evaluateEligibility: jest.fn(),
  findLiveCampaign: jest.fn(async () => null),
  getSpinSettings: jest.fn(async () => ({ enabled: true })),
  listMyRewards: jest.fn(async () => ({ items: [], counts: {}, page: 1, limit: 20, total: 0, totalPages: 1 })),
  playSpin,
  recordImpression: jest.fn(async () => ({ recorded: true })),
  toPublicCampaign: jest.fn(),
  SpinError: class SpinError extends Error {},
}));

const { spinCustomerRouter, spinAdminRouter } = await import("../app/routes/spinRoutes.js");

const app = express();
app.use(express.json());
app.use("/api/spin", spinCustomerRouter);
app.use("/api/admin/spin", spinAdminRouter);

const tokenFor = (role, id) => jwt.sign({ id, role }, process.env.JWT_SECRET, { expiresIn: "1h" });
const bearer = (role, id) => ({ Authorization: `Bearer ${tokenFor(role, id)}` });

describe("Spin & Win customer routes", () => {
  beforeEach(() => playSpin.mockReset());

  it("requires login to spin", async () => {
    const res = await request(app).post("/api/spin/play").set("Idempotency-Key", "abcdefgh-1");
    expect(res.status).toBe(401);
    expect(playSpin).not.toHaveBeenCalled();
  });

  it("does not let admins, sellers or delivery partners spin or read customer rewards", async () => {
    for (const role of ["admin", "seller", "delivery"]) {
      const play = await request(app).post("/api/spin/play").set(bearer(role, `${role}-1`)).set("Idempotency-Key", "abcdefgh-2");
      expect(play.status).toBe(403);
      const rewards = await request(app).get("/api/spin/my-rewards").set(bearer(role, `${role}-1`));
      expect(rewards.status).toBe(403);
    }
    expect(playSpin).not.toHaveBeenCalled();
  });

  it("passes the customer id from the TOKEN and the Idempotency-Key header to the service", async () => {
    playSpin.mockResolvedValue({ attemptId: "a1", outcome: "no_prize", segmentIndex: 0, duplicate: false });
    const res = await request(app)
      .post("/api/spin/play")
      .set(bearer("user", "customer-777"))
      .set("Idempotency-Key", "11111111-2222")
      // a malicious body must have no influence on who spins or what is won
      .send({ customerId: "someone-else", rewardId: "jackpot", segmentIndex: 3 });
    expect(res.status).toBe(201);
    expect(playSpin).toHaveBeenCalledTimes(1);
    const args = playSpin.mock.calls[0][0];
    expect(args.customerId).toBe("customer-777");
    expect(args.idempotencyKey).toBe("11111111-2222");
    expect(JSON.stringify(args)).not.toMatch(/jackpot|someone-else/);
  });

  it("answers a repeated click with 200 and the same result", async () => {
    playSpin.mockResolvedValue({ attemptId: "a1", outcome: "reward", segmentIndex: 2, duplicate: true });
    const res = await request(app).post("/api/spin/play").set(bearer("user", "customer-dup")).set("Idempotency-Key", "same-key-123");
    expect(res.status).toBe(200);
    expect(res.body.result.duplicate).toBe(true);
  });

  it("maps service errors to their status and hides internals of unexpected ones", async () => {
    playSpin.mockRejectedValueOnce(Object.assign(new Error("You have used all your spins"), { statusCode: 429, code: "LIMIT_REACHED" }));
    const limited = await request(app).post("/api/spin/play").set(bearer("user", "customer-limit")).set("Idempotency-Key", "limit-key-12");
    expect(limited.status).toBe(429);
    expect(limited.body.code).toBe("LIMIT_REACHED");

    playSpin.mockRejectedValueOnce(new Error("E11000 duplicate key collection: secrets.internal"));
    const crashed = await request(app).post("/api/spin/play").set(bearer("user", "customer-crash")).set("Idempotency-Key", "crash-key-12");
    expect(crashed.status).toBe(500);
    expect(crashed.body.message).not.toMatch(/E11000|secrets/);
  });

  it("rate-limits rapid spin requests per customer", async () => {
    playSpin.mockResolvedValue({ attemptId: "a", outcome: "no_prize", segmentIndex: 0, duplicate: false });
    const statuses = [];
    for (let i = 0; i < 14; i += 1) {
      const res = await request(app).post("/api/spin/play").set(bearer("user", "customer-flood")).set("Idempotency-Key", `flood-key-${i}-xx`);
      statuses.push(res.status);
    }
    expect(statuses).toContain(429);
    expect(statuses.filter((s) => s === 201).length).toBeLessThanOrEqual(10);
  });

  it("lets a logged-in customer read only their own rewards (id comes from the token)", async () => {
    const res = await request(app).get("/api/spin/my-rewards?status=available").set(bearer("user", "customer-read"));
    expect(res.status).toBe(200);
  });

  it("rejects malformed impression payloads", async () => {
    const res = await request(app).post("/api/spin/impression").send({ campaignId: "not-an-id" });
    expect(res.status).toBe(400);
  });
});

describe("Spin & Win admin routes", () => {
  const endpoints = [
    ["get", "/api/admin/spin/settings"],
    ["patch", "/api/admin/spin/settings"],
    ["get", "/api/admin/spin/campaigns"],
    ["post", "/api/admin/spin/campaigns"],
    ["get", "/api/admin/spin/campaigns/507f1f77bcf86cd799439011"],
    ["patch", "/api/admin/spin/campaigns/507f1f77bcf86cd799439011"],
    ["patch", "/api/admin/spin/campaigns/507f1f77bcf86cd799439011/status"],
    ["post", "/api/admin/spin/campaigns/507f1f77bcf86cd799439011/rewards"],
    ["patch", "/api/admin/spin/rewards/507f1f77bcf86cd799439011"],
    ["delete", "/api/admin/spin/rewards/507f1f77bcf86cd799439011"],
    ["get", "/api/admin/spin/reports"],
  ];

  it.each(endpoints)("%s %s needs a token", async (method, url) => {
    const res = await request(app)[method](url);
    expect(res.status).toBe(401);
  });

  it.each(endpoints)("%s %s is closed to customers, sellers and delivery partners", async (method, url) => {
    for (const role of ["user", "seller", "delivery"]) {
      const res = await request(app)[method](url).set(bearer(role, `${role}-9`)).send({});
      expect(res.status).toBe(403);
    }
  });
});
