/* eslint-disable no-unused-vars */
const helper = require('node-red-node-test-helper');
const configNode = require('../../nodes/config.js');
const hsmNode = require('../../nodes/hsm.js');

describe('Hubitat HSM Node', () => {
  const defaultConfigNode = {
    id: 'n0',
    type: 'hubitat config',
    name: 'test config name',
    usetls: false,
    host: 'localhost',
    port: 10234,
    appId: 1,
    nodeRedServer: 'localhost',
    webhookPath: '/hubitat/webhook',
  };
  const defaultHsmNode = {
    id: 'n1',
    type: 'hubitat hsm',
    name: 'test hsm name',
    server: 'n0',
    sendEvent: true,
  };

  afterEach(() => {
    helper.unload();
  });

  it('should be loaded', (done) => {
    const flow = [defaultHsmNode];
    helper.load(hsmNode, flow, () => {
      const n1 = helper.getNode('n1');
      try {
        n1.should.have.property('name', 'test hsm name');
        n1.should.have.property('sendEvent', true);
        done();
      } catch (err) {
        done(err);
      }
    });
  });
  it('should send event when event received', (done) => {
    const flow = [
      defaultConfigNode,
      { ...defaultHsmNode, sendEvent: true, wires: [['n2']] },
      { id: 'n2', type: 'helper' },
    ];
    const hubitatEvent = {
      name: 'hsmStatus',
      value: 'armNight',
      displayName: 'Hubitat',
      descriptionText: 'hsmEvent',
    };
    helper.load([hsmNode, configNode], flow, () => {
      const n1 = helper.getNode('n1');
      const n2 = helper.getNode('n2');
      n1.currentHsm = 'disarmed';
      n2.on('input', (msg) => {
        try {
          msg.should.have.property('payload', hubitatEvent);
          done();
        } catch (err) {
          done(err);
        }
      });
      n1.hubitat.hubitatEvent.emit('hsm', hubitatEvent);
    });
  });
  it('should send event when hsmAlert cancel event received', (done) => {
    const flow = [
      defaultConfigNode,
      { ...defaultHsmNode, sendEvent: true, wires: [['n2']] },
      { id: 'n2', type: 'helper' },
    ];
    const hubitatEvent = { name: 'hsmAlert', value: 'cancel' };
    helper.load([hsmNode, configNode], flow, () => {
      const n1 = helper.getNode('n1');
      const n2 = helper.getNode('n2');
      n1.currentHsm = 'disarmed';
      n1.alert = true;
      n2.on('input', (msg) => {
        try {
          msg.payload.should.have.property('value', 'cancel');
          n1.should.have.property('alert', false);
          done();
        } catch (err) {
          done(err);
        }
      });
      n1.hubitat.hubitatEvent.emit('hsm', hubitatEvent);
    });
  });
  it('should send event when hsmAlert event received', (done) => {
    const flow = [
      defaultConfigNode,
      { ...defaultHsmNode, sendEvent: true, wires: [['n2']] },
      { id: 'n2', type: 'helper' },
    ];
    const hubitatEvent = { name: 'hsmAlert', value: 'intrusion-home' };
    helper.load([hsmNode, configNode], flow, () => {
      const n1 = helper.getNode('n1');
      const n2 = helper.getNode('n2');
      n1.currentHsm = 'armHome';
      n1.alert = false;
      n2.on('input', (msg) => {
        try {
          msg.payload.should.have.property('value', 'intrusion-home');
          n1.should.have.property('alert', true);
          n1.should.have.property('currentHsm', 'armHome');
          done();
        } catch (err) {
          done(err);
        }
      });
      n1.hubitat.hubitatEvent.emit('hsm', hubitatEvent);
    });
  });
  it('should send event when hsmStatus event received', (done) => {
    const flow = [
      defaultConfigNode,
      { ...defaultHsmNode, sendEvent: true, wires: [['n2']] },
      { id: 'n2', type: 'helper' },
    ];
    const hubitatEvent = { name: 'hsmStatus', value: 'armNight' };
    helper.load([hsmNode, configNode], flow, () => {
      const n1 = helper.getNode('n1');
      const n2 = helper.getNode('n2');
      n1.currentHsm = 'disarmed';
      n2.on('input', (msg) => {
        try {
          msg.payload.should.have.property('value', hubitatEvent.value);
          done();
        } catch (err) {
          done(err);
        }
      });
      n1.hubitat.hubitatEvent.emit('hsm', hubitatEvent);
    });
  });
  it('should send event when hsmAlert event received', (done) => {
    const flow = [
      defaultConfigNode,
      { ...defaultHsmNode, sendEvent: true, wires: [['n2']] },
      { id: 'n2', type: 'helper' },
    ];
    const hubitatEvent = { name: 'hsmAlert', value: 'armNight' };
    helper.load([hsmNode, configNode], flow, () => {
      const n1 = helper.getNode('n1');
      const n2 = helper.getNode('n2');
      n1.currentHsm = 'disarmed';
      n2.on('input', (msg) => {
        try {
          msg.payload.should.have.property('value', hubitatEvent.value);
          done();
        } catch (err) {
          done(err);
        }
      });
      n1.hubitat.hubitatEvent.emit('hsm', hubitatEvent);
    });
  });
  it('should not send event when unknown event received', (done) => {
    const flow = [
      defaultConfigNode,
      { ...defaultHsmNode, sendEvent: true, wires: [['n2']] },
      { id: 'n2', type: 'helper' },
    ];
    const hubitatEvent = { name: 'unknown', value: 'armNight' };
    helper.load([hsmNode, configNode], flow, () => {
      const n1 = helper.getNode('n1');
      const n2 = helper.getNode('n2');
      let inError = false;
      n2.on('input', (msg) => {
        inError = true;
      });
      n1.hubitat.hubitatEvent.emit('hsm', hubitatEvent);
      setTimeout(() => {
        if (inError) {
          done(new Error('unknown event allowed though'));
        } else {
          done();
        }
      }, 20);
    });
  });
  it('should use dot shape icon when send event', (done) => {
    const flow = [{ ...defaultHsmNode, sendEvent: true }];
    helper.load(hsmNode, flow, () => {
      const n1 = helper.getNode('n1');
      try {
        n1.should.have.property('shape', 'dot');
        done();
      } catch (err) {
        done(err);
      }
    });
  });
  it('should use ring shape icon when send event', (done) => {
    const flow = [{ ...defaultHsmNode, sendEvent: false }];
    helper.load(hsmNode, flow, () => {
      const n1 = helper.getNode('n1');
      try {
        n1.should.have.property('shape', 'ring');
        done();
      } catch (err) {
        done(err);
      }
    });
  });
  it('should send event when systemStart received and desynchronized', (done) => {
    const flow = [
      defaultConfigNode,
      { ...defaultHsmNode, wires: [['n2']] },
      { id: 'n2', type: 'helper' },
    ];
    helper.load([hsmNode, configNode], flow, () => {
      const n1 = helper.getNode('n1');
      const n2 = helper.getNode('n2');
      n1.currentHsm = 'disarmed';
      n1.hubitat.getHsm = () => new Promise((res) => res({ hsm: 'armNight' }));
      n2.on('input', (msg) => {
        try {
          msg.payload.should.have.property('value', 'armNight');
          done();
        } catch (err) {
          done(err);
        }
      });
      n1.hubitat.hubitatEvent.emit('systemStart');
    });
  });
  it('should not send event when systemStart received and synchronized', (done) => {
    const flow = [
      defaultConfigNode,
      { ...defaultHsmNode, wires: [['n2']] },
      { id: 'n2', type: 'helper' },
    ];
    helper.load([hsmNode, configNode], flow, () => {
      const n1 = helper.getNode('n1');
      const n2 = helper.getNode('n2');
      n1.currentHsm = 'armNight';
      n1.hubitat.getHsm = () => new Promise((res) => res({ hsm: 'armNight' }));
      let inError = false;
      n2.on('input', () => {
        inError = true;
      });
      n1.hubitat.hubitatEvent.emit('systemStart');
      setTimeout(() => {
        if (inError) {
          done(new Error('synchronized state send event'));
        } else {
          done();
        }
      }, 20);
    });
  });
});
