const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');

const {
  formatDate,
  calculateTwoMonthsExpiry,
  isAccountExpired,
} = require('../utils/dateHelper');
const { protect, authorize } = require('../Middlewares/auth');
const { registerUser } = require('../Controllers/userController');
const User = require('../Models/User');
const Admin = require('../Models/Admin');

const createMockRes = () => {
  const res = {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
  return res;
};

describe('utils/dateHelper.js', () => {
  it('formatDate formats Date objects and YYYY-MM-DD strings consistently', () => {
    assert.equal(formatDate(new Date(2026, 10, 5)), 'Nov 5, 2026');
    assert.equal(formatDate('2026-11-05'), 'Nov 5, 2026');
    assert.equal(formatDate(null), '');
  });

  it('calculateTwoMonthsExpiry adds two months to the given date', () => {
    assert.equal(calculateTwoMonthsExpiry(new Date(2026, 0, 15)), 'Mar 15, 2026');
    assert.equal(calculateTwoMonthsExpiry('2026-11-05'), 'Jan 5, 2027');
  });

  it('isAccountExpired handles admin, perpetual, past, today, and future dates', () => {
    assert.equal(isAccountExpired('2020-01-01', 'admin'), false);
    assert.equal(isAccountExpired('Perpetual', 'user'), false);
    assert.equal(isAccountExpired(null, 'user'), false);
    assert.equal(isAccountExpired('2020-01-01', 'user'), true);
    assert.equal(isAccountExpired('2099-12-31', 'user'), false);

    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    assert.equal(isAccountExpired(`${yyyy}-${mm}-${dd}`, 'user'), false);
  });
});

describe('Middlewares/auth.js', () => {
  let originalSecret;

  before(() => {
    originalSecret = process.env.JWT_SECRET;
    process.env.JWT_SECRET = 'unit-test-jwt-secret';
  });

  after(() => {
    if (originalSecret === undefined) {
      delete process.env.JWT_SECRET;
    } else {
      process.env.JWT_SECRET = originalSecret;
    }
  });

  it('protect rejects requests with missing authorization header', async () => {
    const req = { headers: {} };
    const res = createMockRes();
    let nextCalled = false;

    await protect(req, res, () => {
      nextCalled = true;
    });

    assert.equal(nextCalled, false);
    assert.equal(res.statusCode, 401);
    assert.equal(res.body.success, false);
    assert.match(res.body.message, /no token provided/i);
  });

  it('protect rejects requests with non-Bearer authorization header', async () => {
    const req = { headers: { authorization: 'Basic dXNlcjpwYXNz' } };
    const res = createMockRes();
    let nextCalled = false;

    await protect(req, res, () => {
      nextCalled = true;
    });

    assert.equal(nextCalled, false);
    assert.equal(res.statusCode, 401);
    assert.equal(res.body.success, false);
  });

  it('protect rejects requests with invalid Bearer token', async (t) => {
    t.mock.method(console, 'error', () => {});
    const req = { headers: { authorization: 'Bearer invalid.jwt.token' } };
    const res = createMockRes();
    let nextCalled = false;

    await protect(req, res, () => {
      nextCalled = true;
    });

    assert.equal(nextCalled, false);
    assert.equal(res.statusCode, 401);
    assert.equal(res.body.success, false);
    assert.match(res.body.message, /token failed/i);
  });

  it('authorize rejects requests with missing user or unauthorized role', () => {
    const middleware = authorize('admin');

    const reqNoUser = {};
    const resNoUser = createMockRes();
    let nextNoUser = false;
    middleware(reqNoUser, resNoUser, () => {
      nextNoUser = true;
    });
    assert.equal(nextNoUser, false);
    assert.equal(resNoUser.statusCode, 403);
    assert.equal(resNoUser.body.success, false);

    const reqWrongRole = { user: { role: 'user' } };
    const resWrongRole = createMockRes();
    let nextWrongRole = false;
    middleware(reqWrongRole, resWrongRole, () => {
      nextWrongRole = true;
    });
    assert.equal(nextWrongRole, false);
    assert.equal(resWrongRole.statusCode, 403);
    assert.equal(resWrongRole.body.success, false);
  });

  it('authorize allows requests with an authorized role', () => {
    const middleware = authorize('admin', 'instructor');
    const req = { user: { role: 'admin' } };
    const res = createMockRes();
    let nextCalled = false;

    middleware(req, res, () => {
      nextCalled = true;
    });

    assert.equal(nextCalled, true);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body, null);
  });
});

describe('Controllers/userController.js - registerUser', () => {
  let originalSecret;

  before(() => {
    originalSecret = process.env.JWT_SECRET;
    process.env.JWT_SECRET = 'unit-test-jwt-secret';
  });

  after(() => {
    if (originalSecret === undefined) {
      delete process.env.JWT_SECRET;
    } else {
      process.env.JWT_SECRET = originalSecret;
    }
  });

  it('forces subscribed to false and planType to Free even if client sends subscribed: true, planType: Pro', async (t) => {
    let capturedCreatePayload = null;

    t.mock.method(User, 'findOne', async () => null);
    t.mock.method(Admin, 'findOne', async () => null);
    t.mock.method(User, 'create', async (payload) => {
      capturedCreatePayload = payload;
      return {
        _id: 'mock-user-id-123',
        ...payload,
        courses: [],
      };
    });

    const req = {
      body: {
        name: 'Jane Doe',
        email: 'jane@example.com',
        phoneNumber: '+15551234567',
        password: 'securePassword123',
        subscribed: true,
        planType: 'Pro',
      },
      headers: {
        'user-agent': 'node-test-runner',
      },
      socket: {
        remoteAddress: '127.0.0.1',
      },
    };
    const res = createMockRes();

    await registerUser(req, res);

    assert.equal(res.statusCode, 201);
    assert.equal(res.body.success, true);
    assert.ok(capturedCreatePayload, 'User.create should have been called');
    assert.equal(capturedCreatePayload.subscribed, false);
    assert.equal(capturedCreatePayload.planType, 'Free');
    assert.equal(res.body.data.subscribed, false);
    assert.equal(res.body.data.planType, 'Free');
  });
});
