'use strict';

const event = () => ({ a: [], b: [] });
const exec = fn => fn();

// Interface definition
const emitter = () => {
  const eventNames = ['commit', 'rollback', 'timeout', 'set', 'get', 'revoke'];
  const events = eventNames.reduce((acc, item) => acc[item] = event(), {});
  const ee = {
    on: (name, callback) => {
      const i = name[0];
      name = name.slice(1);
      const event = events[name][i];
      if (event) event.push(callback);
    },

    emit: name => {
      name = name.slice(1);
      const event = events[name];
      if (event.a.length && !event.b.length) event.a.forEach(exec);
      if (event.b.length && !event.a.length) event.b.forEach(exec);
      if (event.a.length && event.b.length) event.b.forEach(exec);
    },

    once: (name, listener) => {
      const rm = () => {
        ee.remove(name, rm);
        listener();
      };
      ee.on(name, rm);
    },

    remove: (name, func) => {
      const i = name[0];
      name = name.slice(1);
      const event = events[name][i];
      if (!event) return;
      const l = event.indexOf(func);
      if (l !== -1) event.splice(l, 1);
    },
  };
  return ee;
};

class Transaction {
  constructor() {
    this.delta = {};
  }

  static start(data) {
    const transaction = new Transaction();
    const { proxy, revoke } = Proxy.revocable(data, {
      get(target, key) {
        const { delta } = transaction;
        Transaction.ee.emit('aget');
        if (key === 'delta') return delta;
        if (delta.hasOwnProperty(key)) return delta[key];
        return target[key];
      },

      getOwnPropertyDescriptor: (target, key) => {
        const { delta } = transaction;
        const that = delta.hasOwnProperty(key) ? delta : target;
        return Object.getOwnPropertyDescriptor(that, key);
      },

      ownKeys() {
        const changes = Object.keys(transaction.delta);
        const keys = Object.keys(data).concat(changes);
        return keys.filter((x, i, a) => a.indexOf(x) === i);
      },

      set(target, key, val) {
        const { delta } = transaction;
        Transaction.ee.emit('bset');
        console.log('set', key, val);
        if (target[key] === val) delete delta[key];
        else delta[key] = val;
        Transaction.ee.emit('aset');
        return true;
      }
    });
    transaction.data = data;
    transaction.rev = revoke;
    return [proxy, transaction];
  }

  commit() {
    Transaction.ee.emit('bcommit');
    console.log('\ncommit transaction');
    Object.assign(this.data, this.delta);
    this.delta = {};
    Transaction.ee.emit('acommit');
  }

  rollback() {
    Transaction.ee.emit('brollback');
    console.log('\nrollback transaction');
    this.delta = {};
    Transaction.ee.emit('arollback');
  }

  revoke() {
    Transaction.ee.emit('brevoke');
    console.log('\nrevoke trasaction');
    this.rev();
    Transaction.ee.emit('arevoke');
  }

  timeout(msec) {
    Transaction.ee.emit('btimeout');
    setTimeout(() => {
      this.rollback();
      Transaction.ee.emit('atimeout');
    }, msec);
  }

  before(event, listener) {
    Transaction.ee.once('b' + event, listener);
  }

  after(event, listener) {
    Transaction.ee.once('a' + event, listener);
  }
  // Events: commit, rollback, revoke, set, get, timeout
}

Transaction.ee = emitter();

// Usage

const data = { name: 'Marcus Aurelius', born: 121 };

const [obj, transaction] = Transaction.start(data);
console.dir({ data });

obj.name = 'Mao Zedong';
obj.born = 1893;
obj.city = 'Shaoshan';
obj.age = (
  new Date().getFullYear() -
  new Date(obj.born + '').getFullYear()
);

console.dir({ obj });
console.dir({ delta: transaction.delta });

transaction.commit();
console.dir({ data });
console.dir({ obj });
console.dir({ delta: transaction.delta });

obj.born = 1976;
console.dir({ obj });
console.dir({ delta: transaction.delta });

transaction.before('rollback', () => {
  console.log('\nbefore rollback');
});
transaction.after('rollback', () => {
  console.log('\nafter rollback');
});

transaction.rollback();
console.dir({ data });
console.dir({ obj });
console.dir({ delta: transaction.delta });

transaction.revoke();
console.log(obj.name);
