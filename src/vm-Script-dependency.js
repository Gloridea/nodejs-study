class Dep {
    constructor() {
        this.count = 0;
    }

    increment() {
        this.count++;
    }
}

module.exports = new Dep();