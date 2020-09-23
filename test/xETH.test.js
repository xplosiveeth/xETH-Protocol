const xETH = artifacts.require('xETH.sol');

const BigNumber = web3.BigNumber;
const _require = require('app-root-path').require;
const chain = new BlockchainCaller(web3);

require('chai')
  .use(require('chai-bignumber')(BigNumber))
  .should();

let xETH, mockxETH, mockMarketOracle, mockCpiOracle;
let r, prevEpoch, prevTime;
let deployer, user, orchestrator;

const MAX_RATE = (new BigNumber('1')).mul(10 ** 6 * 10 ** 18);
const MAX_SUPPLY = (new BigNumber(2).pow(255).minus(1)).div(MAX_RATE);
const BASE_CPI = new BigNumber(100e18);
const INITIAL_CPI = new BigNumber(251.712e18);
const INITIAL_CPI_25P_MORE = INITIAL_CPI.mul(1.25).dividedToIntegerBy(1);
const INITIAL_CPI_25P_LESS = INITIAL_CPI.mul(0.77).dividedToIntegerBy(1);
const INITIAL_RATE = INITIAL_CPI.mul(1e18).dividedToIntegerBy(BASE_CPI);
const INITIAL_RATE_30P_MORE = INITIAL_RATE.mul(1.3).dividedToIntegerBy(1);
const INITIAL_RATE_30P_LESS = INITIAL_RATE.mul(0.7).dividedToIntegerBy(1);
const INITIAL_RATE_5P_MORE = INITIAL_RATE.mul(1.05).dividedToIntegerBy(1);
const INITIAL_RATE_5P_LESS = INITIAL_RATE.mul(0.95).dividedToIntegerBy(1);
const INITIAL_RATE_60P_MORE = INITIAL_RATE.mul(1.6).dividedToIntegerBy(1);
const INITIAL_RATE_2X = INITIAL_RATE.mul(2);

async function setupContracts () {
  await chain.waitForSomeTime(86400);
  const accounts = await chain.getUserAccounts();
  deployer = accounts[0];
  user = accounts[1];
  orchestrator = accounts[2];
  mockxETH = await MockxETH.new();
  mockMarketOracle = await MockOracle.new('MarketOracle');
  mockCpiOracle = await MockOracle.new('CpiOracle');
  xETH = await xETH.new();
  await xETH.sendTransaction({
    data: encodeCall('initialize', ['address', 'address', 'uint256'], [deployer, mockxETH.address, BASE_CPI.toString()]),
    from: deployer
  });
  await xETH.setMarketOracle(mockMarketOracle.address);
  await xETH.setCpiOracle(mockCpiOracle.address);
  await xETH.setOrchestrator(orchestrator);
}

async function setupContractsWithOpenRebaseWindow () {
  await setupContracts();
  await xETH.setRebaseTimingParameters(60, 0, 60);
}

async function mockExternalData (rate, cpi, uFragSupply, rateValidity = true, cpiValidity = true) {
  await mockMarketOracle.storeData(rate);
  await mockMarketOracle.storeValidity(rateValidity);
  await mockCpiOracle.storeData(cpi);
  await mockCpiOracle.storeValidity(cpiValidity);
  await mockxETH.storeSupply(uFragSupply);
}

contract('xETH', function (accounts) {
  before('setup xETH contract', setupContracts);

  it('should reject any ether sent to it', async function () {
    expect(
      await chain.isEthException(xETH.sendTransaction({ from: user, value: 1 }))
    ).to.be.true;
  });
});

contract('xETH:initialize', async function (accounts) {
  describe('initial values set correctly', function () {
    before('setup xETH contract', setupContracts);

    it('deviationThreshold', async function () {
      (await xETH.deviationThreshold.call()).should.be.bignumber.eq(0.05e18);
    });
    it('rebaseLag', async function () {
      (await xETH.rebaseLag.call()).should.be.bignumber.eq(30);
    });
    it('minRebaseTimeIntervalSec', async function () {
      (await xETH.minRebaseTimeIntervalSec.call()).should.be.bignumber.eq(24 * 60 * 60);
    });
    it('epoch', async function () {
      (await xETH.epoch.call()).should.be.bignumber.eq(0);
    });
    it('rebaseWindowOffsetSec', async function () {
      (await xETH.rebaseWindowOffsetSec.call()).should.be.bignumber.eq(72000);
    });
    it('rebaseWindowLengthSec', async function () {
      (await xETH.rebaseWindowLengthSec.call()).should.be.bignumber.eq(900);
    });
    it('should set owner', async function () {
      expect(await xETH.owner.call()).to.eq(deployer);
    });
    it('should set reference to xETH', async function () {
      expect(await xETH.uFrags.call()).to.eq(mockxETH.address);
    });
  });
});

contract('xETH:setMarketOracle', async function (accounts) {
  before('setup xETH contract', setupContracts);

  it('should set marketOracle', async function () {
    await xETH.setMarketOracle(deployer);
    expect(await xETH.marketOracle.call()).to.eq(deployer);
  });
});

contract('xETH:setMarketOracle:accessControl', function (accounts) {
  before('setup xETH contract', setupContracts);

  it('should be callable by owner', async function () {
    expect(
      await chain.isEthException(xETH.setMarketOracle(deployer, { from: deployer }))
    ).to.be.false;
  });

  it('should NOT be callable by non-owner', async function () {
    expect(
      await chain.isEthException(xETH.setMarketOracle(deployer, { from: user }))
    ).to.be.true;
  });
});

contract('xETH:setCpiOracle', async function (accounts) {
  before('setup xETH contract', setupContracts);

  it('should set cpiOracle', async function () {
    await xETH.setCpiOracle(deployer);
    expect(await xETH.cpiOracle.call()).to.eq(deployer);
  });
});

contract('xETH:setCpiOracle:accessControl', function (accounts) {
  before('setup xETH contract', setupContracts);

  it('should be callable by owner', async function () {
    expect(
      await chain.isEthException(xETH.setCpiOracle(deployer, { from: deployer }))
    ).to.be.false;
  });

  it('should NOT be callable by non-owner', async function () {
    expect(
      await chain.isEthException(xETH.setCpiOracle(deployer, { from: user }))
    ).to.be.true;
  });
});

contract('xETH:setOrchestrator', async function (accounts) {
  before('setup xETH contract', setupContracts);

  it('should set orchestrator', async function () {
    await xETH.setOrchestrator(user, {from: deployer});
    expect(await xETH.orchestrator.call()).to.eq(user);
  });
});

contract('xETH:setOrchestrator:accessControl', function (accounts) {
  before('setup xETH contract', setupContracts);

  it('should be callable by owner', async function () {
    expect(
      await chain.isEthException(xETH.setOrchestrator(deployer, { from: deployer }))
    ).to.be.false;
  });

  it('should NOT be callable by non-owner', async function () {
    expect(
      await chain.isEthException(xETH.setOrchestrator(deployer, { from: user }))
    ).to.be.true;
  });
});

contract('xETH:setDeviationThreshold', async function (accounts) {
  let prevThreshold, threshold;
  before('setup xETH contract', async function () {
    await setupContracts();
    prevThreshold = await xETH.deviationThreshold.call();
    threshold = prevThreshold.plus(0.01e18);
    await xETH.setDeviationThreshold(threshold);
  });

  it('should set deviationThreshold', async function () {
    (await xETH.deviationThreshold.call()).should.be.bignumber.eq(threshold);
  });
});

contract('xETH:setDeviationThreshold:accessControl', function (accounts) {
  before('setup xETH contract', setupContracts);

  it('should be callable by owner', async function () {
    expect(
      await chain.isEthException(xETH.setDeviationThreshold(0, { from: deployer }))
    ).to.be.false;
  });

  it('should NOT be callable by non-owner', async function () {
    expect(
      await chain.isEthException(xETH.setDeviationThreshold(0, { from: user }))
    ).to.be.true;
  });
});

contract('xETH:setRebaseLag', async function (accounts) {
  let prevLag;
  before('setup xETH contract', async function () {
    await setupContracts();
    prevLag = await xETH.rebaseLag.call();
  });

  describe('when rebaseLag is more than 0', async function () {
    it('should setRebaseLag', async function () {
      const lag = prevLag.plus(1);
      await xETH.setRebaseLag(lag);
      (await xETH.rebaseLag.call()).should.be.bignumber.eq(lag);
    });
  });

  describe('when rebaseLag is 0', async function () {
    it('should fail', async function () {
      expect(
        await chain.isEthException(xETH.setRebaseLag(0))
      ).to.be.true;
    });
  });
});

contract('xETH:setRebaseLag:accessControl', function (accounts) {
  before('setup xETH contract', setupContracts);

  it('should be callable by owner', async function () {
    expect(
      await chain.isEthException(xETH.setRebaseLag(1, { from: deployer }))
    ).to.be.false;
  });

  it('should NOT be callable by non-owner', async function () {
    expect(
      await chain.isEthException(xETH.setRebaseLag(1, { from: user }))
    ).to.be.true;
  });
});

contract('xETH:setRebaseTimingParameters', async function (accounts) {
  before('setup xETH contract', async function () {
    await setupContracts();
  });

  describe('when interval=0', function () {
    it('should fail', async function () {
      expect(
        await chain.isEthException(xETH.setRebaseTimingParameters(0, 0, 0))
      ).to.be.true;
    });
  });

  describe('when offset > interval', function () {
    it('should fail', async function () {
      expect(
        await chain.isEthException(xETH.setRebaseTimingParameters(300, 3600, 300))
      ).to.be.true;
    });
  });

  describe('when params are valid', function () {
    it('should setRebaseTimingParameters', async function () {
      await xETH.setRebaseTimingParameters(600, 60, 300);
      (await xETH.minRebaseTimeIntervalSec.call()).should.be.bignumber.eq(600);
      (await xETH.rebaseWindowOffsetSec.call()).should.be.bignumber.eq(60);
      (await xETH.rebaseWindowLengthSec.call()).should.be.bignumber.eq(300);
    });
  });
});

contract('xETH:setRebaseTimingParameters:accessControl', function (accounts) {
  before('setup xETH contract', setupContracts);

  it('should be callable by owner', async function () {
    expect(
      await chain.isEthException(xETH.setRebaseTimingParameters(600, 60, 300, { from: deployer }))
    ).to.be.false;
  });

  it('should NOT be callable by non-owner', async function () {
    expect(
      await chain.isEthException(xETH.setRebaseTimingParameters(600, 60, 300, { from: user }))
    ).to.be.true;
  });
});

contract('xETH:Rebase:accessControl', async function (accounts) {
  beforeEach('setup xETH contract', async function () {
    await setupContractsWithOpenRebaseWindow();
    await mockExternalData(INITIAL_RATE_30P_MORE, INITIAL_CPI, 1000, true);
    await chain.waitForSomeTime(60);
  });

  describe('when rebase called by orchestrator', function () {
    it('should succeed', async function () {
      expect(
        await chain.isEthException(xETH.rebase({from: orchestrator}))
      ).to.be.false;
    });
  });

  describe('when rebase called by non-orchestrator', function () {
    it('should fail', async function () {
      expect(
        await chain.isEthException(xETH.rebase({from: user}))
      ).to.be.true;
    });
  });
});

contract('xETH:Rebase', async function (accounts) {
  before('setup xETH contract', setupContractsWithOpenRebaseWindow);

  describe('when minRebaseTimeIntervalSec has NOT passed since the previous rebase', function () {
    before(async function () {
      await mockExternalData(INITIAL_RATE_30P_MORE, INITIAL_CPI, 1010);
      await chain.waitForSomeTime(60);
      await xETH.rebase({from: orchestrator});
    });

    it('should fail', async function () {
      expect(
        await chain.isEthException(xETH.rebase({from: orchestrator}))
      ).to.be.true;
    });
  });
});

contract('xETH:Rebase', async function (accounts) {
  before('setup xETH contract', setupContractsWithOpenRebaseWindow);

  describe('when rate is within deviationThreshold', function () {
    before(async function () {
      await xETH.setRebaseTimingParameters(60, 0, 60);
    });

    it('should return 0', async function () {
      await mockExternalData(INITIAL_RATE.minus(1), INITIAL_CPI, 1000);
      await chain.waitForSomeTime(60);
      r = await xETH.rebase({from: orchestrator});
      r.logs[0].args.requestedSupplyAdjustment.should.be.bignumber.eq(0);
      await chain.waitForSomeTime(60);

      await mockExternalData(INITIAL_RATE.plus(1), INITIAL_CPI, 1000);
      r = await xETH.rebase({from: orchestrator});
      r.logs[0].args.requestedSupplyAdjustment.should.be.bignumber.eq(0);
      await chain.waitForSomeTime(60);

      await mockExternalData(INITIAL_RATE_5P_MORE.minus(2), INITIAL_CPI, 1000);
      r = await xETH.rebase({from: orchestrator});
      r.logs[0].args.requestedSupplyAdjustment.should.be.bignumber.eq(0);
      await chain.waitForSomeTime(60);

      await mockExternalData(INITIAL_RATE_5P_LESS.plus(2), INITIAL_CPI, 1000);
      r = await xETH.rebase({from: orchestrator});
      r.logs[0].args.requestedSupplyAdjustment.should.be.bignumber.eq(0);
      await chain.waitForSomeTime(60);
    });
  });
});

contract('xETH:Rebase', async function (accounts) {
  before('setup xETH contract', setupContractsWithOpenRebaseWindow);

  describe('when rate is more than MAX_RATE', function () {
    it('should return same supply delta as delta for MAX_RATE', async function () {
      // Any exchangeRate >= (MAX_RATE=100x) would result in the same supply increase
      await mockExternalData(MAX_RATE, INITIAL_CPI, 1000);
      await chain.waitForSomeTime(60);
      r = await xETH.rebase({from: orchestrator});
      const supplyChange = r.logs[0].args.requestedSupplyAdjustment;

      await chain.waitForSomeTime(60);

      await mockExternalData(MAX_RATE.add(1e17), INITIAL_CPI, 1000);
      r = await xETH.rebase({from: orchestrator});
      r.logs[0].args.requestedSupplyAdjustment.should.be.bignumber.eq(supplyChange);

      await chain.waitForSomeTime(60);

      await mockExternalData(MAX_RATE.mul(2), INITIAL_CPI, 1000);
      r = await xETH.rebase({from: orchestrator});
      r.logs[0].args.requestedSupplyAdjustment.should.be.bignumber.eq(supplyChange);
    });
  });
});

contract('xETH:Rebase', async function (accounts) {
  before('setup xETH contract', setupContractsWithOpenRebaseWindow);

  describe('when xETH grows beyond MAX_SUPPLY', function () {
    before(async function () {
      await mockExternalData(INITIAL_RATE_2X, INITIAL_CPI, MAX_SUPPLY.minus(1));
      await chain.waitForSomeTime(60);
    });

    it('should apply SupplyAdjustment {MAX_SUPPLY - totalSupply}', async function () {
      // Supply is MAX_SUPPLY-1, exchangeRate is 2x; resulting in a new supply more than MAX_SUPPLY
      // However, supply is ONLY increased by 1 to MAX_SUPPLY
      r = await xETH.rebase({from: orchestrator});
      r.logs[0].args.requestedSupplyAdjustment.should.be.bignumber.eq(1);
    });
  });
});

contract('xETH:Rebase', async function (accounts) {
  before('setup xETH contract', setupContractsWithOpenRebaseWindow);

  describe('when xETH supply equals MAX_SUPPLY and rebase attempts to grow', function () {
    before(async function () {
      await mockExternalData(INITIAL_RATE_2X, INITIAL_CPI, MAX_SUPPLY);
      await chain.waitForSomeTime(60);
    });

    it('should not grow', async function () {
      r = await xETH.rebase({from: orchestrator});
      r.logs[0].args.requestedSupplyAdjustment.should.be.bignumber.eq(0);
    });
  });
});

contract('xETH:Rebase', async function (accounts) {
  before('setup xETH contract', setupContractsWithOpenRebaseWindow);

  describe('when the market oracle returns invalid data', function () {
    it('should fail', async function () {
      await mockExternalData(INITIAL_RATE_30P_MORE, INITIAL_CPI, 1000, false);
      await chain.waitForSomeTime(60);
      expect(
        await chain.isEthException(xETH.rebase({from: orchestrator}))
      ).to.be.true;
    });
  });

  describe('when the market oracle returns valid data', function () {
    it('should NOT fail', async function () {
      await mockExternalData(INITIAL_RATE_30P_MORE, INITIAL_CPI, 1000, true);
      await chain.waitForSomeTime(60);
      expect(
        await chain.isEthException(xETH.rebase({from: orchestrator}))
      ).to.be.false;
    });
  });
});

contract('xETH:Rebase', async function (accounts) {
  before('setup xETH contract', setupContractsWithOpenRebaseWindow);

  describe('when the cpi oracle returns invalid data', function () {
    it('should fail', async function () {
      await mockExternalData(INITIAL_RATE_30P_MORE, INITIAL_CPI, 1000, true, false);
      await chain.waitForSomeTime(60);
      expect(
        await chain.isEthException(xETH.rebase({from: orchestrator}))
      ).to.be.true;
    });
  });

  describe('when the cpi oracle returns valid data', function () {
    it('should NOT fail', async function () {
      await mockExternalData(INITIAL_RATE_30P_MORE, INITIAL_CPI, 1000, true, true);
      await chain.waitForSomeTime(60);
      expect(
        await chain.isEthException(xETH.rebase({from: orchestrator}))
      ).to.be.false;
    });
  });
});

contract('xETH:Rebase', async function (accounts) {
  before('setup xETH contract', setupContractsWithOpenRebaseWindow);

  describe('positive rate and no change CPI', function () {
    before(async function () {
      await mockExternalData(INITIAL_RATE_30P_MORE, INITIAL_CPI, 1000);
      await xETH.setRebaseTimingParameters(60, 0, 60);
      await chain.waitForSomeTime(60);
      await xETH.rebase({from: orchestrator});
      await chain.waitForSomeTime(59);
      prevEpoch = await xETH.epoch.call();
      prevTime = await xETH.lastRebaseTimestampSec.call();
      await mockExternalData(INITIAL_RATE_60P_MORE, INITIAL_CPI, 1010);
      r = await xETH.rebase({from: orchestrator});
    });

    it('should increment epoch', async function () {
      const epoch = await xETH.epoch.call();
      expect(prevEpoch.plus(1).eq(epoch));
    });

    it('should update lastRebaseTimestamp', async function () {
      const time = await xETH.lastRebaseTimestampSec.call();
      expect(time.minus(prevTime).eq(60)).to.be.true;
    });

    it('should emit Rebase with positive requestedSupplyAdjustment', async function () {
      const log = r.logs[0];
      expect(log.event).to.eq('LogRebase');
      expect(log.args.epoch.eq(prevEpoch.plus(1))).to.be.true;
      log.args.exchangeRate.should.be.bignumber.eq(INITIAL_RATE_60P_MORE);
      log.args.cpi.should.be.bignumber.eq(INITIAL_CPI);
      log.args.requestedSupplyAdjustment.should.be.bignumber.eq(20);
    });

    it('should call getData from the market oracle', async function () {
      const fnCalled = mockMarketOracle.FunctionCalled().formatter(r.receipt.logs[2]);
      expect(fnCalled.args.instanceName).to.eq('MarketOracle');
      expect(fnCalled.args.functionName).to.eq('getData');
      expect(fnCalled.args.caller).to.eq(xETH.address);
    });

    it('should call getData from the cpi oracle', async function () {
      const fnCalled = mockCpiOracle.FunctionCalled().formatter(r.receipt.logs[0]);
      expect(fnCalled.args.instanceName).to.eq('CpiOracle');
      expect(fnCalled.args.functionName).to.eq('getData');
      expect(fnCalled.args.caller).to.eq(xETH.address);
    });

    it('should call uFrag Rebase', async function () {
      prevEpoch = await xETH.epoch.call();
      const fnCalled = mockxETH.FunctionCalled().formatter(r.receipt.logs[4]);
      expect(fnCalled.args.instanceName).to.eq('xETH');
      expect(fnCalled.args.functionName).to.eq('rebase');
      expect(fnCalled.args.caller).to.eq(xETH.address);
      const fnArgs = mockxETH.FunctionArguments().formatter(r.receipt.logs[5]);
      const parsedFnArgs = Object.keys(fnArgs.args).reduce((m, k) => {
        return fnArgs.args[k].map(d => d.toNumber()).concat(m);
      }, [ ]);
      expect(parsedFnArgs).to.include.members([prevEpoch.toNumber(), 20]);
    });
  });
});

contract('xETH:Rebase', async function (accounts) {
  before('setup xETH contract', setupContractsWithOpenRebaseWindow);

  describe('negative rate', function () {
    before(async function () {
      await mockExternalData(INITIAL_RATE_30P_LESS, INITIAL_CPI, 1000);
      await chain.waitForSomeTime(60);
      r = await xETH.rebase({from: orchestrator});
    });

    it('should emit Rebase with negative requestedSupplyAdjustment', async function () {
      const log = r.logs[0];
      expect(log.event).to.eq('LogRebase');
      log.args.requestedSupplyAdjustment.should.be.bignumber.eq(-10);
    });
  });
});

contract('xETH:Rebase', async function (accounts) {
  before('setup xETH contract', setupContractsWithOpenRebaseWindow);

  describe('when cpi increases', function () {
    before(async function () {
      await mockExternalData(INITIAL_RATE, INITIAL_CPI_25P_MORE, 1000);
      await chain.waitForSomeTime(60);
      await xETH.setDeviationThreshold(0);
      r = await xETH.rebase({from: orchestrator});
    });

    it('should emit Rebase with negative requestedSupplyAdjustment', async function () {
      const log = r.logs[0];
      expect(log.event).to.eq('LogRebase');
      log.args.requestedSupplyAdjustment.should.be.bignumber.eq(-6);
    });
  });
});

contract('xETH:Rebase', async function (accounts) {
  before('setup xETH contract', setupContractsWithOpenRebaseWindow);

  describe('when cpi decreases', function () {
    before(async function () {
      await mockExternalData(INITIAL_RATE, INITIAL_CPI_25P_LESS, 1000);
      await chain.waitForSomeTime(60);
      await xETH.setDeviationThreshold(0);
      r = await xETH.rebase({from: orchestrator});
    });

    it('should emit Rebase with positive requestedSupplyAdjustment', async function () {
      const log = r.logs[0];
      expect(log.event).to.eq('LogRebase');
      log.args.requestedSupplyAdjustment.should.be.bignumber.eq(9);
    });
  });
});

contract('xETH:Rebase', async function (accounts) {
  before('setup xETH contract', setupContractsWithOpenRebaseWindow);

  describe('rate=TARGET_RATE', function () {
    before(async function () {
      await mockExternalData(INITIAL_RATE, INITIAL_CPI, 1000);
      await xETH.setDeviationThreshold(0);
      await chain.waitForSomeTime(60);
      r = await xETH.rebase({from: orchestrator});
    });

    it('should emit Rebase with 0 requestedSupplyAdjustment', async function () {
      const log = r.logs[0];
      expect(log.event).to.eq('LogRebase');
      log.args.requestedSupplyAdjustment.should.be.bignumber.eq(0);
    });
  });
});

contract('xETH:Rebase', async function (accounts) {
  let rbTime, rbWindow, minRebaseTimeIntervalSec, now, prevRebaseTime, nextRebaseWindowOpenTime,
    timeToWait, lastRebaseTimestamp;

  beforeEach('setup xETH contract', async function () {
    await setupContracts();
    await xETH.setRebaseTimingParameters(86400, 72000, 900);
    rbTime = await xETH.rebaseWindowOffsetSec.call();
    rbWindow = await xETH.rebaseWindowLengthSec.call();
    minRebaseTimeIntervalSec = await xETH.minRebaseTimeIntervalSec.call();
    now = new BigNumber(await chain.currentTime());
    prevRebaseTime = now.minus(now.mod(minRebaseTimeIntervalSec)).plus(rbTime);
    nextRebaseWindowOpenTime = prevRebaseTime.plus(minRebaseTimeIntervalSec);
  });

  describe('when its 5s after the rebase window closes', function () {
    it('should fail', async function () {
      timeToWait = nextRebaseWindowOpenTime.minus(now).plus(rbWindow).plus(5);
      await chain.waitForSomeTime(timeToWait.toNumber());
      await mockExternalData(INITIAL_RATE, INITIAL_CPI, 1000);
      expect(await xETH.inRebaseWindow.call()).to.be.false;
      expect(
        await chain.isEthException(xETH.rebase({from: orchestrator}))
      ).to.be.true;
    });
  });

  describe('when its 5s before the rebase window opens', function () {
    it('should fail', async function () {
      timeToWait = nextRebaseWindowOpenTime.minus(now).minus(5);
      await chain.waitForSomeTime(timeToWait.toNumber());
      await mockExternalData(INITIAL_RATE, INITIAL_CPI, 1000);
      expect(await xETH.inRebaseWindow.call()).to.be.false;
      expect(
        await chain.isEthException(xETH.rebase({from: orchestrator}))
      ).to.be.true;
    });
  });

  describe('when its 5s after the rebase window opens', function () {
    it('should NOT fail', async function () {
      timeToWait = nextRebaseWindowOpenTime.minus(now).plus(5);
      await chain.waitForSomeTime(timeToWait.toNumber());
      await mockExternalData(INITIAL_RATE, INITIAL_CPI, 1000);
      expect(await xETH.inRebaseWindow.call()).to.be.true;
      expect(
        await chain.isEthException(xETH.rebase({from: orchestrator}))
      ).to.be.false;
      lastRebaseTimestamp = await xETH.lastRebaseTimestampSec.call();
      expect(lastRebaseTimestamp.eq(nextRebaseWindowOpenTime)).to.be.true;
    });
  });

  describe('when its 5s before the rebase window closes', function () {
    it('should NOT fail', async function () {
      timeToWait = nextRebaseWindowOpenTime.minus(now).plus(rbWindow).minus(5);
      await chain.waitForSomeTime(timeToWait.toNumber());
      await mockExternalData(INITIAL_RATE, INITIAL_CPI, 1000);
      expect(await xETH.inRebaseWindow.call()).to.be.true;
      expect(
        await chain.isEthException(xETH.rebase({from: orchestrator}))
      ).to.be.false;
      lastRebaseTimestamp = await xETH.lastRebaseTimestampSec.call();
      expect(lastRebaseTimestamp.eq(nextRebaseWindowOpenTime)).to.be.true;
    });
  });
});
