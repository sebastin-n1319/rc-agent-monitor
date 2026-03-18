"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.delay = void 0;
var delay = function (timeout) {
    return new Promise(function (resolve, reject) {
        setTimeout(function () {
            resolve(null);
        }, timeout);
    });
};
exports.delay = delay;
//# sourceMappingURL=utils.js.map