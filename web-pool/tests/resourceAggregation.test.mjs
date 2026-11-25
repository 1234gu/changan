import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { createServer } from 'vite';

const vite = await createServer({
  configFile: false,
  appType: 'custom',
  server: { middlewareMode: true },
});
const { aggregateComputePool } = await vite.ssrLoadModule('/src/services/resourceAggregation.ts');

after(() => vite.close());

const resource = (total, used, unit, utilization) => ({
  total,
  used,
  allocated: used,
  available: total - used,
  utilization,
  runtimeUtilization: utilization,
  unit,
});

const capacity = (total, used) => ({
  total,
  used,
  available: total - used,
  utilization: Number(((used / total) * 100).toFixed(1)),
  unit: 'GB',
});

function makeNode(id, options = {}) {
  const status = options.status ?? 'online';
  const approved = options.approved ?? true;
  return {
    id,
    name: `node-${id}`,
    nodeSource: 'agent',
    nodeType: 'vehicle',
    platform: 'Thor',
    architecture: 'arm64',
    cluster: { id: 'cluster-a', name: 'cluster-a' },
    operationalStatus: status,
    connectivityStatus:
      status === 'offline' ? 'offline' : status === 'suspect' ? 'suspect' : 'online',
    healthStatus: status === 'abnormal' ? 'unhealthy' : 'healthy',
    accessStatus: 'registered',
    registrationStatus: options.registrationStatus ?? 'registered',
    everApproved: approved,
    authorizationStatus: approved ? 'approved' : 'pending',
    poolMembership: options.poolMembership ?? 'in_pool',
    schedulable: options.schedulable ?? status === 'online',
    heartbeatAt: '2026-11-24T00:00:00Z',
    resources: {
      cpu: resource(options.cpu ?? 14, options.cpuUsed ?? 2, 'Core', options.cpuUtilization ?? 10),
      gpu: resource(1, 0, 'GPU', options.gpuUtilization ?? 25),
      npu: resource(options.npu ?? 16, 0, 'TOPS', 30),
      dla: resource(options.dla ?? 2, 0, 'Device', 40),
    },
    memory: capacity(options.memory ?? 64, options.memoryUsed ?? 16),
    videoMemory: capacity(options.vram ?? 8, options.vramUsed ?? 2),
    storage: capacity(options.storage ?? 200, options.storageUsed ?? 50),
    network: {
      interfaceName: 'eth0',
      ipv4Address: '192.0.2.1',
      linkStatus: 'up',
    },
    gpuDetails: {
      supported: true,
      available: true,
      deviceCount: 1,
      totalVramBytes: (options.vram ?? 8) * 1024 ** 3,
      usedVramBytes: (options.vramUsed ?? 2) * 1024 ** 3,
      availableVramBytes: ((options.vram ?? 8) - (options.vramUsed ?? 2)) * 1024 ** 3,
      utilizationPercent: options.gpuUtilization ?? 25,
      devices: [],
      memoryArchitecture: 'dedicated',
    },
    npuSupport: { supported: true, available: true, tops: options.npu ?? 16 },
    dlaSupport: { supported: true, available: true, deviceCount: options.dla ?? 2 },
    labels: [],
    agentVersion: 'test',
    currentTasks: [],
  };
}

const first = () => makeNode('a');
const second = (overrides = {}) =>
  makeNode('b', {
    cpu: 8,
    cpuUsed: 6,
    cpuUtilization: 90,
    memory: 32,
    memoryUsed: 24,
    vram: 4,
    vramUsed: 3,
    storage: 100,
    storageUsed: 75,
    npu: 8,
    dla: 1,
    gpuUtilization: 75,
    ...overrides,
  });

function assertFirstNodeOnly(summary) {
  assert.equal(summary.resources.cpu.total, 14);
  assert.equal(summary.resources.cpu.used, 2);
  assert.equal(summary.resources.cpu.runtimeUtilizationPercent, 10);
  assert.equal(summary.resources.gpu.total, 1);
  assert.equal(summary.resources.npu.total, 16);
  assert.equal(summary.resources.dla.total, 2);
  assert.equal(summary.supportingResources.videoMemory.total, 8);
  assert.equal(summary.supportingResources.memory.total, 64);
  assert.equal(summary.supportingResources.memory.used, 16);
  assert.equal(summary.supportingResources.storage.total, 200);
}

test('all ONLINE in-pool nodes contribute to every current resource metric', () => {
  const summary = aggregateComputePool([first(), second()]);

  assert.equal(summary.resources.cpu.total, 22);
  assert.equal(summary.resources.gpu.total, 2);
  assert.equal(summary.resources.npu.total, 24);
  assert.equal(summary.resources.dla.total, 3);
  assert.equal(summary.supportingResources.videoMemory.total, 12);
  assert.equal(summary.supportingResources.memory.total, 96);
  assert.equal(summary.supportingResources.storage.total, 300);
  assert.equal(summary.resources.cpu.runtimeUtilizationPercent, 39.1);
  assert.equal(summary.clusters[0].nodeCount, 2);
});

for (const status of ['offline', 'suspect', 'abnormal']) {
  test(`${status} node keeps its source row but contributes zero current capacity`, () => {
    const summary = aggregateComputePool([first(), second({ status })]);

    assertFirstNodeOnly(summary);
    assert.equal(summary.sources.length, 2);
    assert.equal(summary.sources[1].resources.cpu.total, 0);
    assert.equal(summary.sources[1].memory.total, 0);
    assert.equal(summary.sources[1].storage.total, 0);
    assert.equal(summary.clusters[0].nodeCount, 2);
    assert.equal(summary.clusters[0].resources.cpu.total, 14);
  });
}

test('recovered node automatically rejoins current capacity', () => {
  const offline = aggregateComputePool([first(), second({ status: 'offline' })]);
  const recovered = aggregateComputePool([first(), second({ status: 'online' })]);

  assertFirstNodeOnly(offline);
  assert.equal(recovered.resources.cpu.total, 22);
  assert.equal(recovered.supportingResources.memory.total, 96);
});

test('removed and unapproved nodes do not enter the pool source set', () => {
  const summary = aggregateComputePool([
    first(),
    second({ poolMembership: 'removed' }),
    second({ approved: false }),
  ]);

  assertFirstNodeOnly(summary);
  assert.equal(summary.sources.length, 1);
});

test('ONLINE paused node keeps physical total and contributes no schedulable capacity', () => {
  const summary = aggregateComputePool([first(), second({ schedulable: false })]);

  assert.equal(summary.resources.cpu.total, 22);
  assert.equal(summary.resources.cpu.schedulableAvailable, 12);
  assert.equal(summary.supportingResources.memory.total, 96);
  assert.equal(summary.supportingResources.memory.schedulableAvailable, 48);
  assert.equal(summary.sources[1].supplyEligible, false);
  assert.equal(summary.schedulerCandidates.length, 1);
});
