'use strict';

// Interface definition
const emitter = () => {
  const events = {
    commit: { a: [], b: [], },
    rollback: { a: [], b: [], },
    timeout: { a: [], b: [], },
    set: { a: [], b: [], },
    get: { a: [], b: [], },
    revoke: { a: [], b: [], },
  };
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
      if (event.a.length && !event.b.length) event
        .a
        .forEach(listener => {
          listener();
        });
      if (event.b.length && !event.a.length) event
        .b
        .forEach(listener => {
          listener();
        });
      if (event.a.length && event.b.length) {
        event
          .b
          .forEach(listener => {
            listener();
          });
      }
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
const ee = emitter();


class Transaction {
  constructor() {
    this.delta = {};
  }

  static start(data) {
    const transaction = new Transaction();
    const { proxy, revoke } = Proxy.revocable(data, {

      get(target, key) {
        ee.emit('aget');
        if (key === 'delta') return transaction.delta;
        if (transaction
          .delta
          .hasOwnProperty(key)) return transaction.delta[key];
        return target[key];
      },
      getOwnPropertyDescriptor: (target, key) => (
        Object.getOwnPropertyDescriptor(
          transaction
            .delta
            .hasOwnProperty(key) ? transaction.delta : target, key
        )
      ),
      ownKeys() {
        const changes = Object.keys(transaction.delta);
        const keys = Object.keys(data).concat(changes);
        return keys.filter((x, i, a) => a.indexOf(x) === i);
      },
      set(target, key, val) {
        ee.emit('bset');
        console.log('set', key, val);
        if (target[key] === val) delete transaction.delta[key];
        else transaction.delta[key] = val;
        ee.emit('aset');
        return true;
      }
    });
    transaction.data = data;
    transaction.rev = revoke;
    return [proxy, transaction];
  }

  commit() {
    ee.emit('bcommit');
    console.log('\ncommit transaction');
    Object.assign(this.data, this.delta);
    this.delta = {};
    ee.emit('acommit');
  }
  rollback() {
    ee.emit('brollback');
    console.log('\nrollback transaction');
    this.delta = {};
    ee.emit('arollback');
  }
  revoke() {
    ee.emit('brevoke');
    console.log('\nrevoke trasaction');
    this.rev();
    ee.emit('arevoke');
  }
  timeout(msec) {
    ee.emit('btimeout');
    setTimeout(() => {
      this.rollback();
      //this.commit();
      ee.emit('atimeout');
    }, msec);
  }
  before(event, listener) {
    ee.once('b' + event, listener);
  }
  after(event, listener) {
    ee.once('a' + event, listener);
  }
  // Events: commit, rollback, revoke, set, get, timeout
}

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
